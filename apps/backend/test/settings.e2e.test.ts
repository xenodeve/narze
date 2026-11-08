import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import { Channels, DEFAULT_REDIS_URL, type GuildEvent, GuildEventTypes, RedisKeys, SocketEvents } from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { io } from "socket.io-client";
import { createApp } from "../src/app";

const REDIS_URL = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(REDIS_URL);
const listener = new Redis(REDIS_URL);
const G_OWN = "924000000000000001";
const G_MEM = "924000000000000002";
const ivy = { id: "340000000000000001", username: "ivy", globalName: "Ivy" };
const supabase = localSupabase();
const db = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
let session: FakeSession;

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  app = await createApp({
    redisUrl: REDIS_URL,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
  });
  await app.listen(0);
  url = await app.getUrl();
  await redis.sadd(RedisKeys.botGuilds, G_OWN, G_MEM);
  await redis.set(RedisKeys.textChannels(G_OWN), JSON.stringify([{ id: "501", name: "music" }]));
  await db.from("guild_settings").delete().in("guild_id", [G_OWN, G_MEM]);
  await db.from("guild_settings").insert([
    { guild_id: G_OWN, guild_name: "Own Club", owner_id: "999", avatar: {} },
    { guild_id: G_MEM, guild_name: "Member Club", owner_id: "998", avatar: {} },
  ]);
  session = await signInWithFakeDiscord(supabase, ivy, [
    { id: G_OWN, name: "Own Club", icon: null, owner: true },
    { id: G_MEM, name: "Member Club", icon: null, owner: false },
  ]);
  const sync = await call("POST", "/api/me/sync", { providerToken: session.provider_token });
  if (sync.status !== 204) throw new Error(`sync ${sync.status}`);
}, 60_000);

afterAll(async () => {
  await app?.close();
  discord?.stop();
  await redis.srem(RedisKeys.botGuilds, G_OWN, G_MEM);
  await redis.del(RedisKeys.textChannels(G_OWN));
  await db.from("guild_settings").delete().in("guild_id", [G_OWN, G_MEM]);
  await listener.quit();
  await redis.quit();
});

describe("Guild Settings over HTTP (#106, spec #92, #121)", () => {
  test("any member reads them; only the Server Owner or the Bot Owner may change them", async () => {
    const read = await call("GET", `/api/guilds/${G_MEM}/settings`);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ settings: { ownerId: "998", musicChannelId: null }, canEdit: false });
    expect((await call("PUT", `/api/guilds/${G_MEM}/settings`, { avatar: { hat: "crown" } })).status).toBe(403);

    // Ivy invited the Bot to Member Club: as its Bot Owner she may change it, and controls anywhere.
    await db.from("guild_settings").update({ owner_id: ivy.id }).eq("guild_id", G_MEM);
    expect((await call("PUT", `/api/guilds/${G_MEM}/settings`, { avatar: { hat: "crown" } })).status).toBe(200);
    const permissions = (await (await call("GET", "/api/me/play-permissions")).json()) as Array<{
      guildId: string;
      reason: string;
    }>;
    expect(permissions.find((p) => p.guildId === G_MEM)?.reason).toBe("bot-owner");
  });

  test("a Music Channel must be one of the Guild's text channels; null clears it", async () => {
    expect((await call("PUT", `/api/guilds/${G_OWN}/settings`, { musicChannelId: "777" })).status).toBe(400);
    expect((await call("PUT", `/api/guilds/${G_OWN}/settings`, { musicChannelId: "501" })).status).toBe(200);
    const read = (await (await call("GET", `/api/guilds/${G_OWN}/settings`)).json()) as {
      settings: { musicChannelId: string | null };
      textChannels: Array<{ id: string; name: string }>;
    };
    expect(read.settings.musicChannelId).toBe("501");
    expect(read.textChannels).toEqual([{ id: "501", name: "music" }]);
    expect((await call("PUT", `/api/guilds/${G_OWN}/settings`, { musicChannelId: null })).status).toBe(200);
  });

  test("a change reaches the Bot over Redis and other tabs over the socket, and keeps the rest of the outfit", async () => {
    await call("PUT", `/api/guilds/${G_OWN}/settings`, { avatar: { type: "cat", glasses: "round" } });
    await listener.subscribe(Channels.guildEvents);
    const relayed = new Promise<GuildEvent>((resolve) =>
      listener.on("message", (_c, raw) => {
        const event = JSON.parse(raw) as GuildEvent;
        if (event.type === GuildEventTypes.settingsUpdate && event.guildId === G_OWN) resolve(event);
      }),
    );
    const socket = io(url, { transports: ["websocket"], auth: { token: session.access_token } });
    await new Promise((resolve) => socket.once(SocketEvents.sessionReady, resolve));
    const pushed = new Promise<{ guildId: string; settings: { avatar: Record<string, unknown> } }>((resolve) =>
      socket.on(SocketEvents.settingsUpdate, resolve),
    );
    expect((await call("PUT", `/api/guilds/${G_OWN}/settings`, { avatar: { hat: "beret" } })).status).toBe(200);
    const [event, update] = await Promise.all([relayed, pushed]);
    expect(event.data).toMatchObject({ guildId: G_OWN });
    expect(update.settings.avatar).toMatchObject({ type: "cat", glasses: "round", hat: "beret" });
    socket.close();

    const guilds = (await (await call("GET", "/api/me/guilds")).json()) as Array<{
      id: string;
      avatar?: { type: string };
    }>;
    expect(guilds.find((g) => g.id === G_OWN)?.avatar?.type).toBe("cat");
  });
});
