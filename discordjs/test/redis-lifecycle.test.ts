import assert from "node:assert/strict";
import test from "node:test";

import { createRedisLifecycle } from "../src/redis-lifecycle";

test("Standalone Mode does not start Redis lifecycle", async () => {
  let starts = 0;
  const lifecycle = createRedisLifecycle({
    mode: "standalone",
    startRedis: async () => {
      starts += 1;
    },
    getActiveGuildIds: () => ["guild-1"],
    publishFullState: async () => {
      throw new Error("State should not be published in Standalone Mode");
    },
  });

  await lifecycle.start();
  await lifecycle.handleReconnect();

  assert.equal(lifecycle.getMode(), "standalone");
  assert.equal(starts, 0);
});

test("Connected Mode publishes full state for every active Guild on Redis reconnect", async () => {
  let starts = 0;
  const publishedGuilds: string[] = [];
  const lifecycle = createRedisLifecycle({
    mode: "connected",
    startRedis: async () => {
      starts += 1;
    },
    getActiveGuildIds: () => ["guild-1", "guild-2"],
    publishFullState: async (guildId) => {
      publishedGuilds.push(guildId);
    },
  });

  await lifecycle.start();
  await lifecycle.handleReconnect();

  assert.equal(lifecycle.getMode(), "connected");
  assert.equal(starts, 1);
  assert.deepEqual(publishedGuilds, ["guild-1", "guild-2"]);
});

test("Connected Mode continues resyncing other Guilds when one publish fails", async () => {
  const publishedGuilds: string[] = [];
  const lifecycle = createRedisLifecycle({
    mode: "connected",
    startRedis: async () => {},
    getActiveGuildIds: () => ["guild-1", "guild-2", "guild-3"],
    publishFullState: async (guildId) => {
      publishedGuilds.push(guildId);

      if (guildId === "guild-2") {
        throw new Error("publish failed");
      }
    },
  });

  const result = await lifecycle.handleReconnect();

  assert.deepEqual(publishedGuilds, ["guild-1", "guild-2", "guild-3"]);
  assert.deepEqual(result.failedGuildIds, ["guild-2"]);
});
