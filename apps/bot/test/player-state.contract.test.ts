import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  Channels,
  DEFAULT_REDIS_URL,
  GuildEventSchema,
  GuildEventTypes,
  PlayerStateSchema,
  PlayerSummarySchema,
  RedisKeys,
} from "@narze/shared";
import Redis from "ioredis";
import { createPlayerPublisher, type PlayerView, toPlayerState } from "../src/music/player-state";

const GUILD = "950000000000000001";
const requester = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const lt = (title: string, uri = `https://music.youtube.com/watch?v=${title}`) =>
  ({
    encoded: "x",
    info: { title, author: "A", duration: 200_000, uri, sourceName: "youtube", artworkUrl: null },
    requester,
  }) as never;

const view = (over: Partial<PlayerView> = {}): PlayerView => ({
  guildId: GUILD,
  current: lt("now"),
  queue: [lt("next")],
  position: 1_500,
  paused: false,
  volume: 15,
  repeatMode: "off",
  voiceChannelId: "77",
  ...over,
});

describe("Player State from the Lavalink player", () => {
  test("a playing player maps to a valid Player State with its queue and revision", () => {
    const state = toPlayerState(view(), {
      revision: 3,
      twentyFourSeven: false,
      now: 9_000,
      epoch: "e1",
      lastSeekAt: null,
    });
    expect(PlayerStateSchema.safeParse(state).success).toBe(true);
    expect(state).toMatchObject({ positionMs: 1_500, syncedAt: 9_000, volume: 15, loop: "off", revision: 3 });
    expect(state?.queue.map((t) => t.title)).toEqual(["next"]);
  });

  test("a current or queued track without identity makes the whole state invalid (never published)", () => {
    expect(
      toPlayerState(view({ current: lt("bad", "") }), {
        revision: 0,
        twentyFourSeven: false,
        now: 0,
        epoch: "e1",
        lastSeekAt: null,
      }),
    ).toBeNull();
    expect(
      toPlayerState(view({ queue: [lt("bad", "")] }), {
        revision: 0,
        twentyFourSeven: false,
        now: 0,
        epoch: "e1",
        lastSeekAt: null,
      }),
    ).toBeNull();
  });
});

// Its own Redis database: the sweep test removes every Player State key it can see, and `verify`
// runs the Backend's tests at the same time on database 0. (Pub/sub is shared across databases;
// the sweep only announces the keys it found, which here are this file's.)
// The database goes in the URL: ioredis lets a URL's database win over a `db` option, and the
// test preload (test/redis-db.ts) puts one in REDIS_URL.
const ownDb = (() => {
  const url = new URL(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
  url.pathname = "/15";
  return url.toString();
})();
const redis = new Redis(ownDb);
const subscriber = new Redis(ownDb);
const keys = [RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD)];
beforeEach(() => redis.del(...keys));
afterAll(async () => {
  await redis.del(...keys);
  await redis.quit();
  await subscriber.quit();
});

describe("publishing a Player State (Bot→Backend contract)", () => {
  test("sets the state and summary keys before announcing both as Guild events", async () => {
    const events: Array<{ type: string; seen: boolean }> = [];
    await subscriber.subscribe(Channels.guildEvents);
    subscriber.on("message", async (_c, raw) => {
      const event = GuildEventSchema.parse(JSON.parse(raw));
      if (event.guildId !== GUILD) return;
      events.push({ type: event.type, seen: (await redis.exists(RedisKeys.playerState(GUILD))) === 1 });
    });
    const state = toPlayerState(view(), { revision: 1, twentyFourSeven: false, now: 1, epoch: "e1", lastSeekAt: null });
    if (!state) throw new Error("invalid");
    await createPlayerPublisher(redis).publish(state);
    await Bun.sleep(100);
    expect(events).toEqual([
      { type: GuildEventTypes.playerState, seen: true },
      { type: GuildEventTypes.playerSummary, seen: true },
    ]);
    expect(PlayerSummarySchema.parse(JSON.parse((await redis.get(RedisKeys.playerSummary(GUILD))) ?? ""))).toEqual({
      playing: true,
      queueLength: 1,
      voiceChannelId: "77",
    });
  });

  test("on start, states left by a previous Bot process are swept and announced as gone", async () => {
    const state = toPlayerState(view(), {
      revision: 9,
      twentyFourSeven: false,
      now: 1,
      epoch: "old",
      lastSeekAt: null,
    });
    if (!state) throw new Error("invalid");
    await createPlayerPublisher(redis).publish(state);
    await createPlayerPublisher(redis).sweep();
    expect(await redis.exists(...keys)).toBe(0);
  });

  test("a destroyed player removes both keys", async () => {
    const state = toPlayerState(view(), { revision: 1, twentyFourSeven: false, now: 1, epoch: "e1", lastSeekAt: null });
    if (!state) throw new Error("invalid");
    const publisher = createPlayerPublisher(redis);
    await publisher.publish(state);
    await publisher.gone(GUILD);
    expect(await redis.exists(...keys)).toBe(0);
  });
});
