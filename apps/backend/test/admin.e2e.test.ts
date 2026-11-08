import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { setFakeDiscordUser, startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import {
  AdminStatsSchema,
  Channels,
  DEFAULT_REDIS_URL,
  LOG_HISTORY,
  type LogLine,
  RedisKeys,
  SocketEvents,
} from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../src/app";

const dev = { id: "370000000000000001", username: "dev110", globalName: "Dev" };
const boss = { id: "370000000000000002", username: "boss110", globalName: "Boss" };
const fan = { id: "370000000000000003", username: "fan110", globalName: "Fan" };
const supabase = localSupabase();
const admin = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(redisUrl);

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
const sessions: Record<string, FakeSession> = {};

const call = (who: FakeSession | null, method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: {
      ...(who ? { authorization: `Bearer ${who.access_token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function signIn(user: typeof dev): Promise<FakeSession> {
  await setFakeDiscordUser(user, []);
  const session = await signInWithFakeDiscord(supabase, user, []);
  const sync = await fetch(`${url}/api/me/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ providerToken: session.provider_token }),
  });
  if (sync.status !== 204) throw new Error(`sync ${sync.status}`);
  return session;
}

/** Every route the app registered under /api/admin, read from the router itself (AC1: no hand list). */
function adminRoutes(): Array<{ method: string; path: string }> {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    _router?: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
  };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  return stack.flatMap((layer) =>
    layer.route?.path.startsWith("/api/admin")
      ? Object.keys(layer.route.methods).map((method) => ({
          method: method.toUpperCase(),
          path: layer.route?.path.replace(/:[^/]+/g, "370000000000000009") ?? "",
        }))
      : [],
  );
}

beforeAll(async () => {
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  app = await createApp({
    redisUrl,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
    developerIds: [dev.id],
  });
  await app.listen(0);
  url = await app.getUrl();
  await admin.from("admin_whitelist").delete().in("discord_id", [dev.id, boss.id, fan.id]);
  for (const user of [dev, boss, fan]) sessions[user.username] = await signIn(user);
}, 60_000);

afterAll(async () => {
  await admin.from("admin_whitelist").delete().in("discord_id", [dev.id, boss.id, fan.id]);
  await redis.del(RedisKeys.botLogRing, RedisKeys.botStatsRing);
  await redis.quit();
  await app?.close();
  discord?.stop();
});

describe("admin routes refuse everyone else (#110, AC1)", () => {
  test("every /api/admin route answers 403 to a listener and 401 when signed out", async () => {
    const routes = adminRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const { method, path } of routes) {
      const body = method === "GET" || method === "DELETE" ? undefined : { discordId: fan.id, role: "admin" };
      expect({ method, path, status: (await call(sessions.fan110 ?? null, method, path, body)).status }).toEqual({
        method,
        path,
        status: 403,
      });
      expect((await call(null, method, path, body)).status).toBe(401);
    }
  });
});

describe("the whitelist (#110, AC2)", () => {
  test("a Developer adds an Admin; an Admin can read stats but cannot change the whitelist", async () => {
    const devS = sessions.dev110 as FakeSession;
    const bossS = sessions.boss110 as FakeSession;
    expect(await (await call(devS, "GET", "/api/admin/me")).json()).toEqual({ role: "developer" });
    expect((await call(devS, "PUT", "/api/admin/whitelist", { discordId: boss.id, role: "admin" })).status).toBe(204);
    expect(await (await call(bossS, "GET", "/api/admin/me")).json()).toEqual({ role: "admin" });
    expect((await call(bossS, "GET", "/api/admin/stats")).status).toBe(200);
    expect((await call(bossS, "PUT", "/api/admin/whitelist", { discordId: fan.id, role: "admin" })).status).toBe(403);
    expect((await call(bossS, "GET", "/api/admin/whitelist")).status).toBe(403);
    const list = (await (await call(devS, "GET", "/api/admin/whitelist")).json()) as Array<{
      discordId: string;
      fixed: boolean;
    }>;
    expect(list.find((e) => e.discordId === dev.id)?.fixed).toBe(true);
    expect(list.find((e) => e.discordId === boss.id)?.fixed).toBe(false);
    // The Developer from the environment cannot be removed or demoted from the Dashboard.
    expect((await call(devS, "DELETE", `/api/admin/whitelist/${dev.id}`)).status).toBe(409);
    expect((await call(devS, "PUT", "/api/admin/whitelist", { discordId: dev.id, role: "admin" })).status).toBe(409);
  });
});

describe("stats and logs (#110, AC3, AC4)", () => {
  const sample = (at: number) => ({
    at,
    windowMs: 5000,
    online: true,
    pingMs: 40,
    uptimeMs: at,
    guilds: 1,
    activePlayers: 0,
    cpuPercent: 3,
    memory: { usedBytes: 1, totalBytes: 2 },
    caches: [],
  });
  test("stats come with their window; the samples are oldest first", async () => {
    await redis.del(RedisKeys.botStatsRing);
    await redis.lpush(RedisKeys.botStatsRing, JSON.stringify(sample(1)), JSON.stringify(sample(2)));
    const body = (await (await call(sessions.dev110 as FakeSession, "GET", "/api/admin/stats")).json()) as {
      samples: unknown[];
    };
    expect(body.samples.map((s) => AdminStatsSchema.parse(s).at)).toEqual([1, 2]);
  });

  test("an admin tab gets the last 100 lines, then live ones; a listener gets nothing", async () => {
    await redis.del(RedisKeys.botLogRing);
    const lines = Array.from({ length: 150 }, (_, i): LogLine => ({ at: i, level: "info", text: `line ${i}` }));
    for (const line of lines) await redis.lpush(RedisKeys.botLogRing, JSON.stringify(line));
    const connect = async (session: FakeSession): Promise<Socket> => {
      const socket = io(url, { transports: ["websocket"], auth: { token: session.access_token } });
      await new Promise((resolve) => socket.once(SocketEvents.sessionReady, resolve));
      return socket;
    };
    const devSocket = await connect(sessions.dev110 as FakeSession);
    const fanSocket = await connect(sessions.fan110 as FakeSession);
    const ack = (socket: Socket) =>
      new Promise<{ ok: boolean; history?: LogLine[] }>((resolve) => socket.emit(SocketEvents.adminSubscribe, resolve));
    const mine = await ack(devSocket);
    expect(mine.ok).toBe(true);
    expect(mine.history).toHaveLength(LOG_HISTORY);
    expect(mine.history?.[0]?.text).toBe("line 50");
    expect(mine.history?.at(-1)?.text).toBe("line 149");
    expect((await ack(fanSocket)).ok).toBe(false);

    const fanGot: unknown[] = [];
    fanSocket.on(SocketEvents.adminLog, (l) => fanGot.push(l));
    const live = new Promise<LogLine>((resolve) => devSocket.once(SocketEvents.adminLog, resolve));
    await redis.publish(Channels.botLogs, JSON.stringify({ at: 999, level: "warn", text: "live one" }));
    expect((await live).text).toBe("live one");
    await Bun.sleep(100);
    expect(fanGot).toEqual([]);
    devSocket.close();
    fanSocket.close();
  });

  test("a stats-only tab ({ logs: false }) gets stats samples but no console lines", async () => {
    const socket = io(url, {
      transports: ["websocket"],
      auth: { token: (sessions.dev110 as FakeSession).access_token },
    });
    await new Promise((resolve) => socket.once(SocketEvents.sessionReady, resolve));
    const ack = await new Promise<{ ok: boolean; history?: LogLine[] }>((resolve) =>
      socket.emit(SocketEvents.adminSubscribe, { logs: false }, resolve),
    );
    expect(ack).toEqual({ ok: true, history: [] });
    const logs: unknown[] = [];
    socket.on(SocketEvents.adminLog, (l) => logs.push(l));
    const stats = new Promise<unknown>((resolve) => socket.once(SocketEvents.adminStats, resolve));
    await redis.publish(Channels.botLogs, JSON.stringify({ at: 1, level: "info", text: "not for this tab" }));
    await redis.publish(Channels.botStats, JSON.stringify(sample(3)));
    expect(AdminStatsSchema.parse(await stats).at).toBe(3);
    await Bun.sleep(100);
    expect(logs).toEqual([]);
    socket.close();
  });
});
