import { describe, expect, test } from "bun:test";
import { DEFAULT_REDIS_URL } from "@narze/shared";
import Redis from "ioredis";
import { detectRuntimeMode, subscriberOf } from "../src/runtime-mode";

describe("Runtime mode detection (ADR-0003)", () => {
  test("a reachable Redis means Connected Mode, and the live client is handed back", async () => {
    const result = await detectRuntimeMode(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, 1000);
    expect(result.mode).toBe("connected");
    expect(await result.redis?.ping()).toBe("PONG");
    await result.redis?.quit();
  });

  test("once connected, the client (and its duplicates) reconnect after Redis drops them (#133)", async () => {
    const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
    const { redis } = await detectRuntimeMode(url, 1000);
    if (!redis) throw new Error("expected Connected Mode");
    const subscriber = subscriberOf(redis);
    const admin = new Redis(url);
    try {
      const subscriberId = String(await subscriber.client("ID"));
      await subscriber.subscribe("narze:test:reconnect");
      // What a Redis restart does to every client: the server drops the connections.
      await admin.client("KILL", "ID", String(await redis.client("ID")));
      await admin.client("KILL", "ID", subscriberId);
      await Bun.sleep(1500);
      expect(await redis.ping()).toBe("PONG");
      // A subscriber comes back subscribed: it hears a publish made after the drop.
      const heard = new Promise<string>((resolve) => subscriber.once("message", (_c, m) => resolve(m)));
      await admin.publish("narze:test:reconnect", "back");
      expect(await Promise.race([heard, Bun.sleep(2000).then(() => "silent")])).toBe("back");
    } finally {
      subscriber.disconnect();
      redis.disconnect();
      await admin.quit();
    }
  });

  test("an unreachable Redis means Standalone Mode within the timeout", async () => {
    const started = Date.now();
    const result = await detectRuntimeMode("redis://127.0.0.1:6390", 300);
    expect(result.mode).toBe("standalone");
    expect(result.redis).toBeNull();
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
