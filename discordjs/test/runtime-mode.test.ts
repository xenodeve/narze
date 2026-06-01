import assert from "node:assert/strict";
import test from "node:test";

import { detectRuntimeMode } from "../src/runtime-mode";

test("enters Standalone Mode without REDIS_URL", async () => {
  let calls = 0;

  const result = await detectRuntimeMode({
    env: {},
    connectRedis: async () => {
      calls += 1;
    },
  });

  assert.equal(result.mode, "standalone");
  assert.equal(result.reason, "redis_url_missing");
  assert.equal(calls, 0);
});

test("enters Connected Mode when Redis connects", async () => {
  const calls: string[] = [];

  const result = await detectRuntimeMode({
    env: { REDIS_URL: "redis://localhost:6379" },
    connectRedis: async (redisUrl) => {
      calls.push(redisUrl);
    },
  });

  assert.equal(result.mode, "connected");
  assert.equal(result.reason, "redis_connected");
  assert.deepEqual(calls, ["redis://localhost:6379"]);
});

test("falls back to Standalone Mode when Redis connect fails", async () => {
  const result = await detectRuntimeMode({
    env: { REDIS_URL: "redis://localhost:6379" },
    connectRedis: async () => {
      throw new Error("ECONNREFUSED");
    },
  });

  assert.equal(result.mode, "standalone");
  assert.equal(result.reason, "redis_unavailable");
});

test("falls back to Standalone Mode when Redis connect times out", async () => {
  let aborted = false;

  const result = await detectRuntimeMode({
    env: { REDIS_URL: "redis://localhost:6379" },
    timeoutMs: 10,
    connectRedis: async (_redisUrl, signal) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    },
  });

  assert.equal(result.mode, "standalone");
  assert.equal(result.reason, "redis_unavailable");
  assert.equal(aborted, true);
});
