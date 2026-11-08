import { describe, expect, mock, test } from "bun:test";
import type { Track } from "@narze/shared";
import { commands } from "../src/commands";
import { parseTime } from "../src/commands/seek";
import type { CommandContext, Reply } from "../src/commands/types";
import { COLOR_FAILURE, COLOR_SUCCESS } from "../src/music/format";
import type { Music } from "../src/music/music";

const dee = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const lemon: Track = {
  uri: "https://music.youtube.com/watch?v=lemon",
  source: "youtubemusic",
  title: "Lemon",
  author: "Kenshi Yonezu",
  durationMs: 255_000,
  artworkUrl: null,
  requester: dee,
};

function ctx(over: Partial<CommandContext> = {}, options: Record<string, string | number> = {}): CommandContext {
  return {
    guildId: "960000000000000001",
    channelId: "71",
    user: dee,
    memberVoiceChannelId: "70",
    canSpeakIn: () => true,
    option: (name) => options[name] ?? null,
    latencyMs: { reply: 12, ws: 40 },
    ...over,
  };
}

function music(over: Partial<Music> = {}): Music {
  return {
    play: mock(async () => ({ kind: "started", track: lemon })),
    togglePause: mock(async () => ({ paused: true, track: lemon })),
    skip: mock(async () => ({ kind: "skipped" })),
    seek: mock(async () => true),
    setVolume: mock(async () => true),
    join: mock(async () => "joined"),
    leave: mock(async () => true),
    status: mock(() => ({
      voiceChannelId: "70",
      current: lemon,
      playing: true,
      paused: false,
      volume: 15,
      positionMs: 0,
    })),
    ...over,
  } as unknown as Music;
}

const run = (name: string, c: CommandContext, m: Music): Promise<Reply> => {
  const command = commands.find((x) => x.data.name === name);
  if (!command) throw new Error(`no /${name}`);
  return command.run(c, m);
};
const text = (reply: Reply) => reply.notice.description ?? reply.notice.title ?? "";

describe("the eight commands of #100 are registered with v5's descriptions (spec #1)", () => {
  test("names", () => {
    expect(commands.map((c) => c.data.name).sort()).toEqual(
      ["join", "leave", "pause", "ping", "play", "seek", "skip", "volume"].sort(),
    );
  });
});

describe("/play", () => {
  test("defers its reply: search and voice join can outlast the 3 s window", () => {
    expect(commands.find((c) => c.data.name === "play")?.slow).toBe(true);
  });

  test("refuses a member outside voice, privately, in the failure style (spec #14)", async () => {
    const reply = await run("play", ctx({ memberVoiceChannelId: null }, { query: "lemon" }), music());
    expect(reply).toMatchObject({ ephemeral: true, notice: { color: COLOR_FAILURE } });
    expect(text(reply)).toBe("> `❌` กรุณาเข้าห้องเสียงด้วย");
  });

  test("refuses a member in another channel than the Bot", async () => {
    const reply = await run("play", ctx({ memberVoiceChannelId: "99" }, { query: "lemon" }), music());
    expect(text(reply)).toBe("> `❌` กรุณาอยู่ในห้องเสียงเดียวกับบอท");
  });

  test("refuses a channel the Bot may not speak in", async () => {
    const m = music({ status: mock(() => null) as never });
    const reply = await run("play", ctx({ canSpeakIn: () => false }, { query: "lemon" }), m);
    expect(text(reply)).toBe("> `❌` บอทไม่มีอำนาจเปิดเพลงในห้อง <#70>");
  });

  test("announces a started track publicly, and a queued one with its position", async () => {
    const started = await run("play", ctx({}, { query: "lemon" }), music());
    expect(started).toMatchObject({ ephemeral: false, notice: { color: COLOR_SUCCESS } });
    expect(text(started)).toBe("`▶️`┃**Lemon** ` 04:15 `");
    const m = music({ play: mock(async () => ({ kind: "queued", track: lemon, position: 2 })) as never });
    expect(text(await run("play", ctx({}, { query: "lemon" }), m))).toBe("`📝`┃**Lemon** ` 04:15 ` \n > ลำดับ: ` 2 `");
  });

  test("reports nothing found and unsupported platforms privately", async () => {
    const notFound = music({ play: mock(async () => ({ kind: "error", reason: "not-found" })) as never });
    expect(text(await run("play", ctx({}, { query: "x" }), notFound))).toBe("> `❌` ไม่สามารถหาเพลงได้");
    const unsupported = music({ play: mock(async () => ({ kind: "error", reason: "unsupported" })) as never });
    expect(text(await run("play", ctx({}, { query: "x" }), unsupported))).toBe("> `❌` ไม่รองรับ Platform นี้");
  });
});

describe("/skip, /pause, /seek, /volume", () => {
  test("/skip with an empty queue says so in the failure colour", async () => {
    const m = music({ skip: mock(async () => ({ kind: "ended" })) as never });
    const reply = await run("skip", ctx(), m);
    expect(reply).toMatchObject({ ephemeral: false, notice: { color: COLOR_FAILURE, footer: "ข้าม • เพิ่มคิวอัตโนมัติ" } });
    expect(text(reply)).toBe("`⏭️`┃ **ไม่เหลือเพลงให้ข้าม**");
    expect(text(await run("skip", ctx(), music()))).toBe("`⏭️`┃**Skipped** โดย: <@500000000000000001>");
  });

  test("/skip and /seek refuse a paused player (v5: nothing is playing)", async () => {
    const paused = music({
      status: mock(() => ({
        voiceChannelId: "70",
        current: lemon,
        playing: false,
        paused: true,
        volume: 15,
        positionMs: 0,
      })) as never,
    });
    expect(text(await run("skip", ctx(), paused))).toBe("> `❌` ไม่มีเพลงที่เล่นอยู่");
    expect(text(await run("seek", ctx({}, { time: "30" }), paused))).toBe("> `❌` ไม่มีการเล่นเพลงอยู่");
  });

  test("/pause shows the new state in its footer", async () => {
    expect((await run("pause", ctx(), music())).notice.footer).toBe("พักการเล่น");
  });

  test("/seek rejects a time past the track's end", async () => {
    expect(text(await run("seek", ctx({}, { time: "5:00" }), music()))).toBe(
      "> `❌` เวลาที่ระบุเกินความยาวของเพลง (04:15)",
    );
    expect(text(await run("seek", ctx({}, { time: "1:30" }), music()))).toBe("> `⏭️`┃ข้ามไป: ` 01:30 `");
  });

  test("/volume shows the level it set, or the current one without an amount", async () => {
    expect(text(await run("volume", ctx({}, { amount: 80 }), music()))).toBe("> `📢`┃**เสียง:** `80%`");
    expect(text(await run("volume", ctx(), music()))).toBe("> `📢`┃**เสียง:** `15%`");
  });
});

describe("/join, /leave, /ping", () => {
  test("/join reports joined, already there (privately) and moved", async () => {
    expect(text(await run("join", ctx(), music()))).toBe("> `🔊` | เข้าห้อง <#70>");
    const already = await run("join", ctx(), music({ join: mock(async () => "already") as never }));
    expect(already.ephemeral).toBe(true);
    expect(text(already)).toBe("> `🔊` | เข้าห้อง <#70> อยู่แล้ว");
    expect(text(await run("join", ctx(), music({ join: mock(async () => "moved") as never })))).toBe(
      "> `🔊` | ย้ายไปห้อง <#70>",
    );
  });

  test("/leave with no Bot in voice says so; otherwise leaves the Bot's channel", async () => {
    expect(text(await run("leave", ctx(), music({ status: mock(() => null) as never })))).toBe(
      "> `❌` **ไม่มีบอทในห้อง**",
    );
    expect(text(await run("leave", ctx(), music()))).toBe("> `🔊`| **ออกจากห้อง** <#70>");
  });

  test("/ping reports the three latencies", async () => {
    const reply = await run("ping", ctx(), music());
    expect(reply.notice.title).toBe("🏓 |  Ping Status");
    expect(reply.notice.fields?.map((f) => f.name)).toEqual(["Reply Latency", "Bot Latency", "API Latency"]);
  });
});

describe("parseTime (spec: 30, 2:30 or 1:20:15)", () => {
  test("accepts seconds, m:ss and h:mm:ss, and rejects anything else", () => {
    expect(parseTime("30")).toBe(30_000);
    expect(parseTime("2:30")).toBe(150_000);
    expect(parseTime("1:20:15")).toBe(4_815_000);
    expect(parseTime("2:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
});
