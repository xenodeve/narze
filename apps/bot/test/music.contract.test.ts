import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FakeLavalink, startFakeLavalink } from "@narze/fake-lavalink";
import { DEFAULT_REDIS_URL, GuildEventTypes, type PlayerState, PlayerStateSchema, RedisKeys } from "@narze/shared";
import Redis from "ioredis";
import type { LavalinkManager } from "lavalink-client";
import { createLavalink } from "../src/lavalink";
import type { Notice } from "../src/music/format";
import { createMusic, type Music } from "../src/music/music";
import { createPlayerPublisher } from "../src/music/player-state";
import { createSnapshotStore } from "../src/music/queue-snapshot";

const BOT = { id: "1100000000000000001", username: "narze-test" };
const GUILD = "960000000000000001";
const VOICE = "70";
const TEXT = "71";
const dee = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const CATALOG = [
  { title: "Lemon", author: "Kenshi Yonezu", uri: "https://music.youtube.com/watch?v=lemon", lengthMs: 255_000 },
  { title: "Idol", author: "YOASOBI", uri: "https://music.youtube.com/watch?v=idol", lengthMs: 213_000 },
  { title: "Gurenge", author: "LiSA", uri: "https://music.youtube.com/watch?v=gurenge", lengthMs: 239_000 },
  {
    title: "Pretender",
    author: "Official HIGE DANdism",
    uri: "https://music.youtube.com/watch?v=pretender",
    lengthMs: 326_000,
  },
];

const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
let fake: FakeLavalink;
let lavalink: LavalinkManager;
let music: Music;
let voicePackets: Array<Record<string, unknown>>;
let notices: Array<{ channelId: string; notice: Notice }>;
let clock: number;
let jumpSpy: (data: { fromIndex: number; title: string }) => void = () => {};

const stored = async (): Promise<PlayerState | null> => {
  const raw = await redis.get(RedisKeys.playerState(GUILD));
  return raw ? PlayerStateSchema.parse(JSON.parse(raw)) : null;
};

async function eventually<T>(read: () => Promise<T> | T, ok: (v: T) => boolean, ms = 2000): Promise<T> {
  const until = Date.now() + ms;
  let value = await read();
  while (!ok(value) && Date.now() < until) {
    await Bun.sleep(10);
    value = await read();
  }
  return value;
}

/** A Bot process's Lavalink manager, connected to the fake. */
async function connect(): Promise<LavalinkManager> {
  const lavalink = createLavalink({
    host: "127.0.0.1",
    port: fake.port,
    password: "pw",
    client: BOT,
    // Plays Discord's part: the gateway answers a voice join with the two voice packets.
    sendToShard: (guildId, payload) => {
      voicePackets.push(payload as Record<string, unknown>);
      const d = (payload as { d: { channel_id: string | null } }).d;
      void lavalink.sendRawData({
        t: "VOICE_STATE_UPDATE",
        d: { guild_id: guildId, user_id: BOT.id, session_id: "voice-session", channel_id: d.channel_id },
      } as never);
      void lavalink.sendRawData({
        t: "VOICE_SERVER_UPDATE",
        d: { guild_id: guildId, token: "t", endpoint: "e" },
      } as never);
    },
  });
  const ready = new Promise<void>((resolve) => lavalink.nodeManager.on("connect", () => resolve()));
  await lavalink.init(BOT);
  await ready;
  await eventually(
    () => lavalink.nodeManager.leastUsedNodes()[0]?.sessionId,
    (id) => Boolean(id),
  );
  return lavalink;
}

beforeEach(async () => {
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD));
  fake = await startFakeLavalink({ password: "pw", catalog: CATALOG });
  voicePackets = [];
  notices = [];
  clock = 1_000_000;
  lavalink = await connect();
  music = createMusic({
    lavalink,
    publisher: {
      ...createPlayerPublisher(redis),
      jump: async (_guildId, _revision, data) => jumpSpy(data),
    },
    epoch: "test-epoch",
    oembedTitle: async (url) => (url.includes("open.spotify.com/track/lemon") ? "Lemon - Kenshi Yonezu" : null),
    announce: async (channelId, notice) => {
      notices.push({ channelId, notice });
    },
    now: () => clock,
  });
});

afterEach(async () => {
  await lavalink.nodeManager.leastUsedNodes()[0]?.destroy?.();
  fake.stop();
});

afterAll(async () => {
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD));
  await redis.quit();
});

const play = (query: string) =>
  music.play({ guildId: GUILD, voiceChannelId: VOICE, textChannelId: TEXT, query, requester: dee });

describe("playing from Discord against Fake Lavalink (#100)", () => {
  test("a failing publish (Redis down) never crashes the Bot: playback goes on", async () => {
    music = createMusic({
      lavalink,
      publisher: {
        publish: () => Promise.reject(new Error("redis down")),
        gone: () => Promise.reject(new Error("redis down")),
        jump: () => Promise.reject(new Error("redis down")),
      },
      announce: async () => {},
      now: () => clock,
    });
    expect(await play("lemon")).toMatchObject({ kind: "started" });
    await play("idol");
    fake.finishTrack(GUILD);
    await eventually(
      () => fake.player(GUILD)?.track?.info.title,
      (t) => t === "Idol",
    );
    expect(await music.skip(GUILD)).toEqual({ kind: "ended" });
    await Bun.sleep(50);
  });

  test("/play resolves, joins self-deafened at volume 15 and publishes a valid Player State", async () => {
    const result = await play("lemon");
    expect(result).toMatchObject({ kind: "started", track: { title: "Lemon" } });
    expect(voicePackets[0]).toMatchObject({ op: 4, d: { guild_id: GUILD, channel_id: VOICE, self_deaf: true } });
    const state = await eventually(stored, (s) => s?.current?.title === "Lemon");
    expect(state).toMatchObject({ volume: 15, paused: false, voiceChannelId: VOICE });
    expect(state?.current?.requester).toEqual(dee);
    expect(fake.player(GUILD)?.volume).toBe(15);
    // The first track of /play is announced by the command's own reply, not by a notice.
    expect(notices).toEqual([]);
  });

  test("a second /play is queued, and when the first ends the next start is announced", async () => {
    await play("lemon");
    const queued = await play("idol");
    expect(queued).toMatchObject({ kind: "queued", position: 1, track: { title: "Idol" } });
    expect((await eventually(stored, (s) => s?.queue.length === 1))?.queue[0]?.title).toBe("Idol");
    fake.finishTrack(GUILD);
    const state = await eventually(stored, (s) => s?.current?.title === "Idol");
    expect(state?.revision).toBeGreaterThan(1);
    await eventually(
      () => notices.length,
      (n) => n > 0,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.channelId).toBe(TEXT);
    expect(notices[0]?.notice.description).toContain("**Idol**");
  });

  test("nothing found and unsupported platforms are reported, not played, and leave no player behind", async () => {
    expect(await play("no such song")).toEqual({ kind: "error", reason: "not-found" });
    expect(music.status(GUILD)).toBeNull();
    expect(await play("https://www.deezer.com/track/1")).toEqual({ kind: "error", reason: "unsupported" });
    expect(music.status(GUILD)).toBeNull();
    expect(fake.player(GUILD)?.track ?? null).toBeNull();
  });

  test("two /play at once: one starts, the other queues (one Guild at a time)", async () => {
    const results = await Promise.all([play("lemon"), play("idol")]);
    expect(results.map((r) => r.kind).sort()).toEqual(["queued", "started"]);
  });

  test("the state carries this process epoch, and a seek is stamped for clients (spec #103)", async () => {
    await play("lemon");
    await eventually(stored, (s) => s !== null);
    clock += 5_000;
    await music.seek(GUILD, 10_000);
    const state = await eventually(stored, (s) => s?.lastSeekAt === clock);
    expect(state?.lastSeekAt).toBe(clock);
    expect(state?.epoch).toBe("test-epoch");
  });

  test("pause toggles, seek and volume reach the node, and each change is published", async () => {
    await play("lemon");
    // lavalink-client resets `paused` when TrackStartEvent arrives, which can be after play() returns.
    await eventually(stored, (s) => s?.current?.title === "Lemon");
    expect(await music.togglePause(GUILD)).toMatchObject({ paused: true });
    expect((await eventually(stored, (s) => s?.paused === true))?.paused).toBe(true);
    expect(await music.togglePause(GUILD)).toMatchObject({ paused: false });
    await music.seek(GUILD, 30_000);
    // Saved at flush time: the position kept moving for a few ms after the seek.
    const position = fake.player(GUILD)?.position ?? 0;
    expect(position).toBeGreaterThanOrEqual(30_000);
    expect(position).toBeLessThan(31_000);
    await music.setVolume(GUILD, 80);
    expect(fake.player(GUILD)?.volume).toBe(80);
    expect((await eventually(stored, (s) => s?.volume === 80))?.volume).toBe(80);
  });

  test("/skip on an empty queue destroys the player and removes the published state", async () => {
    await play("lemon");
    await eventually(stored, (s) => s !== null);
    expect(await music.skip(GUILD)).toEqual({ kind: "ended" });
    expect(await eventually(stored, (s) => s === null)).toBeNull();
  });

  test("a queued track older than 4 h is resolved again before it plays (spec #26)", async () => {
    await play("lemon");
    await play("idol");
    clock += 4 * 60 * 60 * 1000 + 1;
    const before = fake.searches().length;
    fake.finishTrack(GUILD);
    await eventually(stored, (s) => s?.current?.title === "Idol");
    expect(fake.searches().slice(before)).toContain("https://music.youtube.com/watch?v=idol");
  });
});

describe("web controls on the engine (#101)", () => {
  const titles = async () => (await stored())?.queue.map((t) => t.title);

  test("play-next puts the track at the head of the queue instead of the end", async () => {
    await play("lemon");
    await play("idol");
    await music.play({
      guildId: GUILD,
      voiceChannelId: VOICE,
      textChannelId: TEXT,
      query: "gurenge",
      requester: dee,
      next: true,
    });
    expect(await eventually(titles, (t) => t?.length === 2)).toEqual(["Gurenge", "Idol"]);
  });

  test("previous restarts the current track (v5 has no history)", async () => {
    await play("lemon");
    await eventually(stored, (s) => s?.current?.title === "Lemon");
    await music.seek(GUILD, 90_000);
    expect(await music.previous(GUILD)).toBe(true);
    expect(fake.player(GUILD)?.position).toBe(0);
  });

  test("loop sets a mode, and without one cycles off → track → queue → off (spec #47)", async () => {
    await play("lemon");
    expect(await music.setLoop(GUILD, "queue")).toBe("queue");
    expect(await music.setLoop(GUILD, null)).toBe("off");
    expect(await music.setLoop(GUILD, null)).toBe("track");
    expect((await eventually(stored, (s) => s?.loop === "track"))?.loop).toBe("track");
  });

  test("shuffle keeps the same tracks in the queue and bumps the revision", async () => {
    await play("lemon");
    for (const q of ["idol", "gurenge", "pretender"]) await play(q);
    const before = await eventually(stored, (s) => s?.queue.length === 3);
    expect(await music.shuffle(GUILD)).toBe(true);
    const after = await eventually(stored, (s) => (s?.revision ?? 0) > (before?.revision ?? 0));
    expect(after?.queue.map((t) => t.title).sort()).toEqual(["Gurenge", "Idol", "Pretender"]);
  });

  test("a Spotify link Lavalink cannot resolve plays by its oEmbed title instead (spec #70)", async () => {
    expect(await play("https://open.spotify.com/track/lemon")).toMatchObject({
      kind: "started",
      track: { title: "Lemon" },
    });
  });
});

describe("queue editing on the engine (#102)", () => {
  const titles = async () => (await stored())?.queue.map((t) => t.title);
  const uriAt = async (i: number) => (await stored())?.queue[i]?.uri ?? "";
  async function four() {
    await play("lemon");
    for (const q of ["idol", "gurenge", "pretender"]) await play(q);
    await eventually(titles, (t) => t?.length === 3);
  }

  test("move follows spec #46 (to may equal length; moving down drops before the target)", async () => {
    await four();
    expect(await music.move(GUILD, 0, 3, await uriAt(0))).toBe("ok");
    expect(await eventually(titles, (t) => t?.[2] === "Idol")).toEqual(["Gurenge", "Pretender", "Idol"]);
    expect(await music.move(GUILD, 0, 9, await uriAt(0))).toBe("invalid-index");
  });

  test("remove and clear edit the queue and bump the revision", async () => {
    await four();
    const before = (await stored())?.revision ?? 0;
    expect(await music.remove(GUILD, 1, await uriAt(1))).toBe("ok");
    expect(await eventually(titles, (t) => t?.length === 2)).toEqual(["Idol", "Pretender"]);
    expect(await music.clear(GUILD)).toBe(true);
    const after = await eventually(stored, (s) => s?.queue.length === 0);
    expect(after?.revision).toBeGreaterThan(before + 1);
  });

  test("an edit naming a track that is no longer at that index is refused as stale, untouched", async () => {
    await four();
    const idol = await uriAt(0);
    expect(await music.remove(GUILD, 1, idol)).toBe("stale");
    expect(await music.playNow(GUILD, 1, idol)).toBe("stale");
    expect(await music.move(GUILD, 1, 3, idol)).toBe("stale");
    expect(await titles()).toEqual(["Idol", "Gurenge", "Pretender"]);
  });

  test("play at a position inserts there (/playat); out of range clamps to the end (v5)", async () => {
    await play("lemon");
    await play("idol");
    await play("gurenge");
    await music.play({
      guildId: GUILD,
      voiceChannelId: VOICE,
      textChannelId: TEXT,
      query: "pretender",
      requester: dee,
      position: 1,
    });
    expect(await eventually(titles, (t) => t?.length === 3)).toEqual(["Idol", "Pretender", "Gurenge"]);
  });

  test("skipplay plays the new track now, keeps the queue, and posts no notice (spec #7, #24)", async () => {
    await play("lemon");
    await play("idol");
    const before = (await eventually(stored, (s) => s?.queue.length === 1))?.revision ?? 0;
    await music.play({
      guildId: GUILD,
      voiceChannelId: VOICE,
      textChannelId: TEXT,
      query: "gurenge",
      requester: dee,
      skipplay: true,
    });
    const state = await eventually(stored, (s) => s?.current?.title === "Gurenge");
    expect(state?.queue.map((t) => t.title)).toEqual(["Idol"]);
    // One edit, one revision (ADR-0007): the track start is the bump, not a second one before it.
    expect(state?.revision).toBe(before + 1);
    expect(notices.filter((n) => n.notice.description?.includes("Gurenge"))).toHaveLength(0);
  });

  test("play-now announces the jump first, then plays it and keeps the rest in order (spec #39)", async () => {
    await four();
    const order: string[] = [];
    const jumped = new Promise<void>((resolve) => {
      jumpSpy = (data) => {
        order.push(`jump:${data.title}`);
        resolve();
      };
    });
    const before = (await stored())?.revision ?? 0;
    expect(await music.playNow(GUILD, 2, await uriAt(2))).toBe("ok");
    await jumped;
    const state = await eventually(stored, (s) => s?.current?.title === "Pretender");
    order.push(`now:${state?.current?.title}`);
    expect(order).toEqual(["jump:Pretender", "now:Pretender"]);
    expect(state?.queue.map((t) => t.title)).toEqual(["Idol", "Gurenge"]);
    expect(state?.revision).toBe(before + 1);
    expect(notices.filter((n) => n.notice.description?.includes("Pretender"))).toHaveLength(0);
  });
});

describe("queue end and 24/7 (#103, spec #10, #27)", () => {
  test("with 24/7 off, the queue ending leaves voice and the Player is gone", async () => {
    await play("lemon");
    await eventually(stored, (s) => s?.current?.title === "Lemon");
    fake.finishTrack(GUILD);
    expect(
      await eventually(
        () => lavalink.getPlayer(GUILD),
        (p) => !p,
      ),
    ).toBeFalsy();
    expect(await eventually(stored, (s) => s === null)).toBeNull();
  });

  test("with 24/7 on, the queue ending keeps an Idle Player that still shows on the Dashboard", async () => {
    await play("lemon");
    expect(await music.setTwentyFourSeven(GUILD)).toBe(true);
    expect((await eventually(stored, (s) => s?.twentyFourSeven === true))?.twentyFourSeven).toBe(true);
    fake.finishTrack(GUILD);
    const idle = await eventually(stored, (s) => s?.current === null);
    expect(idle).toMatchObject({ current: null, queue: [], twentyFourSeven: true, voiceChannelId: VOICE });
    expect(lavalink.getPlayer(GUILD)).toBeTruthy();
    expect(music.status(GUILD)).toMatchObject({ current: null, twentyFourSeven: true });
  });

  test("/skip on the last track leaves unless 24/7 is on (spec #10)", async () => {
    await play("lemon");
    expect(await music.skip(GUILD)).toEqual({ kind: "ended" });
    expect(
      await eventually(
        () => lavalink.getPlayer(GUILD),
        (p) => !p,
      ),
    ).toBeFalsy();

    await play("idol");
    await music.setTwentyFourSeven(GUILD);
    expect(await music.skip(GUILD)).toEqual({ kind: "ended" });
    expect(await eventually(stored, (s) => s?.current === null)).toMatchObject({ twentyFourSeven: true });
    expect(lavalink.getPlayer(GUILD)).toBeTruthy();
  });

  test("a track played on an Idle Player starts it again", async () => {
    await play("lemon");
    await music.setTwentyFourSeven(GUILD);
    fake.finishTrack(GUILD);
    await eventually(stored, (s) => s?.current === null);
    expect(await play("idol")).toMatchObject({ kind: "started" });
    expect((await eventually(stored, (s) => s?.current?.title === "Idol"))?.current?.title).toBe("Idol");
  });
});

describe("Queue Recovery after a restart (#103, spec #21, #35, #123)", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });
  async function snapshotsDir() {
    const dir = await mkdtemp(join(tmpdir(), "narze-recovery-"));
    dirs.push(dir);
    return createSnapshotStore(dir);
  }
  const engine = (
    manager: LavalinkManager,
    snapshots: ReturnType<typeof createSnapshotStore>,
    seen: PlayerState[] = [],
  ) =>
    createMusic({
      lavalink: manager,
      publisher: {
        ...createPlayerPublisher(redis),
        publish: async (state) => {
          seen.push(state);
          await createPlayerPublisher(redis).publish(state);
        },
      },
      snapshots,
      announce: async (channelId, notice) => {
        notices.push({ channelId, notice });
      },
      now: () => clock,
    });

  test("a restarted Bot restores the queue, current track, position and 24/7", async () => {
    const snapshots = await snapshotsDir();
    music = engine(lavalink, snapshots);
    await play("lemon");
    await play("idol");
    await play("gurenge");
    await eventually(stored, (s) => s?.queue.length === 2);
    await music.seek(GUILD, 30_000);
    await music.setTwentyFourSeven(GUILD);
    await music.flush();

    // The process dies: nothing it registered runs again, and its Lavalink session ends.
    lavalink.removeAllListeners();
    await lavalink.nodeManager.leastUsedNodes()[0]?.destroy?.();
    notices = [];

    const seen: PlayerState[] = [];
    lavalink = await connect();
    music = engine(lavalink, snapshots, seen);
    expect(await music.recover()).toBe(1);

    const state = await eventually(stored, (s) => s?.current?.title === "Lemon" && !s.recovering);
    expect(state).toMatchObject({ twentyFourSeven: true, voiceChannelId: VOICE });
    expect(state?.queue.map((t) => t.title)).toEqual(["Idol", "Gurenge"]);
    // Saved at flush time: the position kept moving for a few ms after the seek.
    const position = fake.player(GUILD)?.position ?? 0;
    expect(position).toBeGreaterThanOrEqual(30_000);
    expect(position).toBeLessThan(31_000);
    expect(seen.some((s) => s.recovering === true)).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.channelId).toBe(TEXT);
    expect(notices[0]?.notice.description).toContain("กู้คิวเพลง");
  });

  test("the snapshot is cleared when the queue ends without 24/7, and a Guild left behind is skipped", async () => {
    const snapshots = await snapshotsDir();
    music = engine(lavalink, snapshots);
    await play("lemon");
    await eventually(
      async () => (await snapshots.all()).length,
      (n) => n === 1,
    );
    fake.finishTrack(GUILD);
    expect(
      await eventually(
        async () => (await snapshots.all()).length,
        (n) => n === 0,
      ),
    ).toBe(0);

    await play("idol");
    await music.flush();
    lavalink.removeAllListeners();
    await lavalink.nodeManager.leastUsedNodes()[0]?.destroy?.();
    lavalink = await connect();
    music = engine(lavalink, snapshots);
    expect(await music.recover(() => false)).toBe(0);
    expect(await snapshots.all()).toEqual([]);
    expect(lavalink.getPlayer(GUILD)).toBeFalsy();
  });
});

describe("voice-drop recovery (#103, spec #28)", () => {
  let events: Array<{ type: string; data: Record<string, unknown> }>;
  beforeEach(() => {
    events = [];
    music = createMusic({
      lavalink,
      publisher: {
        ...createPlayerPublisher(redis),
        voice: async (_guildId, type, data) => {
          events.push({ type, data });
        },
      },
      announce: async () => {},
      now: () => clock,
      voiceRetryMs: [0, 0],
    });
  });
  const reconnected = () => eventually(() => events.find((e) => e.type === GuildEventTypes.voiceReconnected), Boolean);

  async function playingAt(positionMs: number) {
    await play("lemon");
    await eventually(stored, (s) => s?.current?.title === "Lemon");
    await music.seek(GUILD, positionMs);
  }

  for (const code of [4006, 4009, 4014, 4015]) {
    test(`code ${code} reconnects and resumes where it was`, async () => {
      await playingAt(40_000);
      const joins = voicePackets.length;
      fake.closeVoice(GUILD, code, false);
      // The stream restarted on Lavalink's side; only the seek back puts it where it was.
      const lost = fake.player(GUILD);
      if (lost) lost.position = 0;
      expect((await reconnected())?.data).toMatchObject({ resumed: true });
      expect(events[0]).toMatchObject({
        type: GuildEventTypes.voiceDisconnect,
        data: { code, byRemote: false, recovering: true },
      });
      expect(voicePackets.length).toBeGreaterThan(joins);
      expect(fake.player(GUILD)?.position).toBeGreaterThanOrEqual(40_000);
      expect(fake.player(GUILD)?.paused).toBe(false);
    });
  }

  test("a close by Discord's side reconnects whatever the code; other codes are left alone", async () => {
    await playingAt(10_000);
    fake.closeVoice(GUILD, 4000, true);
    expect(await reconnected()).toBeTruthy();

    events = [];
    const joins = voicePackets.length;
    fake.closeVoice(GUILD, 1000, false);
    await eventually(
      () => events.length,
      (n) => n > 0,
    );
    await Bun.sleep(50);
    expect(events).toEqual([
      { type: GuildEventTypes.voiceDisconnect, data: expect.objectContaining({ code: 1000, recovering: false }) },
    ]);
    expect(voicePackets.length).toBe(joins);
  });

  test("a paused Player reconnects and stays paused", async () => {
    await playingAt(20_000);
    await music.togglePause(GUILD);
    fake.closeVoice(GUILD, 4006, false);
    expect((await reconnected())?.data).toMatchObject({ resumed: false });
    expect(fake.player(GUILD)?.paused).toBe(true);
  });
});
