import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  type LocalSupabase,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import {
  Channels,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type GuildSummary,
  type PlayerSummary,
  RedisKeys,
  SocketEvents,
} from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../src/app";

const REDIS_URL = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(REDIS_URL);
const G_OWNED = "920000000000000001";
const G_MEMBER = "920000000000000002";
const G_WITHOUT_BOT = "920000000000000003";
const alice = { id: "300000000000000001", username: "alice", globalName: "Alice" };
const bob = { id: "300000000000000002", username: "bob", globalName: "Bob" };
const aliceGuilds = [
  { id: G_OWNED, name: "Alice home", icon: null, owner: true },
  { id: G_MEMBER, name: "Shared", icon: null, owner: false },
  { id: G_WITHOUT_BOT, name: "No bot here", icon: null, owner: false },
];

let supabase: LocalSupabase;
let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
let aliceSession: FakeSession;

const api = (path: string, init: RequestInit & { token?: string } = {}) =>
  fetch(`${url}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  });

const db = () => createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });

beforeAll(async () => {
  supabase = localSupabase();
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  app = await createApp({
    redisUrl: REDIS_URL,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
  });
  await app.listen(0);
  url = await app.getUrl();
  await redis.del(RedisKeys.voiceStates(G_MEMBER), RedisKeys.playerSummary(G_MEMBER), RedisKeys.playerSummary(G_OWNED));
  await redis.sadd(RedisKeys.botGuilds, G_OWNED, G_MEMBER);
  aliceSession = await signInWithFakeDiscord(supabase, alice, aliceGuilds);
}, 60_000);

afterAll(async () => {
  await app?.close();
  discord?.stop();
  await redis.srem(RedisKeys.botGuilds, G_OWNED, G_MEMBER);
  await redis.del(RedisKeys.voiceStates(G_MEMBER), RedisKeys.playerSummary(G_MEMBER), RedisKeys.playerSummary(G_OWNED));
  await redis.quit();
});

function sync(session: FakeSession, body: Record<string, unknown> = {}) {
  return api("/api/me/sync", {
    method: "POST",
    token: session.access_token,
    body: JSON.stringify({ providerToken: session.provider_token, ...body }),
  });
}

describe("signing in and listing servers (#99)", () => {
  test("sync stores the user and answers only Mutual Guilds, with permission badges", async () => {
    expect((await sync(aliceSession)).status).toBe(204);
    const res = await api("/api/me/guilds", { token: aliceSession.access_token });
    const guilds = (await res.json()) as GuildSummary[];
    expect(guilds.map((g) => [g.id, g.badge])).toEqual([
      [G_OWNED, "owner"],
      [G_MEMBER, "view-only"],
    ]);
    const { data } = await db().from("users").select("discord_id, name").eq("discord_id", alice.id).single();
    expect(data).toEqual({ discord_id: alice.id, name: "Alice" });
  });

  test("a request without a valid token is refused", async () => {
    expect((await api("/api/me/guilds")).status).toBe(401);
    expect((await api("/api/me/guilds", { token: "not-a-jwt" })).status).toBe(401);
  });

  test("a Discord ID in the body or query is never taken as identity", async () => {
    await sync(aliceSession, { discordId: bob.id });
    const res = await api(`/api/me/guilds?discordId=${bob.id}`, { token: aliceSession.access_token });
    const guilds = (await res.json()) as GuildSummary[];
    expect(guilds.map((g) => g.id)).toEqual([G_OWNED, G_MEMBER]);
    const { data } = await db().from("users").select("discord_id").eq("discord_id", bob.id);
    expect(data).toEqual([]);
  });

  test("a provider token that belongs to someone else is refused", async () => {
    const bobSession = await signInWithFakeDiscord(supabase, bob, []);
    const res = await sync({ ...aliceSession, provider_token: bobSession.provider_token });
    expect(res.status).toBe(403);
  });

  test("a member in the Bot's voice channel is badged In Voice", async () => {
    const summary: PlayerSummary = { playing: true, queueLength: 2, voiceChannelId: "77" };
    await redis.set(RedisKeys.playerSummary(G_MEMBER), JSON.stringify(summary));
    await redis.hset(RedisKeys.voiceStates(G_MEMBER), alice.id, "77");
    const res = await api("/api/me/guilds", { token: aliceSession.access_token });
    const member = ((await res.json()) as GuildSummary[]).find((g) => g.id === G_MEMBER);
    expect(member).toMatchObject({ playing: true, queueLength: 2, badge: "in-voice" });
    await redis.del(RedisKeys.playerSummary(G_MEMBER), RedisKeys.voiceStates(G_MEMBER));
  });
});

function connect(token: string): Promise<Socket> {
  const socket = io(url, { transports: ["websocket"], auth: { token } });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket not ready within 3s")), 3000);
    socket.once(SocketEvents.sessionReady, () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

async function activeOf(discordId: string): Promise<boolean> {
  const { data } = await db().from("users").select("active").eq("discord_id", discordId).single();
  return data?.active ?? false;
}

async function eventually(check: () => Promise<boolean>, ms = 3000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return true;
    await Bun.sleep(50);
  }
  return false;
}

describe("live server list and Presence over the socket (#99)", () => {
  test("a Player change in a Mutual Guild reaches the user's socket as a guild summary", async () => {
    const socket = await connect(aliceSession.access_token);
    const update = new Promise<GuildSummary>((resolve) => socket.on(SocketEvents.guildSummary, resolve));
    const summary: PlayerSummary = { playing: true, queueLength: 3, voiceChannelId: "88" };
    await redis.set(RedisKeys.playerSummary(G_OWNED), JSON.stringify(summary));
    const event: GuildEvent = {
      type: GuildEventTypes.playerSummary,
      guildId: G_OWNED,
      revision: 1,
      sequence: 1,
      ts: Date.now(),
      data: summary,
    };
    await redis.publish(Channels.guildEvents, JSON.stringify(event));
    expect(await update).toMatchObject({ id: G_OWNED, playing: true, queueLength: 3, badge: "owner" });
    socket.close();
  });

  test("a socket without a valid token is turned away", async () => {
    await expect(connect("not-a-jwt")).rejects.toThrow("unauthorized");
  });

  test("Presence counts tabs: the user stays active until the last tab closes", async () => {
    const first = await connect(aliceSession.access_token);
    const second = await connect(aliceSession.access_token);
    expect(await eventually(() => activeOf(alice.id))).toBe(true);
    first.close();
    await Bun.sleep(200);
    expect(await activeOf(alice.id)).toBe(true);
    second.close();
    expect(await eventually(async () => !(await activeOf(alice.id)))).toBe(true);
  });

  test("after Sign Out the Backend refuses the old token", async () => {
    const session = await signInWithFakeDiscord(supabase, alice, aliceGuilds);
    expect((await api("/api/me/guilds", { token: session.access_token })).status).toBe(200);
    const out = await fetch(`${supabase.url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: supabase.publishableKey, authorization: `Bearer ${session.access_token}` },
    });
    expect(out.status).toBe(204);
    expect((await api("/api/me/guilds", { token: session.access_token })).status).toBe(401);
  });
});
