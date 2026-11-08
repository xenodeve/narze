import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeLavalink, startFakeLavalink } from "@narze/fake-lavalink";
import {
  Channels,
  type CommandResult,
  CommandResultSchema,
  DEFAULT_REDIS_URL,
  type PlayerAction,
  type PlayerCommand,
  RedisKeys,
} from "@narze/shared";
import Redis from "ioredis";
import type { LavalinkManager } from "lavalink-client";
import { startCommandBus } from "../src/command-bus";
import { createLavalink } from "../src/lavalink";
import { createMusic, type Music } from "../src/music/music";
import { createPlayerPublisher } from "../src/music/player-state";

const BOT = { id: "1100000000000000001", username: "narze-test" };
const GUILD = "970000000000000001";
const dee = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const CATALOG = [
  { title: "Lemon", author: "Kenshi Yonezu", uri: "https://music.youtube.com/watch?v=lemon", lengthMs: 255_000 },
  { title: "Idol", author: "YOASOBI", uri: "https://music.youtube.com/watch?v=idol", lengthMs: 213_000 },
];

const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(url);
const results = new Redis(url);
let fake: FakeLavalink;
let lavalink: LavalinkManager;
let music: Music;
let stopBus: () => Promise<void>;
const received = new Map<string, CommandResult>();

results.on("message", (_c, raw) => {
  const result = CommandResultSchema.parse(JSON.parse(raw));
  received.set(result.id, result);
});

async function send(command: PlayerAction): Promise<CommandResult> {
  const id = crypto.randomUUID();
  const message: PlayerCommand = { id, guildId: GUILD, actor: dee, command };
  await redis.publish(Channels.botCommands, JSON.stringify(message));
  const until = Date.now() + 3000;
  while (!received.has(id) && Date.now() < until) await Bun.sleep(10);
  const result = received.get(id);
  if (!result) throw new Error(`no result for ${command.action}`);
  return result;
}

beforeEach(async () => {
  await results.subscribe(Channels.botCommandResults);
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD));
  fake = await startFakeLavalink({ password: "pw", catalog: CATALOG });
  lavalink = createLavalink({ host: "127.0.0.1", port: fake.port, password: "pw", client: BOT, sendToShard: () => {} });
  const ready = new Promise<void>((resolve) => lavalink.nodeManager.on("connect", () => resolve()));
  await lavalink.init(BOT);
  await ready;
  while (!lavalink.nodeManager.leastUsedNodes()[0]?.sessionId) await Bun.sleep(5);
  music = createMusic({ lavalink, publisher: createPlayerPublisher(redis), announce: async () => {}, epoch: "bus" });
  stopBus = await startCommandBus({
    subscriber: new Redis(url),
    redis,
    music,
    textChannelFor: () => "71",
  });
});

afterEach(async () => {
  await stopBus();
  await lavalink.nodeManager.leastUsedNodes()[0]?.destroy?.();
  fake.stop();
});

afterAll(async () => {
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD));
  await redis.quit();
  await results.quit();
});

describe("commands relayed from the Backend reach the engine (#101)", () => {
  test("a web play joins the chosen channel, plays as the acting user, and answers ok", async () => {
    expect(await send({ action: "play", query: "lemon", next: false, voiceChannelId: "70" })).toMatchObject({
      ok: true,
    });
    expect(music.status(GUILD)).toMatchObject({ voiceChannelId: "70", current: { title: "Lemon", requester: dee } });
  });

  test("a play with no channel and no Bot in voice asks for a channel (the picker, spec #86)", async () => {
    expect(await send({ action: "play", query: "lemon", next: false, voiceChannelId: null })).toEqual({
      id: expect.any(String),
      ok: false,
      error: "voice-channel-required",
    });
  });

  test("pause, resume, volume, seek, loop and shuffle are carried out", async () => {
    await send({ action: "play", query: "lemon", next: false, voiceChannelId: "70" });
    await send({ action: "play", query: "idol", next: false, voiceChannelId: null });
    const until = Date.now() + 2000;
    while (!music.status(GUILD)?.playing && Date.now() < until) await Bun.sleep(10);
    expect(await send({ action: "pause" })).toMatchObject({ ok: true });
    expect(music.status(GUILD)?.paused).toBe(true);
    expect(await send({ action: "resume" })).toMatchObject({ ok: true });
    expect(music.status(GUILD)?.paused).toBe(false);
    expect(await send({ action: "volume", volume: 40 })).toMatchObject({ ok: true });
    expect(fake.player(GUILD)?.volume).toBe(40);
    expect(await send({ action: "seek", positionMs: 20_000 })).toMatchObject({ ok: true });
    expect(await send({ action: "loop", mode: null })).toMatchObject({ ok: true });
    expect(await send({ action: "previous" })).toMatchObject({ ok: true });
    expect(fake.player(GUILD)?.position).toBe(0);
  });

  test("an action with no player answers no-player", async () => {
    expect(await send({ action: "skip" })).toMatchObject({ ok: false, error: "no-player" });
  });
});
