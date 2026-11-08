import { describe, expect, test } from "bun:test";
import { BotHeartbeatSchema, BotStatusPayloadSchema, botStatusAt, HEARTBEAT_TTL_MS } from "../src/status";

const beat = (at: number) =>
  BotHeartbeatSchema.parse({ botId: "1234", at, mode: "connected", guilds: 3, version: "7.0.0" });

describe("Bot status from heartbeat", () => {
  test("the TTL is five seconds, as the walking-skeleton acceptance criterion states", () => {
    expect(HEARTBEAT_TTL_MS).toBe(5000);
  });

  test("a heartbeat 4999 ms old means the Bot is online", () => {
    expect(botStatusAt(beat(10_000), 14_999)).toBe("online");
  });

  test("a heartbeat 5001 ms old means the Bot is offline", () => {
    expect(botStatusAt(beat(10_000), 15_001)).toBe("offline");
  });

  test("no heartbeat ever received means offline", () => {
    expect(botStatusAt(null, 15_001)).toBe("offline");
  });

  test("a heartbeat from the future (clock skew) still counts as online", () => {
    expect(botStatusAt(beat(20_000), 15_000)).toBe("online");
  });

  test("a heartbeat without a botId is rejected", () => {
    const result = BotHeartbeatSchema.safeParse({ at: 1, mode: "connected", guilds: 0, version: "7.0.0" });
    expect(result.success).toBe(false);
  });

  test("an unknown mode is rejected", () => {
    const result = BotHeartbeatSchema.safeParse({ botId: "1", at: 1, mode: "detached", guilds: 0, version: "7.0.0" });
    expect(result.success).toBe(false);
  });
});

describe("Bot status payload (Backend → Dashboard)", () => {
  test("accepts an offline payload with no heartbeat", () => {
    expect(BotStatusPayloadSchema.parse({ status: "offline", heartbeat: null }).status).toBe("offline");
  });

  test("rejects a status outside online/offline", () => {
    expect(BotStatusPayloadSchema.safeParse({ status: "busy", heartbeat: null }).success).toBe(false);
  });
});
