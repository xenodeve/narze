import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import { createBotBootstrap } from "../src/bot-bootstrap";
import type { RedisClientLike } from "../src/redis-adapter";

test("Standalone Mode starts without Redis and loads settings from Supabase provider", async () => {
  let redisClients = 0;
  let supabaseLoads = 0;
  const bootstrap = await createBotBootstrap({
    env: {},
    connectRedis: async () => {
      throw new Error("Redis should not be checked without REDIS_URL");
    },
    createRedisClient: () => {
      redisClients += 1;
      return new FakeRedisClient();
    },
    loadGuildSettingsFromSupabase: async (guildId) => {
      supabaseLoads += 1;
      return {
        guildId,
        musicChannelId: "music-1",
        volumeLimit: 70,
      };
    },
    loadGuildSettingsFromConnectedCache: async () => {
      throw new Error("Connected settings cache should not be used");
    },
    getRuntimeGuildState: async () => undefined,
    getActiveGuildIds: () => ["guild-1"],
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await bootstrap.start();
  const settings = await bootstrap.settingsProvider.getGuildSettings("guild-1");

  assert.equal(bootstrap.mode, "standalone");
  assert.equal(redisClients, 0);
  assert.equal(supabaseLoads, 1);
  assert.deepEqual(settings, {
    guildId: "guild-1",
    musicChannelId: "music-1",
    volumeLimit: 70,
  });
});

test("Connected Mode subscribes state requests and publishes full PlayerState", async () => {
  const clients: FakeRedisClient[] = [];
  const bootstrap = await createBotBootstrap({
    env: { REDIS_URL: "redis://localhost:6379" },
    connectRedis: async () => {},
    createRedisClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    loadGuildSettingsFromSupabase: async () => {
      throw new Error("Supabase settings should not be used in Connected Mode");
    },
    loadGuildSettingsFromConnectedCache: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 55,
    }),
    getRuntimeGuildState: async () => ({
      currentTrack: {
        uri: "https://example.test/current",
        title: "Current",
        artist: "Artist",
        thumbnailUrl: "https://example.test/thumb.jpg",
        durationMs: 120_000,
        source: "youtube",
        requesterId: "discord-user-1",
      },
      queue: [],
      volume: 80,
    }),
    getActiveGuildIds: () => [],
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await bootstrap.start();
  clients[0]?.emit(
    "pmessage",
    "backend:request:state:*",
    "backend:request:state:guild-1",
    "{}",
  );
  await flushRedisCallbacks();

  assert.equal(bootstrap.mode, "connected");
  assert.deepEqual(clients[0]?.psubscribeCalls, [["backend:request:state:*"]]);
  assert.deepEqual(clients[1]?.publishCalls, [
    [
      "bot:guild-1:state:full",
      JSON.stringify({
        guildId: "guild-1",
        botMode: "connected",
        isPlaying: true,
        isPaused: false,
        volume: 55,
        loopMode: "off",
        position: 0,
        currentTrack: {
          uri: "https://example.test/current",
          title: "Current",
          artist: "Artist",
          thumbnailUrl: "https://example.test/thumb.jpg",
          durationMs: 120_000,
          source: "youtube",
          requesterId: "discord-user-1",
        },
        queue: [],
        voiceChannelId: null,
      }),
    ],
  ]);
});

test("Connected Mode Redis reconnect publishes full state for active Guilds", async () => {
  const clients: FakeRedisClient[] = [];
  const bootstrap = await createBotBootstrap({
    env: { REDIS_URL: "redis://localhost:6379" },
    connectRedis: async () => {},
    createRedisClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    loadGuildSettingsFromSupabase: async () => {
      throw new Error("Supabase settings should not be used in Connected Mode");
    },
    loadGuildSettingsFromConnectedCache: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 100,
    }),
    getRuntimeGuildState: async () => undefined,
    getActiveGuildIds: () => ["guild-1", "guild-2"],
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await bootstrap.start();
  clients[0]?.emit("ready");
  clients[1]?.emit("ready");
  clients[0]?.emit("close");
  clients[1]?.emit("ready");
  clients[0]?.emit("ready");
  await flushRedisCallbacks();

  assert.deepEqual(
    clients[1]?.publishCalls.map(([channel]) => channel),
    ["bot:guild-1:state:full", "bot:guild-2:state:full"],
  );
});

test("Connected Mode Redis reconnect reports active Guilds whose full state cannot be published", async () => {
  const clients: FakeRedisClient[] = [];
  const bootstrap = await createBotBootstrap({
    env: { REDIS_URL: "redis://localhost:6379" },
    connectRedis: async () => {},
    createRedisClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    loadGuildSettingsFromSupabase: async () => {
      throw new Error("Supabase settings should not be used in Connected Mode");
    },
    loadGuildSettingsFromConnectedCache: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 100,
    }),
    getRuntimeGuildState: async () => undefined,
    getActiveGuildIds: () => ["guild-1", "guild-2"],
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await bootstrap.start();
  clients[1]!.publishFailures.add("bot:guild-1:state:full");

  const result = await bootstrap.lifecycle.handleReconnect();

  assert.deepEqual(result.failedGuildIds, ["guild-1"]);
  assert.deepEqual(
    clients[1]?.publishCalls.map(([channel]) => channel),
    ["bot:guild-1:state:full", "bot:guild-2:state:full"],
  );
});

class FakeRedisClient implements RedisClientLike {
  psubscribeCalls: string[][] = [];
  publishCalls: Array<[string, string]> = [];
  quitCalls = 0;
  publishFailures = new Set<string>();
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  async psubscribe(...patterns: string[]): Promise<unknown> {
    this.psubscribeCalls.push(patterns);
    return undefined;
  }

  async publish(channel: string, message: string): Promise<unknown> {
    this.publishCalls.push([channel, message]);
    if (this.publishFailures.has(channel)) {
      throw new Error(`publish failed for ${channel}`);
    }

    return undefined;
  }

  async quit(): Promise<unknown> {
    this.quitCalls += 1;
    return undefined;
  }

  on(event: string, callback: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(callback);
    this.listeners.set(event, listeners);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

async function flushRedisCallbacks(): Promise<void> {
  await setImmediate();
  await setImmediate();
}
