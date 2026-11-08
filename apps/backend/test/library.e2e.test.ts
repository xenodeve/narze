import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { setFakeDiscordUser, startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import { type FakeLavalink, startFakeLavalink } from "@narze/fake-lavalink";
import { DEFAULT_REDIS_URL, ImportPreviewSchema, SocketEvents } from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { io } from "socket.io-client";
import { createApp } from "../src/app";

const uma = { id: "350000000000000001", username: "uma107", globalName: "Uma" };
const val = { id: "350000000000000002", username: "val107", globalName: "Val" };
const supabase = localSupabase();
const SPOTIFY_URL = "https://open.spotify.com/playlist/PLX";
const YOUTUBE_URL = "https://www.youtube.com/playlist?list=PLY";
const song = (title: string, uri: string) => ({ title, author: "YOASOBI", uri, lengthMs: 200_000 });

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let lavalink: FakeLavalink;
let spotify: ReturnType<typeof Bun.serve>;
let app: INestApplication;
let url: string;
let umaSession: FakeSession;
let valSession: FakeSession;

const call = (session: FakeSession, method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const track = (title: string) => ({
  title,
  artist: "YOASOBI",
  duration: 1000,
  thumbnail: null,
  uri: `https://x.test/${title}`,
});

async function signIn(user: typeof uma): Promise<FakeSession> {
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

beforeAll(async () => {
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  lavalink = await startFakeLavalink({
    password: "pw",
    playlists: [
      {
        name: "Anime Hits",
        url: SPOTIFY_URL,
        tracks: [{ ...song("Idol", "https://open.spotify.com/track/t1"), sourceName: "spotify" }],
      },
      { name: "Clips", url: YOUTUBE_URL, tracks: [song("Clip", "https://www.youtube.com/watch?v=c1")] },
    ],
  });
  spotify = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/api/token") return Response.json({ access_token: "t", expires_in: 3600 });
      if (path === "/v1/playlists/PLX")
        return Response.json({
          owner: { display_name: "Dee" },
          tracks: {
            items: [{ added_at: "2026-01-02T03:04:05Z", track: { id: "t1", album: { name: "THE BOOK" } } }],
            next: null,
          },
        });
      return new Response("nope", { status: 404 });
    },
  });
  app = await createApp({
    redisUrl: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
    lavalink: { url: `http://127.0.0.1:${lavalink.port}`, password: "pw" },
    spotify: {
      clientId: "id",
      clientSecret: "secret",
      apiUrl: `http://127.0.0.1:${spotify.port}/v1`,
      accountsUrl: `http://127.0.0.1:${spotify.port}`,
    },
  });
  await app.listen(0);
  url = await app.getUrl();
  umaSession = await signIn(uma);
  valSession = await signIn(val);
}, 60_000);

afterAll(async () => {
  await app?.close();
  discord?.stop();
  lavalink?.stop();
  spotify?.stop(true);
});

describe("playlists belong to their owner (#107, AC1)", () => {
  test("Uma creates, reads, renames and edits her playlist; Val can neither read nor change it", async () => {
    const created = await call(umaSession, "POST", "/api/library/playlists", {
      name: "Mine",
      tracks: [track("a"), track("b")],
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(
      (
        (await (await call(umaSession, "GET", "/api/library/playlists")).json()) as Array<{
          id: string;
          trackCount: number;
        }>
      ).find((p) => p.id === id)?.trackCount,
    ).toBe(2);

    for (const [method, body] of [["GET"], ["PUT", { name: "Hijacked" }], ["DELETE"]] as const) {
      expect((await call(valSession, method, `/api/library/playlists/${id}`, body)).status).toBe(404);
    }

    // A change carries only name, description and tracks: the owner cannot be reassigned.
    const renamed = await call(umaSession, "PUT", `/api/library/playlists/${id}`, {
      name: "Renamed",
      tracks: [track("b")],
      ownerId: val.id,
    });
    expect(renamed.status).toBe(200);
    const read = (await (await call(umaSession, "GET", `/api/library/playlists/${id}`)).json()) as {
      name: string;
      tracks: Array<{ title: string }>;
    };
    expect(read.name).toBe("Renamed");
    expect(read.tracks.map((t) => t.title)).toEqual(["b"]);
    expect((await call(valSession, "GET", `/api/library/playlists/${id}`)).status).toBe(404);
  });

  test("RLS: through Supabase directly, each user sees only their own playlists", async () => {
    const asUser = (session: FakeSession) =>
      createClient(supabase.url, supabase.publishableKey, {
        auth: { persistSession: false },
        global: { headers: { authorization: `Bearer ${session.access_token}` } },
      });
    const mine = await asUser(umaSession).from("playlists").select("name");
    const theirs = await asUser(valSession).from("playlists").select("name");
    expect((mine.data ?? []).map((p) => p.name)).toContain("Renamed");
    expect((theirs.data ?? []).map((p) => p.name)).not.toContain("Renamed");
  });

  test("a change reaches the owner's other tabs (AC3)", async () => {
    const created = (await (await call(umaSession, "POST", "/api/library/playlists", { name: "Live" })).json()) as {
      id: string;
    };
    const socket = io(url, { transports: ["websocket"], auth: { token: umaSession.access_token } });
    await new Promise((resolve) => socket.once(SocketEvents.sessionReady, resolve));
    const update = new Promise<{ playlistId: string }>((resolve) => socket.on(SocketEvents.libraryUpdate, resolve));
    await call(umaSession, "PUT", `/api/library/playlists/${created.id}`, { name: "Live 2" });
    expect((await update).playlistId).toBe(created.id);
    socket.close();
  });

  test("deleting removes it", async () => {
    const created = (await (await call(umaSession, "POST", "/api/library/playlists", { name: "Gone" })).json()) as {
      id: string;
    };
    expect((await call(umaSession, "DELETE", `/api/library/playlists/${created.id}`)).status).toBe(204);
    expect((await call(umaSession, "GET", `/api/library/playlists/${created.id}`)).status).toBe(404);
  });
});

describe("import preview (#107, spec #50, #71)", () => {
  test("a Spotify playlist: spec #71's shape, with album and added-at from the Spotify API", async () => {
    const res = await call(umaSession, "POST", "/api/library/import", { url: SPOTIFY_URL });
    expect(res.status).toBe(200);
    const preview = ImportPreviewSchema.parse(await res.json());
    expect(preview).toMatchObject({
      platform: "spotify",
      playlist: { name: "Anime Hits", trackCount: 1, owner: "Dee" },
    });
    expect(preview.tracks[0]).toMatchObject({ title: "Idol", album: "THE BOOK", addedAt: "2026-01-02T03:04:05Z" });
  });

  test("a YouTube playlist works; any other link is refused before anything is loaded", async () => {
    const youtube = ImportPreviewSchema.parse(
      await (await call(umaSession, "POST", "/api/library/import", { url: YOUTUBE_URL })).json(),
    );
    expect(youtube).toMatchObject({ platform: "youtube", playlist: { name: "Clips" } });
    const before = lavalink.searches().length;
    expect((await call(umaSession, "POST", "/api/library/import", { url: "http://169.254.169.254/x" })).status).toBe(
      400,
    );
    expect(lavalink.searches().length).toBe(before);
  });
});

describe("Likes (#107)", () => {
  test("liking adds to the Liked playlist; unliking removes it; each user has their own", async () => {
    const liked = track("liked-one");
    expect((await call(umaSession, "PUT", "/api/library/likes", liked)).status).toBe(204);
    const likes = (await (await call(umaSession, "GET", "/api/library/likes")).json()) as Array<{ uri: string }>;
    expect(likes.map((l) => l.uri)).toContain(liked.uri);
    expect(((await (await call(valSession, "GET", "/api/library/likes")).json()) as unknown[]).length).toBe(0);
    expect((await call(umaSession, "DELETE", `/api/library/likes?uri=${encodeURIComponent(liked.uri)}`)).status).toBe(
      204,
    );
    expect(
      ((await (await call(umaSession, "GET", "/api/library/likes")).json()) as Array<{ uri: string }>).map(
        (l) => l.uri,
      ),
    ).not.toContain(liked.uri);
  });
});
