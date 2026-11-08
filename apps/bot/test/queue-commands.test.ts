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
    playNow: mock(async () => true),
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
    expect(reply.pager?.render(1)?.description).toContain("**11)** **[T11]");
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
    const choices = await command("playat").autocomplete?.(ctx(), music([track("a"), track("b")]), "");
    expect(choices).toEqual([
      { name: "1. ถัดจากเพลงปัจจุบัน (ลำดับแรก)", value: "1" },
      { name: "3. ท้ายคิว", value: "3" },
      { name: "2. ลำดับที่ 2", value: "2" },
    ]);
  });

  test("/playqueue autocomplete lists queued tracks; running it plays that one now", async () => {
    const m = music([track("a"), track("b")]);
    expect(await command("playqueue").autocomplete?.(ctx(), m, "b")).toEqual([{ name: "2. (b Artist) b", value: "2" }]);
    const reply = await command("playqueue").run(ctx({ song: "2" }), m);
    expect((m.playNow as ReturnType<typeof mock>).mock.calls[0]?.[1]).toBe(1);
    expect(text(reply)).toContain("Skipped ไปคิวเพลง");
  });

  test("/skipplay needs something playing", async () => {
    const idle = music([], { status: mock(() => null) as never });
    const reply = await command("skipplay").run(ctx({ query: "x" }), idle);
    expect(reply.notice.color).toBe(COLOR_FAILURE);
    expect(text(reply)).toBe("> `❌` ไม่มีเพลงก่อนหน้า");
  });
});
