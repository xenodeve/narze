import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import { type FakeLavalink, startFakeLavalink } from "@narze/fake-lavalink";
import { DEFAULT_REDIS_URL, PlayPermissionListSchema, RedisKeys, SearchResponseSchema } from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import { createApp } from "../src/app";

const REDIS_URL = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(REDIS_URL);
const G_PLAY = "923000000000000001";
const gwen = { id: "330000000000000001", username: "gwen", globalName: "Gwen" };

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let lavalink: FakeLavalink;
let app: INestApplication;
let url: string;
let session: FakeSession;

const get = (path: string, token: string | null = session.access_token) =>
  fetch(`${url}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeAll(async () => {
  const supabase = localSupabase();
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  lavalink = await startFakeLavalink({
    password: "pw",
    catalog: [
      { title: "Lemon", author: "Kenshi Yonezu", uri: "https://music.youtube.com/watch?v=lemon", lengthMs: 255_000 },
    ],
  });
  app = await createApp({
    redisUrl: REDIS_URL,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
    lavalink: { url: `http://127.0.0.1:${lavalink.port}`, password: "pw" },
  });
  await app.listen(0);
  url = await app.getUrl();
  await redis.sadd(RedisKeys.botGuilds, G_PLAY);
  await redis.del(RedisKeys.playerSummary(G_PLAY), RedisKeys.voiceStates(G_PLAY));
  session = await signInWithFakeDiscord(supabase, gwen, [{ id: G_PLAY, name: "Play Club", icon: null, owner: false }]);
  const sync = await fetch(`${url}/api/me/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ providerToken: session.provider_token }),
  });
  if (sync.status !== 204) throw new Error(`sync ${sync.status}`);
}, 60_000);

afterAll(async () => {
  await app?.close();
  discord?.stop();
  lavalink?.stop();
  await redis.srem(RedisKeys.botGuilds, G_PLAY);
  await redis.del(RedisKeys.voiceStates(G_PLAY));
  await redis.quit();
});

describe("catalog over HTTP (#105)", () => {
  test("search needs a signed-in user", async () => {
    expect((await get("/api/search?q=lemon&source=youtube", null)).status).toBe(401);
  });

  test("a YouTube search asks Lavalink's REST API and answers the shared schema", async () => {
    const res = await get("/api/search?q=lemon&source=youtube");
    expect(res.status).toBe(200);
    const body = SearchResponseSchema.parse(await res.json());
    expect(body.tracks[0]).toMatchObject({ title: "Lemon", artist: "Kenshi Yonezu" });
    expect(lavalink.searches()).toContain("ytsearch:lemon");
  });

  test("a missing query or an unknown source is a bad request; an unknown artist is not found", async () => {
    expect((await get("/api/search?source=youtube")).status).toBe(400);
    expect((await get("/api/search?q=x&source=deezer")).status).toBe(400);
    expect((await get("/api/catalog/artist/nobody")).status).toBe(404);
  });
});

describe("where may I play? (#105, spec #91)", () => {
  test("each Mutual Guild says whether the user can play there, and why", async () => {
    const before = PlayPermissionListSchema.parse(await (await get("/api/me/play-permissions")).json());
    expect(before).toEqual([
      { guildId: G_PLAY, name: "Play Club", iconUrl: null, canPlay: false, reason: "join-voice" },
    ]);
    await redis.hset(RedisKeys.voiceStates(G_PLAY), gwen.id, "88");
    const after = PlayPermissionListSchema.parse(await (await get("/api/me/play-permissions")).json());
    expect(after[0]).toMatchObject({ canPlay: true, reason: "in-voice" });
  });
});

describe("which sources can play (#157)", () => {
  test("without Spotify credentials Spotify is coming soon; SoundCloud waits on #156", async () => {
    const res = await fetch(`${url}/api/sources`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ spotify: false, soundcloud: false });
  });

  test("with Spotify credentials Spotify is on, with no code change", async () => {
    const withSpotify = await createApp({
      redisUrl: REDIS_URL,
      dashboardOrigin: "http://localhost:3000",
      supabase: localSupabase(),
      discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
      spotify: { clientId: "id", clientSecret: "secret" },
    });
    try {
      await withSpotify.listen(0);
      const res = await fetch(`${await withSpotify.getUrl()}/api/sources`);
      expect(await res.json()).toEqual({ spotify: true, soundcloud: false });
    } finally {
      await withSpotify.close();
    }
  });
});
