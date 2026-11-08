import { describe, expect, test } from "bun:test";
import { type BotHeartbeat, HEARTBEAT_TTL_MS } from "@narze/shared";
import { BotStatusTracker } from "../src/status/bot-status.tracker";

const beat = (at: number): BotHeartbeat => ({ botId: "1", at, mode: "connected", guilds: 1, version: "t" });

describe("BotStatusTracker", () => {
  test("reports a change to online on the first valid heartbeat", () => {
    const now = 1_000;
    const seen: string[] = [];
    const tracker = new BotStatusTracker(() => now);
    tracker.onChange((s) => seen.push(s.status));
    tracker.receive(JSON.stringify(beat(1_000)));
    expect(seen).toEqual(["online"]);
  });

  test("flips to offline once the heartbeat is older than the TTL, and only once", () => {
    let now = 1_000;
    const seen: string[] = [];
    const tracker = new BotStatusTracker(() => now);
    tracker.receive(JSON.stringify(beat(1_000)));
    tracker.onChange((s) => seen.push(s.status));
    now = 1_000 + HEARTBEAT_TTL_MS - 1;
    tracker.tick();
    now = 1_000 + HEARTBEAT_TTL_MS + 1;
    tracker.tick();
    tracker.tick();
    expect(seen).toEqual(["offline"]);
  });

  test("reports how long until the heartbeat expires, and null before any heartbeat", () => {
    let now = 1_000;
    const tracker = new BotStatusTracker(() => now);
    expect(tracker.msUntilExpiry()).toBeNull();
    tracker.receive(JSON.stringify(beat(1_000)));
    now = 3_000;
    expect(tracker.msUntilExpiry()).toBe(HEARTBEAT_TTL_MS - 2_000);
  });

  test("ignores messages that do not satisfy the BotHeartbeat schema", () => {
    const tracker = new BotStatusTracker(() => 0);
    tracker.receive("{not json");
    tracker.receive(JSON.stringify({ botId: "" }));
    expect(tracker.snapshot().status).toBe("offline");
  });
});

describe("BotStatusTracker against a Bot whose clock runs ahead", () => {
  test("expiry is measured on the Backend's clock from receipt, so a fast Bot clock cannot keep a dead Bot online", () => {
    let now = 1_000;
    const tracker = new BotStatusTracker(() => now);
    // The Bot's clock is an hour ahead of the Backend's.
    tracker.receive(JSON.stringify(beat(now + 3_600_000)));
    expect(tracker.snapshot().status).toBe("online");
    expect(tracker.msUntilExpiry()).toBe(HEARTBEAT_TTL_MS);

    now += HEARTBEAT_TTL_MS + 1;
    tracker.tick();
    expect(tracker.snapshot().status).toBe("offline");
  });
});
