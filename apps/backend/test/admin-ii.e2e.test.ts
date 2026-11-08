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
  type AdminGuild,
  type AdminQuery,
  AdminQuerySchema,
  Channels,
  DEFAULT_REDIS_URL,
  type ListeningSession,
  type MessagePage,
  parseJson,
  RedisKeys,
  SocketEvents,
  trackKey,
} from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { io } from "socket.io-client";
import { createApp } from "../src/app";

const dev = { id: "380000000000000001", username: "devb111", globalName: "Devb" };
const fan = { id: "380000000000000002", username: "fanb111", globalName: "Fanb" };
/** Listens through the Bot but never opened the Dashboard. */
const lis = { id: "380000000000000003", name: "Lis", avatarUrl: null };
const G = "381000000000000001";
const supabase = localSupabase();
const db = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(redisUrl);
const botSide = new Redis(redisUrl);
const botListener = new Redis(redisUrl);

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
const sessions: Record<string, FakeSession> = {};

/** The fake Bot: records every query and answers from fixtures, after `delayMs`. */
const heard: AdminQuery[] = [];
let delayMs = 0;
let silent = false;
const guild: AdminGuild = {
  id: G,
  name: "Admin Club",
  iconUrl: null,
  memberCount: 42,
  joinedAt: 1_700_000_000_000,
  ownerId: dev.id,
};
const page: MessagePage = {
  channel: { id: "382000000000000001", name: "general" },
  messages: [
    {
      id: "383000000000000001",
      content: "hello",
      author: { id: lis.id, name: "Lis", avatarUrl: null, bot: false },
      at: 1_700_000_000_000,
      editedAt: null,
      mentions: [],
      mentionedRoles: [],
      attachments: [],
      embeds: [],
      reactions: [],
      replyTo: null,
      thread: null,
    },
  ],
};
function answer(query: AdminQuery): unknown {
  switch (query.kind) {
    case "guilds":
      return [guild];
    case "guild":
      return query.guildId === G ? guild : undefined;
    case "channels":
      return [{ id: page.channel.id, name: "general", kind: "text", parentId: null, parentName: null, position: 0 }];
    case "messages":
      return page;
    default:
      return null;
  }
}

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

const listenSession = (id: string, startTime: number): ListeningSession => ({
  id,
  guildId: G,
  guildName: "Admin Club",
  channelId: "384000000000000001",
  startTime,
  endTime: startTime + 60_000,
  isActive: false,
  tracks: [
    {
      title: "Idol",
      author: "YOASOBI",
      uri: "https://x.test/idol",
      thumbnail: null,
      durationMs: 1000,
      playedAt: startTime,
      requester: lis,
    },
  ],
  participants: [{ ...lis, joinedAt: startTime }],
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

async function cleanup() {
  await db.from("listening_sessions").delete().eq("guild_id", G);
  await db.from("play_history").delete().in("discord_id", [lis.id, dev.id]);
  await db.from("play_history").delete().eq("guild_id", G);
}

beforeAll(async () => {
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  botListener.on("message", async (_channel, raw) => {
    const query = parseJson(AdminQuerySchema, raw);
    if (!query) return;
    heard.push(query);
    if (silent) return;
    if (delayMs) await Bun.sleep(delayMs);
    const data = answer(query);
    const result =
      data === undefined ? { id: query.id, ok: false, error: "not-found" } : { id: query.id, ok: true, data };
    await botSide.publish(Channels.botAdminResults, JSON.stringify(result));
  });
  await botListener.subscribe(Channels.botAdminQueries);
  app = await createApp({
    redisUrl,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
    developerIds: [dev.id],
    adminQueryTimeoutMs: 500,
  });
  await app.listen(0);
  url = await app.getUrl();
  for (const user of [dev, fan]) sessions[user.username] = await signIn(user);
  await cleanup();
  await db
    .from("listening_sessions")
    .insert([row(listenSession(`${G}-a`, 1_700_000_000_000)), row(listenSession(`${G}-b`, 1_700_000_500_000))]);
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
  for (const title of ["Idol", "Idol", "Yoru"]) {
    await db.rpc("record_play", { p_guild: G, p_user: lis.id, p_track: play(title) });
  }
}, 60_000);

afterAll(async () => {
  await cleanup();
  await redis.del(RedisKeys.playerSummary(G));
  await redis.quit();
  await botSide.quit();
  await botListener.quit();
  await app?.close();
  discord?.stop();
});

describe("guilds from the Bot (#111, spec #110)", () => {
  test("the list carries the Bot's numbers and whether a Player is playing", async () => {
    await redis.set(
      RedisKeys.playerSummary(G),
      JSON.stringify({ playing: true, queueLength: 0, voiceChannelId: null }),
    );
    const res = await call(sessions.devb111 ?? null, "GET", "/api/admin/guilds");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ ...guild, playing: true }]);
    expect((await call(sessions.devb111 ?? null, "GET", `/api/admin/guilds/${G}`)).status).toBe(200);
    expect((await call(sessions.devb111 ?? null, "GET", "/api/admin/guilds/381000000000000999")).status).toBe(404);
  });

  test("messages are cached: two reads and two at once reach the Bot once", async () => {
    const path = `/api/admin/guilds/${G}/channels/${page.channel.id}/messages`;
    const before = heard.filter((q) => q.kind === "messages").length;
    delayMs = 100;
    const [a, b] = await Promise.all([
      call(sessions.devb111 ?? null, "GET", path),
      call(sessions.devb111 ?? null, "GET", path),
    ]);
    delayMs = 0;
    expect(await a.json()).toEqual(page);
    expect(b.status).toBe(200);
    expect((await call(sessions.devb111 ?? null, "GET", path)).status).toBe(200);
    expect(heard.filter((q) => q.kind === "messages").length - before).toBe(1);
  });

  test("a Bot that does not answer is a 504, not a hang", async () => {
    silent = true;
    const res = await call(sessions.devb111 ?? null, "GET", `/api/admin/guilds/${G}/channels`);
    silent = false;
    expect(res.status).toBe(504);
  });
});

describe("restart and shutdown (#111)", () => {
  test("need an Admin and a confirmation naming the action; the Bot hears who asked", async () => {
    const dev111 = sessions.devb111 ?? null;
    expect((await call(dev111, "POST", "/api/admin/bot/restart", {})).status).toBe(400);
    expect((await call(dev111, "POST", "/api/admin/bot/restart", { confirm: "shutdown" })).status).toBe(400);
    expect(
      (await call(sessions.fanb111 ?? null, "POST", "/api/admin/bot/restart", { confirm: "restart" })).status,
    ).toBe(403);
    expect((await call(dev111, "POST", "/api/admin/bot/restart", { confirm: "restart" })).status).toBe(204);
    expect(heard.at(-1)).toMatchObject({ kind: "restart", by: dev.id });
    expect((await call(dev111, "POST", "/api/admin/bot/shutdown", { confirm: "shutdown" })).status).toBe(204);
    expect(heard.at(-1)).toMatchObject({ kind: "shutdown", by: dev.id });
  });
});

describe("users, sessions and history for Admins (#111, spec #112, #114)", () => {
  test("users come from Play History and the Dashboard, with live presence and Active Today", async () => {
    await redis.hset(RedisKeys.presence, dev.id, 1);
    const res = await call(sessions.devb111 ?? null, "GET", "/api/admin/users");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<Record<string, unknown>>; activeToday: number };
    expect(body.users.find((u) => u.discordId === lis.id)).toMatchObject({
      name: "Lis",
      plays: 3,
      uniqueTracks: 2,
      online: false,
    });
    expect(body.users.find((u) => u.discordId === dev.id)).toMatchObject({ online: true });
    expect(body.activeToday).toBeGreaterThanOrEqual(1);
    await redis.hdel(RedisKeys.presence, dev.id);
  });

  test("a user's history (by last played) and sessions; any session opens for an Admin", async () => {
    const res = await call(sessions.devb111 ?? null, "GET", `/api/admin/users/${lis.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { name: string; plays: number } | null;
      history: Array<{ title: string; playCount: number }>;
      sessions: Array<{ id: string }>;
    };
    // The profile comes with the detail: no second read of the whole user list.
    expect(body.user).toMatchObject({ name: "Lis", plays: 3 });
    expect(body.history.map((h) => h.title).sort()).toEqual(["Idol", "Yoru"]);
    expect(body.sessions.map((s) => s.id)).toEqual([`${G}-b`, `${G}-a`]);
    // The Developer was in neither session; an Admin still opens it (participants-only is for users).
    const one = await call(sessions.devb111 ?? null, "GET", `/api/admin/sessions/${G}-a`);
    expect(one.status).toBe(200);
    expect(((await one.json()) as ListeningSession).tracks).toHaveLength(1);
    expect((await call(sessions.devb111 ?? null, "GET", "/api/admin/sessions/nope")).status).toBe(404);
  });

  test("a guild's sessions and history", async () => {
    const s = await call(sessions.devb111 ?? null, "GET", `/api/admin/guilds/${G}/sessions`);
    expect(((await s.json()) as Array<{ id: string }>).map((x) => x.id)).toEqual([`${G}-b`, `${G}-a`]);
    const h = await call(sessions.devb111 ?? null, "GET", `/api/admin/guilds/${G}/history`);
    expect(((await h.json()) as Array<{ title: string }>).map((x) => x.title).sort()).toEqual(["Idol", "Yoru"]);
  });
});

describe("live presence for the users page (#111, spec #114)", () => {
  test("an admin tab hears who has a Dashboard tab open, as tabs open and close", async () => {
    const devS = sessions.devb111 as FakeSession;
    const admin = io(url, { transports: ["websocket"], auth: { token: devS.access_token } });
    await new Promise((resolve) => admin.once(SocketEvents.sessionReady, resolve));
    const ack = await new Promise<{ ok: boolean }>((resolve) =>
      admin.emit(SocketEvents.adminSubscribe, { logs: false, token: devS.access_token }, resolve),
    );
    expect(ack.ok).toBe(true);
    const seen = (want: (ids: string[]) => boolean) =>
      new Promise<string[]>((resolve) => {
        const on = (body: { online: string[] }) => {
          if (!want(body.online)) return;
          admin.off(SocketEvents.adminPresence, on);
          resolve(body.online);
        };
        admin.on(SocketEvents.adminPresence, on);
      });
    const opened = seen((ids) => ids.includes(fan.id));
    const fanTab = io(url, {
      transports: ["websocket"],
      auth: { token: (sessions.fanb111 as FakeSession).access_token },
    });
    expect(await opened).toContain(dev.id);
    const closed = seen((ids) => !ids.includes(fan.id));
    fanTab.close();
    expect(await closed).toContain(dev.id);
    admin.close();
  });
});
