import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  Channels,
  DEFAULT_REDIS_URL,
  GuildEventSchema,
  GuildEventTypes,
  RedisKeys,
  VoiceChannelListSchema,
} from "@narze/shared";
import Redis from "ioredis";
import { createGuildRegistry } from "../src/guild-registry";

const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const registry = createGuildRegistry(redis);
const G1 = "910000000000000001";
const G2 = "910000000000000002";

beforeEach(async () => {
  await redis.del(
    RedisKeys.botGuilds,
    RedisKeys.botMemberCounts,
    RedisKeys.botGuildOwners,
    RedisKeys.voiceStates(G1),
    RedisKeys.voiceStates(G2),
  );
});
afterAll(async () => {
  await redis.del(
    RedisKeys.botGuilds,
    RedisKeys.botMemberCounts,
    RedisKeys.botGuildOwners,
    RedisKeys.voiceStates(G1),
    RedisKeys.voiceStates(G2),
  );
  await redis.quit();
});

describe("the Bot's guild set and voice states on Redis (Bot→Backend contract)", () => {
  test("ready replaces the whole set and drops voice states of guilds the Bot left while away", async () => {
    await registry.replace([
      { id: G1, memberCount: 5, voice: [["1", "50"]], ownerId: "100" },
      { id: G2, memberCount: 3, voice: [], ownerId: "200" },
    ]);
    await registry.replace([{ id: G2, memberCount: 4, voice: [["2", "60"]], ownerId: "200" }]);
    expect(await redis.smembers(RedisKeys.botGuilds)).toEqual([G2]);
    expect(await redis.hgetall(RedisKeys.voiceStates(G1))).toEqual({});
    expect(await redis.hgetall(RedisKeys.voiceStates(G2))).toEqual({ "2": "60" });
    expect(await redis.hgetall(RedisKeys.botMemberCounts)).toEqual({ [G2]: "4" });
  });

  test("joining and leaving a guild updates the set", async () => {
    await registry.add({ id: G1, memberCount: 5, voice: [["1", "50"]], ownerId: "100" });
    expect(await redis.sismember(RedisKeys.botGuilds, G1)).toBe(1);
    await registry.remove(G1);
    expect(await redis.sismember(RedisKeys.botGuilds, G1)).toBe(0);
    expect(await redis.exists(RedisKeys.voiceStates(G1))).toBe(0);
    expect(await redis.hexists(RedisKeys.botMemberCounts, G1)).toBe(0);
  });

  test("each guild's owner is published, follows a change of hands, and goes with the guild (#141)", async () => {
    await registry.replace([
      { id: G1, memberCount: 5, voice: [], ownerId: "100" },
      { id: G2, memberCount: 3, voice: [], ownerId: "200" },
    ]);
    expect(await redis.hgetall(RedisKeys.botGuildOwners)).toEqual({ [G1]: "100", [G2]: "200" });
    await registry.owner(G1, "101");
    expect(await redis.hget(RedisKeys.botGuildOwners, G1)).toBe("101");
    await registry.remove(G1);
    expect(await redis.hexists(RedisKeys.botGuildOwners, G1)).toBe(0);
    await registry.replace([{ id: G2, memberCount: 3, voice: [], ownerId: "200" }]);
    expect(await redis.hgetall(RedisKeys.botGuildOwners)).toEqual({ [G2]: "200" });
  });

  test("a member moving channel or leaving voice is reflected", async () => {
    await registry.voice(G1, "7", "70");
    await registry.voice(G1, "7", "71");
    expect(await redis.hget(RedisKeys.voiceStates(G1), "7")).toBe("71");
    await registry.voice(G1, "7", null);
    expect(await redis.hexists(RedisKeys.voiceStates(G1), "7")).toBe(0);
  });
});

describe("voice channels for the Dashboard picker (spec #86)", () => {
  test("the list is stored and announced as a voice:update Guild event", async () => {
    const listener = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
    await listener.subscribe(Channels.guildEvents);
    const announced = new Promise<unknown>((resolve) =>
      listener.on("message", (_c, raw) => {
        const event = GuildEventSchema.parse(JSON.parse(raw));
        if (event.guildId === G1 && event.type === GuildEventTypes.voiceUpdate) resolve(event.data);
      }),
    );
    const list = [{ id: "70", name: "Lounge", members: [{ id: "7", name: "Dee", avatarUrl: null }] }];
    await registry.voiceChannels(G1, list);
    expect(VoiceChannelListSchema.parse(await announced)).toEqual(list);
    expect(JSON.parse((await redis.get(RedisKeys.voiceChannels(G1))) ?? "null")).toEqual(list);
    await redis.del(RedisKeys.voiceChannels(G1));
    await listener.quit();
  });
});

describe("text channels for the Music Channel picker (#106)", () => {
  test("the list is stored for the Backend to validate and offer, and dropped when the Bot leaves", async () => {
    await registry.textChannels(G1, [{ id: "501", name: "music" }]);
    expect(JSON.parse((await redis.get(RedisKeys.textChannels(G1))) ?? "null")).toEqual([{ id: "501", name: "music" }]);
    await registry.remove(G1);
    expect(await redis.get(RedisKeys.textChannels(G1))).toBeNull();
  });
});
