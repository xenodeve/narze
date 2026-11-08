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
  Channels,
  DEFAULT_REDIS_URL,
  GuildEventTypes,
  type ListeningSession,
  RedisKeys,
  SessionSummarySchema,
  SocketEvents,
  TopPlayedSchema,
  trackKey,
} from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { io, type Socket } from "socket.io-client";
import { z } from "zod";
import { createApp } from "../src/app";

const G = "360000000000000001";
const OTHER_G = "360000000000000002";
const uma = { id: "360000000000000101", username: "uma108", globalName: "Uma" };
const val = { id: "360000000000000102", username: "val108", globalName: "Val" };
const supabase = localSupabase();
const admin = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(redisUrl);

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
let umaSession: FakeSession;
let valSession: FakeSession;

const call = (session: FakeSession, path: string) =>
  fetch(`${url}${path}`, { headers: { authorization: `Bearer ${session.access_token}` } });

const umaAsRequester = { id: uma.id, name: "Uma", avatarUrl: null };
const session = (id: string, over: Partial<ListeningSession> = {}): ListeningSession => ({
  id,
  guildId: G,
  guildName: "History Club",
  channelId: "360000000000000093",
  startTime: 1_700_000_000_000,
  endTime: null,
  isActive: true,
  tracks: [
    {
      title: "Idol",
      author: "YOASOBI",
      uri: "https://x.test/idol",
      thumbnail: null,
      durationMs: 1000,
      playedAt: 1_700_000_000_000,
      requester: umaAsRequester,
    },
  ],
  participants: [{ ...umaAsRequester, joinedAt: 1_700_000_000_000 }],
  ...over,
});
const row = (s: ListeningSession) => ({
  id: s.id,
  guild_id: s.guildId,
  guild_name: s.guildName,
  channel_id: s.channelId,
  start_time: s.startTime,
  end_time: s.endTime,
  is_active: s.isActive,
  tracks: s.tracks,
  participants: s.participants,
  participant_ids: s.participants.map((p) => p.id),
  track_count: s.tracks.length,
});

async function signIn(user: typeof uma, guilds: Array<{ id: string; name: string }>): Promise<FakeSession> {
  const list = guilds.map((g) => ({ ...g, icon: null, owner: false }));
  await setFakeDiscordUser(user, list);
  const session = await signInWithFakeDiscord(supabase, user, list);
  const sync = await fetch(`${url}/api/me/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ providerToken: session.provider_token }),
  });
  if (sync.status !== 204) throw new Error(`sync ${sync.status}`);
  return session;
}

async function connect(session: FakeSession): Promise<Socket> {
  const socket = io(url, { transports: ["websocket"], auth: { token: session.access_token } });
  await new Promise((resolve) => socket.once(SocketEvents.sessionReady, resolve));
  return socket;
}

beforeAll(async () => {
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  await redis.sadd(RedisKeys.botGuilds, G, OTHER_G);
  app = await createApp({
    redisUrl,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
  });
  await app.listen(0);
  url = await app.getUrl();
  umaSession = await signIn(uma, [{ id: G, name: "History Club" }]);
  // Val is in the same Guild but was not in Uma's session.
  valSession = await signIn(val, [{ id: G, name: "History Club" }]);
  await admin.from("listening_sessions").delete().in("guild_id", [G, OTHER_G]);
  await admin
    .from("listening_sessions")
    .insert([
      row(session(`${G}-1`, { startTime: 1_700_000_000_000, isActive: false, endTime: 1_700_000_100_000 })),
      row(session(`${G}-2`, { startTime: 1_700_000_200_000 })),
      row(
        session(`${OTHER_G}-1`, { guildId: OTHER_G, participants: [{ ...umaAsRequester, id: val.id, joinedAt: 1 }] }),
      ),
    ]);
  await admin.from("play_history").delete().in("discord_id", [uma.id]);
  await admin.from("play_history").delete().eq("guild_id", G);
  const play = (title: string) => ({
    trackId: trackKey(title, "YOASOBI"),
    title,
    artist: "YOASOBI",
    uri: `https://x.test/${title}`,
    thumbnail: null,
    durationMs: 1000,
    source: "youtube",
    isMusic: true,
    isVideo: false,
  });
  for (const title of ["Idol", "Idol", "Idol", "Yoru"]) {
    await admin.rpc("record_play", { p_guild: G, p_user: uma.id, p_track: play(title) });
  }
}, 60_000);

afterAll(async () => {
  await admin.from("listening_sessions").delete().in("guild_id", [G, OTHER_G]);
  await admin.from("play_history").delete().in("discord_id", [uma.id]);
  await admin.from("play_history").delete().eq("guild_id", G);
  await redis.srem(RedisKeys.botGuilds, G, OTHER_G);
  await redis.quit();
  await app?.close();
  discord?.stop();
});

describe("sessions belong to their participants (#108, spec #42)", () => {
  test("the list holds only sessions I took part in, newest first, without their tracks", async () => {
    const res = await call(umaSession, "/api/sessions");
    expect(res.status).toBe(200);
    const list = z.array(SessionSummarySchema).parse(await res.json());
    expect(list.map((s) => s.id)).toEqual([`${G}-2`, `${G}-1`]);
    expect(list[0]).toMatchObject({ isActive: true, trackCount: 1 });
    expect((await (await call(valSession, "/api/sessions")).json()) as unknown[]).toHaveLength(1);
  });

  test("the detail is for participants; anyone else gets a 404, even a member of the Guild", async () => {
    const mine = await call(umaSession, `/api/sessions/${G}-1`);
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as ListeningSession).tracks[0]?.requester.id).toBe(uma.id);
    expect((await call(valSession, `/api/sessions/${G}-1`)).status).toBe(404);
    expect((await call(umaSession, "/api/sessions/nope")).status).toBe(404);
  });
});

describe("top-played (#108, spec #84)", () => {
  test("mine across every Guild, and the Guild's for its members; most played first", async () => {
    const mine = z.array(TopPlayedSchema).parse(await (await call(umaSession, "/api/history/top?scope=me")).json());
    expect(mine.map((t) => [t.title, t.playCount])).toEqual([
      ["Idol", 3],
      ["Yoru", 1],
    ]);
    const guild = z
      .array(TopPlayedSchema)
      .parse(await (await call(valSession, `/api/history/top?guildId=${G}`)).json());
    expect(guild[0]).toMatchObject({ title: "Idol", playCount: 3 });
    // Not a member of that Guild: refused.
    expect((await call(umaSession, `/api/history/top?guildId=${OTHER_G}`)).status).toBe(403);
  });
});

describe("session events (#108, AC2)", () => {
  test("a non-participant never receives a session event; participants get update and end", async () => {
    const umaSocket = await connect(umaSession);
    const valSocket = await connect(valSession);
    const valGot: string[] = [];
    valSocket.on(SocketEvents.sessionUpdate, () => valGot.push("update"));
    valSocket.on(SocketEvents.sessionEnd, () => valGot.push("end"));
    const updated = new Promise<ListeningSession>((resolve) => umaSocket.once(SocketEvents.sessionUpdate, resolve));
    const ended = new Promise<ListeningSession>((resolve) => umaSocket.once(SocketEvents.sessionEnd, resolve));
    const publish = (type: string, data: ListeningSession) =>
      redis.publish(
        Channels.guildEvents,
        JSON.stringify({ type, guildId: G, revision: 0, sequence: 0, ts: Date.now(), data }),
      );
    await publish(GuildEventTypes.sessionUpdate, session(`${G}-9`));
    expect((await updated).id).toBe(`${G}-9`);
    await publish(GuildEventTypes.sessionEnd, session(`${G}-9`, { isActive: false, endTime: 2 }));
    expect((await ended).isActive).toBe(false);
    await Bun.sleep(200);
    expect(valGot).toEqual([]);
    umaSocket.close();
    valSocket.close();
  });
});
