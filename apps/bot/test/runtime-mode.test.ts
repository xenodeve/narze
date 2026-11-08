import { describe, expect, test } from "bun:test";
import { DEFAULT_REDIS_URL } from "@narze/shared";
import { detectRuntimeMode } from "../src/runtime-mode";

describe("Runtime mode detection (ADR-0003)", () => {
  test("a reachable Redis means Connected Mode, and the live client is handed back", async () => {
    const result = await detectRuntimeMode(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, 1000);
    expect(result.mode).toBe("connected");
    expect(await result.redis?.ping()).toBe("PONG");
    await result.redis?.quit();
  });

  test("an unreachable Redis means Standalone Mode within the timeout", async () => {
    const started = Date.now();
    const result = await detectRuntimeMode("redis://127.0.0.1:6390", 300);
    expect(result.mode).toBe("standalone");
    expect(result.redis).toBeNull();
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
