/**
 * A Lavalink v4 node that speaks just enough of the protocol for lavalink-client to connect.
 * Used by Bot tests and the whole-system Playwright suite so CI never needs real audio.
 * Later slices extend it with /loadtracks and player updates.
 */
import type { ServerWebSocket } from "bun";

export interface FakeLavalinkOptions {
  password: string;
  /** 0 picks a free port. */
  port?: number;
}

export interface FakeLavalink {
  port: number;
  /** Session ids issued to connected clients, oldest first. */
  sessionIds(): string[];
  stop(): void;
}

const INFO = {
  version: { semver: "4.0.0-fake", major: 4, minor: 0, patch: 0, preRelease: "fake", build: null },
  buildTime: 0,
  git: { branch: "fake", commit: "fake", commitTime: 0 },
  jvm: "fake",
  lavaplayer: "fake",
  sourceManagers: ["youtube", "spotify", "http"],
  filters: [],
  plugins: [],
};

interface SocketData {
  sessionId: string;
}

export async function startFakeLavalink(options: FakeLavalinkOptions): Promise<FakeLavalink> {
  const sessions: string[] = [];
  const authorized = (req: Request) => req.headers.get("authorization") === options.password;

  const server = Bun.serve<SocketData, never>({
    port: options.port ?? 0,
    hostname: "127.0.0.1",
    fetch(req, srv) {
      const { pathname } = new URL(req.url);
      if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
      if (pathname === "/v4/websocket") {
        const sessionId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
        return srv.upgrade(req, { data: { sessionId } }) ? undefined : new Response("Upgrade failed", { status: 400 });
      }
      if (pathname === "/v4/info") return Response.json(INFO);
      if (pathname === "/version") return new Response(INFO.version.semver);
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open(ws: ServerWebSocket<SocketData>) {
        sessions.push(ws.data.sessionId);
        ws.send(JSON.stringify({ op: "ready", resumed: false, sessionId: ws.data.sessionId }));
      },
      message() {},
    },
  });

  return {
    port: server.port ?? 0,
    sessionIds: () => [...sessions],
    stop: () => server.stop(true),
  };
}
