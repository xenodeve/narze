import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type BotHeartbeat, type BotStatusPayload, Channels, DEFAULT_REDIS_URL, SocketEvents } from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../src/app";

const REDIS_URL = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
let app: INestApplication;
let url: string;
const publisher = new Redis(REDIS_URL);

// Mitigation, not a fix: the first full-suite run after `bun install` once failed this hook at
// ~5.4 s (Bun's 5 s hook default). It did not reproduce in 7 later runs, including with the
// transpiler cache disabled, so the cause is unknown. If it recurs, time createApp vs listen to locate it.
beforeAll(async () => {
  app = await createApp({ redisUrl: REDIS_URL, dashboardOrigin: "http://localhost:3000" });
  await app.listen(0);
  url = await app.getUrl();
}, 30_000);

afterAll(async () => {
  await app.close();
  await publisher.quit();
});

function nextStatus(socket: Socket, want: BotStatusPayload["status"]): Promise<BotStatusPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${want} status within 2s`)), 2000);
    socket.on(SocketEvents.botStatus, (payload) => {
      if (payload.status === want) {
        clearTimeout(timer);
        resolve(payload);
      }
    });
  });
}

describe("Bot status on the Dashboard socket (Backend seam)", () => {
  test("a newly connected client is told the Bot is offline before any heartbeat", async () => {
    const socket = io(url, { transports: ["websocket"] });
    const first = await nextStatus(socket, "offline");
    socket.close();
    expect(first.heartbeat).toBeNull();
  });

  test("a heartbeat on Redis reaches connected clients as online", async () => {
    const socket = io(url, { transports: ["websocket"] });
    await nextStatus(socket, "offline");
    const online = nextStatus(socket, "online");
    const beat: BotHeartbeat = {
      botId: "1100000000000000009",
      at: Date.now(),
      mode: "connected",
      guilds: 2,
      version: "t",
    };
    await publisher.publish(Channels.botHeartbeat, JSON.stringify(beat));
    const payload = await online;
    socket.close();
    expect(payload.heartbeat?.guilds).toBe(2);
  });

  test("a malformed heartbeat is ignored and does not crash the Backend", async () => {
    await publisher.publish(Channels.botHeartbeat, "{not json");
    await publisher.publish(Channels.botHeartbeat, JSON.stringify({ botId: "" }));
    const socket = io(url, { transports: ["websocket"] });
    const status = await new Promise<string>((resolve) => socket.on(SocketEvents.botStatus, (p) => resolve(p.status)));
    socket.close();
    expect(["online", "offline"]).toContain(status);
  });
});

describe("Socket CORS (only the Dashboard origin may open a socket from a browser)", () => {
  const handshake = (origin: string) =>
    fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: origin } });

  test("the configured Dashboard origin is allowed", async () => {
    const res = await handshake("http://localhost:3000");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  test("any other origin is not allowed", async () => {
    const res = await handshake("https://evil.example");
    expect(res.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
  });
});
