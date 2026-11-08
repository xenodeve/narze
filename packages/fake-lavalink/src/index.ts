/**
 * A Lavalink v4 node that speaks just enough of the protocol for lavalink-client to connect, search
 * a fixed catalog and start a track. Used by the Bot's tests so they never need a real node or real
 * audio: starting a track answers with the same WebSocket events a real node sends.
 */
import type { ServerWebSocket } from "bun";

export interface FakeCatalogTrack {
  title: string;
  author: string;
  uri: string;
  lengthMs: number;
  artworkUrl?: string | null;
  isrc?: string | null;
  sourceName?: string;
}

export interface FakeLavalinkOptions {
  password: string;
  /** 0 picks a free port. */
  port?: number;
  /** Tracks a search or URL can resolve to. */
  catalog?: FakeCatalogTrack[];
  /** Source managers the node reports in /v4/info (the Bot picks its search prefix from these). */
  sourceManagers?: string[];
}

interface LavalinkTrack {
  encoded: string;
  info: {
    identifier: string;
    isSeekable: boolean;
    author: string;
    length: number;
    isStream: boolean;
    position: number;
    title: string;
    uri: string;
    sourceName: string;
    artworkUrl: string | null;
    isrc: string | null;
  };
  pluginInfo: Record<string, unknown>;
  userData: Record<string, unknown>;
}

export interface FakePlayer {
  guildId: string;
  track: LavalinkTrack | null;
  volume: number;
  paused: boolean;
  position: number;
  /** Voice data the client forwarded (Discord's session/token/endpoint). */
  voice: Record<string, unknown>;
}

export interface FakeLavalink {
  port: number;
  /** Session ids issued to connected clients, oldest first. */
  sessionIds(): string[];
  /** The node's view of one Guild's player, as the last PATCH left it. */
  player(guildId: string): FakePlayer | undefined;
  /** Every /v4/loadtracks identifier asked for, oldest first. */
  searches(): string[];
  /** Ends the current track as a real node would (reason "finished"). */
  finishTrack(guildId: string): void;
  stop(): void;
}

function toLavalinkTrack(t: FakeCatalogTrack): LavalinkTrack {
  const info = {
    identifier: t.uri,
    isSeekable: true,
    author: t.author,
    length: t.lengthMs,
    isStream: false,
    position: 0,
    title: t.title,
    uri: t.uri,
    sourceName: t.sourceName ?? "youtube",
    artworkUrl: t.artworkUrl ?? null,
    isrc: t.isrc ?? null,
  };
  return { encoded: Buffer.from(JSON.stringify(info)).toString("base64"), info, pluginInfo: {}, userData: {} };
}

interface SocketData {
  sessionId: string;
}

export async function startFakeLavalink(options: FakeLavalinkOptions): Promise<FakeLavalink> {
  const sessions: string[] = [];
  const sockets = new Map<string, ServerWebSocket<SocketData>>();
  const players = new Map<string, FakePlayer>();
  const searches: string[] = [];
  const catalog = (options.catalog ?? []).map(toLavalinkTrack);
  const info = {
    version: { semver: "4.0.0-fake", major: 4, minor: 0, patch: 0, preRelease: "fake", build: null },
    buildTime: 0,
    git: { branch: "fake", commit: "fake", commitTime: 0 },
    jvm: "fake",
    lavaplayer: "fake",
    sourceManagers: options.sourceManagers ?? ["youtube", "http"],
    filters: [],
    plugins: [],
  };
  const authorized = (req: Request) => req.headers.get("authorization") === options.password;
  const send = (payload: unknown) => {
    for (const socket of sockets.values()) socket.send(JSON.stringify(payload));
  };

  function loadTracks(identifier: string) {
    searches.push(identifier);
    if (/^https?:\/\//.test(identifier)) {
      const track = catalog.find((t) => t.info.uri === identifier);
      return track ? { loadType: "track", data: track } : { loadType: "empty", data: {} };
    }
    const query = identifier.replace(/^[a-z]+search:/, "").toLowerCase();
    const found = catalog.filter((t) => `${t.info.title} ${t.info.author}`.toLowerCase().includes(query));
    return found.length > 0 ? { loadType: "search", data: found } : { loadType: "empty", data: {} };
  }

  async function updatePlayer(guildId: string, req: Request): Promise<Response> {
    const body = (await req.json()) as Record<string, unknown>;
    const current: FakePlayer = players.get(guildId) ?? {
      guildId,
      track: null,
      volume: 100,
      paused: false,
      position: 0,
      voice: {},
    };
    if (typeof body.volume === "number") current.volume = body.volume;
    if (typeof body.paused === "boolean") current.paused = body.paused;
    if (typeof body.position === "number") current.position = body.position;
    if (body.voice && typeof body.voice === "object") current.voice = body.voice as Record<string, unknown>;
    // `track.encoded: null` means stop; a missing `track` means "leave the track alone".
    const trackBody = body.track as { encoded?: string | null } | undefined;
    const requested = trackBody && "encoded" in trackBody ? trackBody.encoded : body.encodedTrack;
    const previous = current.track;
    if (typeof requested === "string") {
      const decoded = JSON.parse(Buffer.from(requested, "base64").toString()) as LavalinkTrack["info"];
      current.track = { encoded: requested, info: decoded, pluginInfo: {}, userData: {} };
      current.position = typeof body.position === "number" ? body.position : 0;
      players.set(guildId, current);
      // A real node answers the PATCH first and then reports the start over the socket.
      queueMicrotask(() => {
        // A real node ends the replaced track before starting the new one.
        if (previous) send({ op: "event", type: "TrackEndEvent", guildId, track: previous, reason: "replaced" });
        send({ op: "event", type: "TrackStartEvent", guildId, track: current.track });
        send({
          op: "playerUpdate",
          guildId,
          state: { time: Date.now(), position: current.position, connected: true, ping: 0 },
        });
      });
    } else if (requested === null) {
      current.track = null;
      if (previous) {
        queueMicrotask(() => send({ op: "event", type: "TrackEndEvent", guildId, track: previous, reason: "stopped" }));
      }
    }
    players.set(guildId, current);
    return Response.json({
      ...current,
      state: { time: Date.now(), position: current.position, connected: true, ping: 0 },
      filters: {},
    });
  }

  const server = Bun.serve<SocketData, never>({
    port: options.port ?? 0,
    hostname: "127.0.0.1",
    async fetch(req, srv) {
      const { pathname, searchParams } = new URL(req.url);
      if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
      if (pathname === "/v4/websocket") {
        const sessionId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
        return srv.upgrade(req, { data: { sessionId } }) ? undefined : new Response("Upgrade failed", { status: 400 });
      }
      if (pathname === "/v4/info") return Response.json(info);
      if (pathname === "/version") return new Response(info.version.semver);
      if (pathname === "/v4/loadtracks") return Response.json(loadTracks(searchParams.get("identifier") ?? ""));
      const player = pathname.match(/^\/v4\/sessions\/[^/]+\/players\/(\d+)$/);
      if (player?.[1] && req.method === "PATCH") return updatePlayer(player[1], req);
      if (player?.[1] && req.method === "DELETE") {
        players.delete(player[1]);
        return new Response(null, { status: 204 });
      }
      if (player?.[1] && req.method === "GET") return Response.json(players.get(player[1]) ?? null);
      if (/^\/v4\/sessions\/[^/]+\/players$/.test(pathname)) return Response.json([...players.values()]);
      if (/^\/v4\/sessions\/[^/]+$/.test(pathname) && req.method === "PATCH")
        return Response.json({ resuming: false, timeout: 60 });
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open(ws: ServerWebSocket<SocketData>) {
        sessions.push(ws.data.sessionId);
        sockets.set(ws.data.sessionId, ws);
        ws.send(JSON.stringify({ op: "ready", resumed: false, sessionId: ws.data.sessionId }));
      },
      close(ws: ServerWebSocket<SocketData>) {
        sockets.delete(ws.data.sessionId);
      },
      message() {},
    },
  });

  return {
    port: server.port ?? 0,
    sessionIds: () => [...sessions],
    player: (guildId) => players.get(guildId),
    searches: () => [...searches],
    finishTrack: (guildId) => {
      const current = players.get(guildId);
      if (!current?.track) return;
      const track = current.track;
      current.track = null;
      send({ op: "event", type: "TrackEndEvent", guildId, track, reason: "finished" });
    },
    stop: () => server.stop(true),
  };
}
