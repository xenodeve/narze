import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import {
  Channels,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type PlayerState,
  RedisKeys,
  SocketEvents,
} from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../src/app";

const REDIS_URL = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(REDIS_URL);
const G_MINE = "921000000000000001";
const G_OTHER = "921000000000000002";
const erin = { id: "310000000000000001", username: "erin", globalName: "Erin" };

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
let session: FakeSession;

const state = (title: string, revision: number): PlayerState => ({
  guildId: G_MINE,
  current: {
    uri: `https://music.youtube.com/watch?v=${title}`,
    source: "youtubemusic",
    title,
    author: "A",
    durationMs: 200_000,
    artworkUrl: null,
    requester: { id: erin.id, name: "Erin", avatarUrl: null },
  },
  positionMs: 0,
  syncedAt: Date.now(),
  paused: false,
  volume: 15,
  loop: "off",
  twentyFourSeven: false,
  queue: [],
  revision,
  voiceChannelId: "80",
});

const announce = async (s: PlayerState) => {
  await redis.set(RedisKeys.playerState(s.guildId), JSON.stringify(s));
  const event: GuildEvent = {
    type: GuildEventTypes.playerState,
    guildId: s.guildId,
    revision: s.revision,
    sequence: s.revision,
    ts: Date.now(),
    data: s,
  };
  await redis.publish(Channels.guildEvents, JSON.stringify(event));
};

const getPlayer = (guildId: string) =>
  fetch(`${url}/api/guilds/${guildId}/player`, { headers: { authorization: `Bearer ${session.access_token}` } });

beforeAll(async () => {
  const supabase = localSupabase();
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  app = await createApp({
    redisUrl: REDIS_URL,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
  });
  await app.listen(0);
  url = await app.getUrl();
  await redis.sadd(RedisKeys.botGuilds, G_MINE, G_OTHER);
  await redis.del(RedisKeys.playerState(G_MINE), RedisKeys.playerState(G_OTHER));
  session = await signInWithFakeDiscord(supabase, erin, [{ id: G_MINE, name: "Mine", icon: null, owner: false }]);
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
  await redis.srem(RedisKeys.botGuilds, G_MINE, G_OTHER);
  await redis.del(RedisKeys.playerState(G_MINE), RedisKeys.playerState(G_OTHER));
  await redis.quit();
});

describe("Player State through the Hot Cache (#100, ADR-0006)", () => {
  test("a Guild with no Player answers an empty state", async () => {
    const res = await getPlayer(G_MINE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: null });
  });

  test("a member reads the state the Bot published", async () => {
    await announce(state("first", 1));
    await Bun.sleep(50);
    expect(((await (await getPlayer(G_MINE)).json()) as { state: PlayerState }).state.current?.title).toBe("first");
  });

  test("the page reads the cache, not Redis: the last announced state survives its key disappearing", async () => {
    await announce(state("cached", 2));
    await Bun.sleep(50);
    await redis.del(RedisKeys.playerState(G_MINE));
    expect(((await (await getPlayer(G_MINE)).json()) as { state: PlayerState }).state.current?.title).toBe("cached");
  });

  test("a Guild the user is not in is refused (View Permission)", async () => {
    expect((await getPlayer(G_OTHER)).status).toBe(403);
  });

  test("a signed-in socket in the Guild room receives each Player State event", async () => {
    const socket: Socket = io(url, { transports: ["websocket"], auth: { token: session.access_token } });
    await new Promise((resolve) => socket.once(SocketEvents.sessionReady, resolve));
    const received = new Promise<GuildEvent>((resolve) => socket.on(SocketEvents.playerEvent, resolve));
    await announce(state("live", 3));
    const event = await received;
    expect(event).toMatchObject({ type: GuildEventTypes.playerState, guildId: G_MINE, revision: 3 });
    socket.close();
  });

  test("a destroyed Player clears the cache and is announced to the room", async () => {
    const gone: GuildEvent = {
      type: GuildEventTypes.playerGone,
      guildId: G_MINE,
      revision: 0,
      sequence: 9,
      ts: Date.now(),
      data: null,
    };
    await redis.del(RedisKeys.playerState(G_MINE));
    await redis.publish(Channels.guildEvents, JSON.stringify(gone));
    await Bun.sleep(50);
    expect(await (await getPlayer(G_MINE)).json()).toEqual({ state: null });
  });
});
