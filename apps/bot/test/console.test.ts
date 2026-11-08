import { describe, expect, mock, test } from "bun:test";
import { type ConsoleDeps, createConsole } from "../src/console/console";
import { parseCommand, tokenize } from "../src/console/parse";
import { findGuild, findText, findVoice } from "../src/console/resolve";

describe("the console's words (#112, spec #119)", () => {
  test("quotes keep a phrase together; escapes and empty quotes work", () => {
    expect(tokenize(`play "yoasobi idol" Lounge 'Music Room'`)).toEqual([
      "play",
      "yoasobi idol",
      "Lounge",
      "Music Room",
    ]);
    expect(tokenize(`play "say \\"hi\\"" 1 2`)).toEqual(["play", 'say "hi"', "1", "2"]);
    expect(tokenize(`  status   `)).toEqual(["status"]);
    expect(tokenize(`find guild ""`)).toEqual(["find", "guild", ""]);
  });

  test("every command and argument form", () => {
    expect(parseCommand("")).toEqual({ kind: "empty" });
    expect(parseCommand("play lemon 1 2")).toEqual({
      kind: "play",
      query: "lemon",
      guild: "1",
      voice: "2",
      text: null,
    });
    expect(parseCommand(`play "yoasobi idol" Lounge "Music Room" general`)).toEqual({
      kind: "play",
      query: "yoasobi idol",
      guild: "Lounge",
      voice: "Music Room",
      text: "general",
    });
    expect(parseCommand("PLAY lemon 1 2")).toMatchObject({ kind: "play" });
    expect(parseCommand("play lemon 1")).toMatchObject({ kind: "usage", command: "play" });
    // An unquoted phrase is ambiguous: say how to quote it instead of guessing like v5 did.
    expect(parseCommand("play yoasobi idol 1 2 3")).toMatchObject({ kind: "usage", command: "play" });
    for (const word of ["stop", "skip", "leave"] as const) {
      expect(parseCommand(`${word} Lounge`)).toEqual({ kind: word, guild: "Lounge" });
      expect(parseCommand(word)).toMatchObject({ kind: "usage", command: word });
    }
    expect(parseCommand("status")).toEqual({ kind: "status", guild: null });
    expect(parseCommand(`status "Admin Club"`)).toEqual({ kind: "status", guild: "Admin Club" });
    expect(parseCommand("list")).toEqual({ kind: "list" });
    expect(parseCommand("guilds")).toEqual({ kind: "list" });
    expect(parseCommand("find guild lou")).toEqual({ kind: "find", what: "guild", name: "lou" });
    expect(parseCommand("find voice Lounge music")).toEqual({
      kind: "find",
      what: "voice",
      guild: "Lounge",
      name: "music",
    });
    expect(parseCommand("find text 1 gen")).toEqual({ kind: "find", what: "text", guild: "1", name: "gen" });
    expect(parseCommand("find voice Lounge")).toMatchObject({ kind: "usage", command: "find" });
    expect(parseCommand("find planet x")).toMatchObject({ kind: "usage", command: "find" });
    expect(parseCommand("help")).toEqual({ kind: "help" });
    expect(parseCommand("clear")).toEqual({ kind: "clear" });
    expect(parseCommand("cls")).toEqual({ kind: "clear" });
    expect(parseCommand("exit")).toEqual({ kind: "exit" });
    expect(parseCommand("quit")).toEqual({ kind: "exit" });
    expect(parseCommand("dance now")).toEqual({ kind: "unknown", word: "dance" });
    expect(parseCommand(`play "unclosed 1 2`)).toMatchObject({ kind: "usage" });
  });
});

const guilds = [
  {
    id: "100000000000000001",
    name: "Lounge",
    channels: [
      { id: "200", name: "Music Room", kind: "voice" as const, canSend: false },
      { id: "201", name: "general", kind: "text" as const, canSend: false },
      { id: "202", name: "music-chat", kind: "text" as const, canSend: true },
    ],
  },
  { id: "100000000000000002", name: "Lounge Two", channels: [] },
  { id: "100000000000000003", name: "Admin Club", channels: [] },
];

describe("names or IDs (#112, spec #119)", () => {
  test("an ID, an exact name, or the one name that contains the words; several matches are named", () => {
    expect(findGuild(guilds, "100000000000000003")).toMatchObject({ name: "Admin Club" });
    expect(findGuild(guilds, "lounge")).toMatchObject({ id: "100000000000000001" });
    expect(findGuild(guilds, "club")).toMatchObject({ name: "Admin Club" });
    expect(findGuild(guilds, "oun")).toEqual({ error: 'หลายเซิร์ฟเวอร์ตรงกับ "oun": Lounge, Lounge Two' });
    expect(findGuild(guilds, "nope")).toEqual({ error: 'ไม่พบเซิร์ฟเวอร์ "nope"' });
  });

  test("voice by ID or name; text only where the Bot can post, and the first such when none is named", () => {
    const lounge = guilds[0] as (typeof guilds)[number];
    expect(findVoice(lounge, "200")).toMatchObject({ name: "Music Room" });
    expect(findVoice(lounge, "music")).toMatchObject({ id: "200" });
    expect(findVoice(lounge, "general")).toEqual({ error: 'ไม่พบห้องเสียง "general" ใน Lounge' });
    expect(findText(lounge, null)).toMatchObject({ id: "202" });
    expect(findText(lounge, "general")).toEqual({ error: 'บอทส่งข้อความในช่อง "general" ไม่ได้' });
    expect(findText({ ...lounge, channels: [] }, null)).toEqual({ error: "ไม่มีช่องข้อความที่บอทส่งได้ใน Lounge" });
  });
});

function harness(over: Partial<ConsoleDeps> = {}) {
  const printed: string[] = [];
  const music = {
    play: mock(async () => ({
      kind: "started" as const,
      track: { title: "Lemon", author: "Kenshi", durationMs: 1000 },
    })),
    leave: mock(async () => true),
    skip: mock(async () => ({ kind: "skipped" as const })),
    status: mock((guildId: string) =>
      guildId === "100000000000000001"
        ? {
            voiceChannelId: "200",
            current: { title: "Lemon", author: "Kenshi", durationMs: 200_000 },
            playing: true,
            paused: false,
            volume: 15,
            positionMs: 60_000,
            queue: [{ title: "Idol" }],
          }
        : null,
    ),
  };
  const deps: ConsoleDeps = {
    guilds: () => guilds,
    music: music as unknown as ConsoleDeps["music"],
    bot: { id: "900000000000000001", name: "Narze", avatarUrl: null },
    print: (line) => printed.push(line),
    clear: mock(() => {}),
    ...over,
  };
  return { console: createConsole(deps), printed, music, deps };
}

describe("running console commands (#112, spec #119)", () => {
  test("play resolves names, picks a text channel, plays as the Bot, silently", async () => {
    const { console: run, music, printed } = harness();
    await run.run(parseCommand(`play lemon lounge "music room"`));
    expect(music.play).toHaveBeenCalledWith({
      guildId: "100000000000000001",
      voiceChannelId: "200",
      textChannelId: "202",
      query: "lemon",
      requester: { id: "900000000000000001", name: "Narze", avatarUrl: null },
      silent: true,
    });
    expect(printed.join("\n")).toContain("Lemon");
    expect(printed.join("\n")).toContain("music-chat");
  });

  test("a name that does not resolve plays nothing and says why", async () => {
    const { console: run, music, printed } = harness();
    await run.run(parseCommand("play lemon nope music"));
    expect(music.play).not.toHaveBeenCalled();
    expect(printed.at(-1)).toContain("ไม่พบเซิร์ฟเวอร์");
  });

  test("stop, leave and skip act on the named guild; status lists players", async () => {
    const { console: run, music, printed } = harness();
    await run.run(parseCommand("stop lounge"));
    await run.run(parseCommand("leave 100000000000000001"));
    expect(music.leave).toHaveBeenCalledTimes(2);
    await run.run(parseCommand("skip lounge"));
    expect(music.skip).toHaveBeenCalledWith("100000000000000001");
    printed.length = 0;
    await run.run(parseCommand("status"));
    expect(printed.join("\n")).toMatch(/Lounge.*Lemon/s);
    printed.length = 0;
    await run.run(parseCommand("status lounge"));
    expect(printed.join("\n")).toContain("01:00 / 03:20");
    expect(printed.join("\n")).toContain("15");
  });

  test("list, find, help, clear and unknown words", async () => {
    const { console: run, printed, deps } = harness();
    await run.run(parseCommand("list"));
    expect(printed.join("\n")).toContain("Music Room");
    printed.length = 0;
    await run.run(parseCommand("find text lounge music"));
    expect(printed.join("\n")).toContain("music-chat");
    printed.length = 0;
    // find shows whether the Bot can post, instead of refusing the channel (v5).
    await run.run(parseCommand("find text lounge general"));
    expect(printed.join("\n")).toContain("❌");
    printed.length = 0;
    await run.run(parseCommand("help"));
    expect(printed.join("\n")).toContain("play");
    await run.run(parseCommand("clear"));
    expect(deps.clear).toHaveBeenCalled();
    printed.length = 0;
    await run.run(parseCommand("dance"));
    expect(printed.join("\n")).toContain("help");
  });

  test("works in Standalone Mode: nothing it needs comes from Redis or the Backend", async () => {
    // ConsoleDeps has no Redis or Backend: the same commands run with Discord and Lavalink only.
    const { console: run, music } = harness();
    await run.run(parseCommand("play lemon 100000000000000001 200 201"));
    expect(music.play).toHaveBeenCalledTimes(0);
    await run.run(parseCommand("play lemon 100000000000000001 200"));
    expect(music.play).toHaveBeenCalledTimes(1);
  });
});

describe("the console prompt (#112)", () => {
  test("runs typed commands in order; exit closes the console only; no terminal means no console", async () => {
    const { PassThrough } = await import("node:stream");
    const { startRepl } = await import("../src/console/repl");
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const output = new PassThrough();
    const ran: string[] = [];
    let interrupted = false;
    const rl = startRepl({
      run: async (command) => {
        await Bun.sleep(5);
        ran.push(command.kind);
      },
      interrupt: () => {
        interrupted = true;
      },
      input,
      output,
    });
    expect(rl).not.toBeNull();
    const closed = new Promise((resolve) =>
      (rl as unknown as import("node:events").EventEmitter).once("close", resolve),
    );
    input.write("help\nstatus\nexit\n");
    await closed;
    await Bun.sleep(30);
    expect(ran).toEqual(["help", "status"]);
    expect(interrupted).toBe(false);
    expect(startRepl({ run: async () => {}, interrupt: () => {}, input: new PassThrough(), output })).toBeNull();
  });
});
