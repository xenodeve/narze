import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import { DEFAULT_REDIS_URL } from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import { io } from "socket.io-client";
import { createApp } from "../src/app";
import { RateLimiter } from "../src/rate-limit";

const supabase = localSupabase();
const ria = { id: "360000000000000001", username: "ria142", globalName: "Ria" };
const MINUTE = 60_000;

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
let session: FakeSession;

/** The test client connects from 127.0.0.1, a trusted proxy: X-Forwarded-For names the client. */
const from = (ip: string, extra: Record<string, string> = {}) => ({ "x-forwarded-for": ip, ...extra });

beforeAll(async () => {
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  app = await createApp({
    redisUrl: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
    rateLimits: {
      api: { max: 3, windowMs: MINUTE },
      handshake: { max: 2, windowMs: MINUTE },
      import: { max: 1, windowMs: MINUTE },
    },
  });
  await app.listen(0);
  url = await app.getUrl();
  session = await signInWithFakeDiscord(supabase, ria, []);
}, 60_000);

afterAll(async () => {
  await app?.close();
  discord?.stop();
});

describe("rate limits (#142 item 3)", () => {
  test("REST: past the limit an address gets 429 with Retry-After; another address is unaffected", async () => {
    const get = (ip: string) => fetch(`${url}/api/me/guilds`, { headers: from(ip) });
    for (let i = 0; i < 3; i++) expect((await get("203.0.113.1")).status).toBe(401);
    const refused = await get("203.0.113.1");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await get("203.0.113.2")).status).toBe(401);
  });

  test("sockets: past the limit a handshake is refused before the token is checked", async () => {
    const open = (ip: string) =>
      new Promise<string>((resolve) => {
        const socket = io(url, {
          transports: ["websocket"],
          auth: { token: "not-a-token" },
          extraHeaders: from(ip),
          reconnection: false,
        });
        socket.on("connect_error", (e) => {
          resolve(e.message);
          socket.close();
        });
      });
    expect(await open("203.0.113.3")).toBe("unauthorized");
    expect(await open("203.0.113.3")).toBe("unauthorized");
    expect(await open("203.0.113.3")).toBe("rate-limited");
    expect(await open("203.0.113.4")).toBe("unauthorized");
  });

  test("playlist import is limited per user, whatever address it comes from", async () => {
    const preview = (ip: string) =>
      fetch(`${url}/api/library/import`, {
        method: "POST",
        headers: from(ip, { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }),
        body: JSON.stringify({ url: "https://example.com/not-a-playlist" }),
      });
    expect((await preview("203.0.113.5")).status).toBe(400);
    const refused = await preview("203.0.113.6");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("RateLimiter", () => {
  test("counts per key in a fixed window, then starts over", () => {
    let now = 0;
    const limiter = new RateLimiter({ max: 2, windowMs: 1000 }, () => now);
    expect(limiter.hit("a")).toEqual({ ok: true, retryAfterMs: 0 });
    expect(limiter.hit("a").ok).toBe(true);
    expect(limiter.hit("a")).toEqual({ ok: false, retryAfterMs: 1000 });
    expect(limiter.hit("b").ok).toBe(true);
    now = 400;
    expect(limiter.hit("a")).toEqual({ ok: false, retryAfterMs: 600 });
    now = 1000;
    expect(limiter.hit("a").ok).toBe(true);
  });

  test("forgets windows that ended, so the map does not grow without bound", () => {
    let now = 0;
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 }, () => now);
    for (let i = 0; i < 100; i++) limiter.hit(`k${i}`);
    now = 2000;
    limiter.hit("fresh");
    expect(limiter.size).toBe(1);
  });
});
