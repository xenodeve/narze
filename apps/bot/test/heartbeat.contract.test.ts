import { afterAll, describe, expect, test } from "bun:test";
import { BotHeartbeatSchema, Channels, DEFAULT_REDIS_URL } from "@narze/shared";
import Redis from "ioredis";
import { startHeartbeat } from "../src/heartbeat";

const REDIS_URL = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const subscriber = new Redis(REDIS_URL);
const publisher = new Redis(REDIS_URL);

afterAll(async () => {
  await subscriber.quit();
  await publisher.quit();
});

function collect(ms: number): Promise<string[]> {
  const received: string[] = [];
  const onMessage = (channel: string, message: string) => {
    if (channel === Channels.botHeartbeat) received.push(message);
  };
  subscriber.on("message", onMessage);
  return new Promise((resolve) =>
    setTimeout(() => {
      subscriber.off("message", onMessage);
      resolve(received);
    }, ms),
  );
}

describe("Bot heartbeat over Redis (Bot↔Backend contract)", () => {
  test("every published heartbeat satisfies the shared BotHeartbeat schema", async () => {
    await subscriber.subscribe(Channels.botHeartbeat);
    const stop = startHeartbeat({
      publish: (channel, message) => publisher.publish(channel, message),
      botId: () => "1100000000000000001",
      mode: "connected",
      version: "7.0.0-test",
      guildCount: () => 4,
      intervalMs: 40,
    });
    const messages = await collect(200);
    stop();

    expect(messages.length).toBeGreaterThanOrEqual(3);
    const beats = messages.map((m) => BotHeartbeatSchema.parse(JSON.parse(m)));
    expect(beats[0]).toMatchObject({ botId: "1100000000000000001", mode: "connected", guilds: 4 });
  });

  test("no heartbeat is published after stop()", async () => {
    await subscriber.subscribe(Channels.botHeartbeat);
    const stop = startHeartbeat({
      publish: (channel, message) => publisher.publish(channel, message),
      botId: () => "1100000000000000002",
      mode: "standalone",
      version: "7.0.0-test",
      guildCount: () => 0,
      intervalMs: 40,
    });
    stop();
    const after = (await collect(150)).filter((m) => m.includes("1100000000000000002"));
    // The immediate first beat may land before stop(); nothing may follow it.
    expect(after.length).toBeLessThanOrEqual(1);
  });
});
