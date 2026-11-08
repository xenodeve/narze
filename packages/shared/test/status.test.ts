import { describe, expect, test } from "bun:test";
import {
  BotHeartbeatSchema,
  BotStatusPayloadSchema,
  botStatusAt,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_MS,
} from "../src/status";

/** #98: the Dashboard must show a stopped Bot as offline within 5 s. */
const OFFLINE_WITHIN_MS = 5000;
/** Room the flip needs after expiry: the Backend's expiry margin, the socket hop and a render. */
const DELIVERY_BUDGET_MS = 500;

describe("Bot status from heartbeat", () => {
  test("the worst-case offline flip (TTL + delivery) fits inside the 5 s criterion", () => {
    expect(HEARTBEAT_TTL_MS + DELIVERY_BUDGET_MS).toBeLessThanOrEqual(OFFLINE_WITHIN_MS);
  });

  test("the TTL tolerates one lost heartbeat", () => {
    expect(HEARTBEAT_TTL_MS).toBeGreaterThanOrEqual(2 * HEARTBEAT_INTERVAL_MS);
  });

  test("a heartbeat 1 ms younger than the TTL means the Bot is online", () => {
    expect(botStatusAt(10_000, 10_000 + HEARTBEAT_TTL_MS - 1)).toBe("online");
  });

  test("a heartbeat 1 ms older than the TTL means the Bot is offline", () => {
    expect(botStatusAt(10_000, 10_000 + HEARTBEAT_TTL_MS + 1)).toBe("offline");
  });

  test("no heartbeat ever received means offline", () => {
    expect(botStatusAt(null, 15_001)).toBe("offline");
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
