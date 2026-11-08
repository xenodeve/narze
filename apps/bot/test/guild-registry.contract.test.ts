import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_REDIS_URL, RedisKeys } from "@narze/shared";
import Redis from "ioredis";
import { createGuildRegistry } from "../src/guild-registry";

const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const registry = createGuildRegistry(redis);
const G1 = "910000000000000001";
const G2 = "910000000000000002";

beforeEach(async () => {
  await redis.del(RedisKeys.botGuilds, RedisKeys.voiceStates(G1), RedisKeys.voiceStates(G2));
});
afterAll(async () => {
  await redis.del(RedisKeys.botGuilds, RedisKeys.voiceStates(G1), RedisKeys.voiceStates(G2));
  await redis.quit();
});

describe("the Bot's guild set and voice states on Redis (Bot→Backend contract)", () => {
  test("ready replaces the whole set and drops voice states of guilds the Bot left while away", async () => {
    await registry.replace([
      { id: G1, voice: [["1", "50"]] },
      { id: G2, voice: [] },
    ]);
    await registry.replace([{ id: G2, voice: [["2", "60"]] }]);
    expect(await redis.smembers(RedisKeys.botGuilds)).toEqual([G2]);
    expect(await redis.hgetall(RedisKeys.voiceStates(G1))).toEqual({});
    expect(await redis.hgetall(RedisKeys.voiceStates(G2))).toEqual({ "2": "60" });
  });

  test("joining and leaving a guild updates the set", async () => {
    await registry.add({ id: G1, voice: [["1", "50"]] });
    expect(await redis.sismember(RedisKeys.botGuilds, G1)).toBe(1);
    await registry.remove(G1);
    expect(await redis.sismember(RedisKeys.botGuilds, G1)).toBe(0);
    expect(await redis.exists(RedisKeys.voiceStates(G1))).toBe(0);
  });

  test("a member moving channel or leaving voice is reflected", async () => {
    await registry.voice(G1, "7", "70");
    await registry.voice(G1, "7", "71");
    expect(await redis.hget(RedisKeys.voiceStates(G1), "7")).toBe("71");
    await registry.voice(G1, "7", null);
    expect(await redis.hexists(RedisKeys.voiceStates(G1), "7")).toBe(0);
  });
});
