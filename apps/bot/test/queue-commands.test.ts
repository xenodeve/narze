import { describe, expect, mock, test } from "bun:test";
import type { Track } from "@narze/shared";
import { commands } from "../src/commands";
import type { CommandContext, Reply } from "../src/commands/types";
import { COLOR_FAILURE } from "../src/music/format";
import type { Music } from "../src/music/music";

const dee = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const track = (title: string, durationMs = 60_000): Track => ({
  uri: `https://music.youtube.com/watch?v=${title}`,
  source: "youtubemusic",
  title,
  author: `${title} Artist`,
  durationMs,
  artworkUrl: null,
  requester: dee,
});

function ctx(options: Record<string, string | number> = {}): CommandContext {
  return {
    guildId: "980000000000000001",
    channelId: "71",
    user: dee,
    memberVoiceChannelId: "70",
    canSpeakIn: () => true,
    option: (name) => options[name] ?? null,
    latencyMs: { reply: 1, ws: 1 },
  };
}

function music(queue: Track[], over: Partial<Music> = {}): Music {
  return {
    status: mock(() => ({
      voiceChannelId: "70",
      current: track("Now", 200_000),
      playing: true,
      paused: false,
      volume: 15,
      positionMs: 0,
      loop: "off",
      queue,
    })),
    play: mock(async () => ({ kind: "queued", track: track("New"), position: 1 })),
    clear: mock(async () => true),
    setLoop: mock(async (_g: string, mode: string | null) => mode ?? "track"),
    playNow: mock(async () => "ok"),
    setTwentyFourSeven: mock(async () => true),
    suggest: mock(async (q: string) => [{ name: `(A) ${q}`, value: `https://x.test/${q}` }]),
    suggestionStats: mock(() => ({ entries: 3, bytes: 2048, oldestAt: 1_700_000_000_000 })),
    clearSuggestions: mock(() => {}),
    ...over,
  } as unknown as Music;
}

const command = (name: string) => {
  const found = commands.find((c) => c.data.name === name);
  if (!found) throw new Error(`no /${name}`);
  return found;
};
const text = (r: Reply) => r.notice.description ?? "";

describe("/queue (spec #8)", () => {
  test("shows what is playing and 10 tracks per page with the total time", async () => {
    const queue = Array.from({ length: 12 }, (_, i) => track(`T${i + 1}`));
    const reply = await command("queue").run(ctx(), music(queue));
    expect(text(reply)).toContain("**กำลังเล่น:**");
    expect(text(reply)).toContain("**คิวเพลง:** (12 เพลง - หน้า 1/2)");
    expect(text(reply)).toContain("**1)** **[T1]");
    expect(text(reply)).not.toContain("**11)**");
    expect(text(reply)).toContain("**เวลารวมคิว:** ` 12:00 `");
    expect(reply.pager?.pages).toBe(2);
    expect(reply.pager?.render(1)?.notice.description).toContain("**11)** **[T11]");
  });

  test("each click re-counts the pages: the queue may have grown or shrunk since the command (#102)", async () => {
    let queue = Array.from({ length: 12 }, (_, i) => track(`T${i + 1}`));
    const m = music([], { status: mock(() => ({ ...music(queue).status("g"), queue })) as never });
    const reply = await command("queue").run(ctx(), m);
    queue = Array.from({ length: 25 }, (_, i) => track(`T${i + 1}`));
    expect(reply.pager?.render(2)).toMatchObject({ page: 2, pages: 3 });
    queue = queue.slice(0, 5);
    const shrunk = reply.pager?.render(1);
    expect(shrunk).toMatchObject({ page: 0, pages: 1 });
    expect(shrunk?.notice.description).toContain("**1)** **[T1]");
  });

  test("an empty queue says so, with no pages", async () => {
    const reply = await command("queue").run(ctx(), music([]));
    expect(text(reply)).toContain("**คิวเพลง:** ` ว่างเปล่า `");
    expect(reply.pager).toBeUndefined();
  });
});

describe("/clear, /loop", () => {
  test("/clear reports how many tracks it removed", async () => {
    const reply = await command("clear").run(ctx(), music([track("a"), track("b")]));
    expect(text(reply)).toBe("> `🧹` | **เคลียร์คิวแล้ว** (`2` เพลง)");
  });

  test("/clear on an empty queue is refused", async () => {
    expect(text(await command("clear").run(ctx(), music([])))).toBe("> `❌` ไม่มีเพลงในคิว");
  });

  test("/loop current toggles the track loop (spec #9)", async () => {
    const m = music([]);
    expect(text(await command("loop").run(ctx({ mode: "current" }), m))).toBe("> `🔂` | ลูปเพลง: `ปัจจุบัน`");
    const looping = music([], {
      status: mock(() => ({
        voiceChannelId: "70",
        current: track("Now"),
        playing: true,
        paused: false,
        volume: 15,
        positionMs: 0,
        loop: "track",
        queue: [],
      })) as never,
    });
    expect(text(await command("loop").run(ctx({ mode: "current" }), looping))).toBe("> `🚫` | ลูปเพลง: `ปิด`");
  });

  test("/loop off when already off is refused privately", async () => {
    const reply = await command("loop").run(ctx({ mode: "off" }), music([]));
    expect(reply.ephemeral).toBe(true);
    expect(text(reply)).toBe("> `🚫` | ลูปเพลงปิดอยู่แล้ว");
  });
});

describe("/playnext, /playat, /playqueue, /skipplay (spec #7)", () => {
  test("/playnext asks for the head of the queue", async () => {
    const m = music([]);
    expect(text(await command("playnext").run(ctx({ query: "x" }), m))).toContain("> ลำดับ: ` 1 `");
    expect((m.play as ReturnType<typeof mock>).mock.calls[0]?.[0]).toMatchObject({ next: true });
  });

  test("/playat takes a 1-based position and refuses a bad one", async () => {
    const m = music([track("a"), track("b")]);
    await command("playat").run(ctx({ query: "x", position: "2" }), m);
    expect((m.play as ReturnType<typeof mock>).mock.calls[0]?.[0]).toMatchObject({ position: 1 });
    expect(text(await command("playat").run(ctx({ query: "x", position: "0" }), m))).toBe("> `❌` ตำแหน่งไม่ถูกต้อง");
  });

  test("/playat autocomplete offers next, end and each position", async () => {
    const choices = await command("playat").autocomplete?.(ctx(), music([track("a"), track("b")]), "", "position");
    expect(choices).toEqual([
      { name: "1. ถัดจากเพลงปัจจุบัน (ลำดับแรก)", value: "1" },
      { name: "3. ท้ายคิว", value: "3" },
      { name: "2. ลำดับที่ 2", value: "2" },
    ]);
  });

  test("/playqueue autocomplete names the track it means; running it plays that one now", async () => {
    const m = music([track("a"), track("b")]);
    const b = track("b").uri;
    expect(await command("playqueue").autocomplete?.(ctx(), m, "b", "song")).toEqual([
      { name: "2. (b Artist) b", value: `2|${b}` },
    ]);
    const reply = await command("playqueue").run(ctx({ song: `2|${b}` }), m);
    expect((m.playNow as ReturnType<typeof mock>).mock.calls[0]?.slice(1)).toEqual([1, b]);
    expect(text(reply)).toContain("Skipped ไปคิวเพลง");
  });

  test("/playqueue refuses when the queue moved since the choice was offered (#102)", async () => {
    // The choice was b at 2; a track ended, so b is now at 1 and 2 is something else.
    const m = music([track("b"), track("c")]);
    const reply = await command("playqueue").run(ctx({ song: `2|${track("b").uri}` }), m);
    expect(m.playNow).not.toHaveBeenCalled();
    expect(text(reply)).toBe("> `❌` คิวเปลี่ยนไปแล้ว ลองเลือกเพลงใหม่อีกครั้ง");
    const raced = music([track("a"), track("b")], { playNow: mock(async () => "stale") as never });
    expect(text(await command("playqueue").run(ctx({ song: `2|${track("b").uri}` }), raced))).toBe(
      "> `❌` คิวเปลี่ยนไปแล้ว ลองเลือกเพลงใหม่อีกครั้ง",
    );
  });

  test("/skipplay needs something playing", async () => {
    const idle = music([], { status: mock(() => null) as never });
    const reply = await command("skipplay").run(ctx({ query: "x" }), idle);
    expect(reply.notice.color).toBe(COLOR_FAILURE);
    expect(text(reply)).toBe("> `❌` ไม่มีเพลงก่อนหน้า");
  });
});

describe("/247 (spec #10)", () => {
  test("toggles 24/7 with v5's replies", async () => {
    expect(text(await command("247").run(ctx(), music([])))).toBe("> `🌕` | *โหมด 24/7 :* ` เปิดการใช้งาน `");
    const off = music([], { setTwentyFourSeven: mock(async () => false) as never });
    expect(text(await command("247").run(ctx(), off))).toBe("> `🌙` | *โหมด 24/7 :* ` ปิดการใช้งาน `");
    expect(command("247").data.description).toBe("Toggle 24/7 mode - keeps bot online in voice channel");
  });

  test("needs the Bot, and the member in its voice channel", async () => {
    const none = music([], { status: mock(() => null) as never });
    expect(text(await command("247").run(ctx(), none))).toBe("> `❌` ไม่มีบอทในห้อง");
    const elsewhere = { ...ctx(), memberVoiceChannelId: "99" };
    expect(text(await command("247").run(elsewhere, music([])))).toBe("> `❌` คุณต้องอยู่ในห้องเดียวกับบอท");
  });
});

describe("playlist replies (#104, spec #4)", () => {
  const added = (started: boolean, firstPosition = 1) => ({
    kind: "playlist" as const,
    playlist: {
      name: "Anime Hits",
      url: "https://x.test/p",
      count: 3,
      durationMs: 600_000,
      thumbnail: "https://i.test/p.jpg",
    },
    started,
    firstPosition,
  });

  test("/play of a playlist while playing lists name, time, count, queue size and room", async () => {
    const m = music([track("a"), track("b"), track("c"), track("d")], {
      play: mock(async () => added(false, 2)) as never,
    });
    const reply = await command("play").run(ctx({ query: "https://x.test/p" }), m);
    expect(text(reply)).toBe(
      "> `📝` **Playlist:** Anime Hits\n> `⌛` **เวลา:** ` 10:00 ` \n> `📊` **มี:** ` 3 ` เพลง \n> **คิวทั้งหมด:** ` 4 ` เพลง \n> **ห้อง:** <#70>",
    );
    expect(reply.notice.author).toMatchObject({ name: "Go to Playlist", url: "https://x.test/p" });
    expect(reply.notice.thumbnailUrl).toBe("https://i.test/p.jpg");
  });

  test("from idle it starts with 📙 and no queue line; /playnext says where it landed", async () => {
    const idle = music([], { play: mock(async () => added(true)) as never });
    expect(text(await command("play").run(ctx({ query: "https://x.test/p" }), idle))).toBe(
      "> `📙` **Playlist:** Anime Hits\n> `⌛` **เวลา:** ` 10:00 ` \n> `📊` **มี:** ` 3 ` เพลง \n> **ห้อง:** <#70>",
    );
    const next = music([track("a"), track("b"), track("c")], { play: mock(async () => added(false)) as never });
    expect(text(await command("playnext").run(ctx({ query: "https://x.test/p" }), next))).toBe(
      "> `📝` **Playlist:** Anime Hits\n> `⌛` **เวลา:** ` 10:00 ` \n> `📊` **มี:** ` 3 ` เพลง \n> **ลำดับ:** ` 1 ถึง 3 ` \n> **คิวทั้งหมด:** ` 3 ` เพลง \n> **ห้อง:** <#70>",
    );
  });
});

describe("search autocomplete and /cache (#104, spec #2, #69)", () => {
  test("/play, /playnext, /playat's query and /skipplay suggest tracks", async () => {
    for (const name of ["play", "playnext", "skipplay"]) {
      expect(await command(name).autocomplete?.(ctx(), music([]), "idol", "query")).toEqual([
        { name: "(A) idol", value: "https://x.test/idol" },
      ]);
    }
    expect(await command("playat").autocomplete?.(ctx(), music([]), "idol", "query")).toEqual([
      { name: "(A) idol", value: "https://x.test/idol" },
    ]);
    expect((await command("playat").autocomplete?.(ctx(), music([]), "", "position"))?.[0]?.name).toContain(
      "แทรกเป็นเพลงแรก",
    );
  });

  test("/skipplay with nothing playing says it cannot skip", async () => {
    const idle = music([], { status: mock(() => null) as never });
    expect(await command("skipplay").autocomplete?.(ctx(), idle, "x", "query")).toEqual([
      { name: "ไม่มีเพลงก่อนหน้า ไม่สามารถใช้ skipplay ได้", value: "nobeforsong_error" },
    ]);
  });

  test("a suggestion that was an error is refused when run (v5 sentinels)", async () => {
    const m = music([]);
    expect(text(await command("play").run(ctx({ query: "no_song" }), m))).toBe("> `❌` กรุณาระบุเพลง");
    expect(text(await command("play").run(ctx({ query: "error" }), m))).toBe("> `❌` กรุณาระบุเพลงที่ถูกต้อง");
    expect(m.play).not.toHaveBeenCalled();
  });

  test("/cache stats and clear, privately", async () => {
    const m = music([]);
    const stats = await command("cache").run(ctx({ action: "stats" }), m);
    expect(stats.ephemeral).toBe(true);
    expect(stats.notice).toMatchObject({
      title: "📊 Cache Statistics",
      footer: "Cache จะหมดอายุภายใน 30 นาที",
      fields: [
        { name: "📁 จำนวนรายการ cache", value: "`3` รายการ", inline: true },
        { name: "💾 ขนาดรวม", value: "`2.00` KB", inline: true },
        { name: "📅 รายการเก่าสุด", value: "<t:1700000000:R>", inline: true },
      ],
    });
    const cleared = await command("cache").run(ctx({ action: "clear" }), m);
    expect(m.clearSuggestions).toHaveBeenCalled();
    expect(cleared.notice).toMatchObject({
      title: "🗑️ Cache Cleared",
      description: "✅ ลบ cache ทั้งหมดแล้ว\n\n📊 **ก่อนลบ:**\n• รายการ: `3`\n• ขนาด: `2.00 KB`",
    });
  });
});
