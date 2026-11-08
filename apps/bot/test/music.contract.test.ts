import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeLavalink, startFakeLavalink } from "@narze/fake-lavalink";
import { DEFAULT_REDIS_URL, type PlayerState, PlayerStateSchema, RedisKeys } from "@narze/shared";
import Redis from "ioredis";
import type { LavalinkManager } from "lavalink-client";
import { createLavalink } from "../src/lavalink";
import type { Notice } from "../src/music/format";
import { createMusic, type Music } from "../src/music/music";
import { createPlayerPublisher } from "../src/music/player-state";

const BOT = { id: "1100000000000000001", username: "narze-test" };
const GUILD = "960000000000000001";
const VOICE = "70";
const TEXT = "71";
const dee = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const CATALOG = [
  { title: "Lemon", author: "Kenshi Yonezu", uri: "https://music.youtube.com/watch?v=lemon", lengthMs: 255_000 },
  { title: "Idol", author: "YOASOBI", uri: "https://music.youtube.com/watch?v=idol", lengthMs: 213_000 },
];

const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
let fake: FakeLavalink;
let lavalink: LavalinkManager;
let music: Music;
let voicePackets: Array<Record<string, unknown>>;
let notices: Array<{ channelId: string; notice: Notice }>;
let clock: number;

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

beforeEach(async () => {
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD));
  fake = await startFakeLavalink({ password: "pw", catalog: CATALOG });
  voicePackets = [];
  notices = [];
  clock = 1_000_000;
  lavalink = createLavalink({
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
  music = createMusic({
    lavalink,
    publisher: createPlayerPublisher(redis),
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
    expect(notices).toHaveLength(1);
    expect(notices[0]?.channelId).toBe(TEXT);
    expect(notices[0]?.notice.description).toContain("**Idol**");
  });

  test("nothing found and unsupported platforms are reported, not played", async () => {
    expect(await play("no such song")).toEqual({ kind: "error", reason: "not-found" });
    expect(await play("https://www.deezer.com/track/1")).toEqual({ kind: "error", reason: "unsupported" });
    expect(fake.player(GUILD)?.track ?? null).toBeNull();
  });

  test("pause toggles, seek and volume reach the node, and each change is published", async () => {
    await play("lemon");
    expect(await music.togglePause(GUILD)).toMatchObject({ paused: true });
    expect((await eventually(stored, (s) => s?.paused === true))?.paused).toBe(true);
    expect(await music.togglePause(GUILD)).toMatchObject({ paused: false });
    await music.seek(GUILD, 30_000);
    expect(fake.player(GUILD)?.position).toBe(30_000);
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
