/**
 * Just enough of Discord's OAuth2 and REST API for Supabase Auth (GoTrue) and the Backend to sign a
 * user in and list their guilds, so the Playwright suite never needs real Discord credentials.
 * GoTrue calls /api/oauth2/* and /api/users/@me; the Backend calls /api/v10/users/@me[/guilds].
 */

export interface FakeDiscordUser {
  id: string;
  username: string;
  globalName: string;
}

export interface FakeDiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
}

export interface FakeDiscordOptions {
  /** 0 picks a free port. */
  port?: number;
  /** "0.0.0.0" when Supabase Auth runs in Docker and reaches this through host.docker.internal. */
  hostname?: string;
}

export interface FakeDiscord {
  port: number;
  stop(): void;
}

interface Account {
  user: FakeDiscordUser;
  guilds: FakeDiscordGuild[];
}

const DEFAULT_ACCOUNT: Account = {
  user: { id: "100000000000000001", username: "narze-tester", globalName: "Narze Tester" },
  guilds: [],
};

export async function startFakeDiscord(options: FakeDiscordOptions = {}): Promise<FakeDiscord> {
  let next = DEFAULT_ACCOUNT;
  const codes = new Map<string, Account>();
  const tokens = new Map<string, Account>();

  const account = (req: Request) => tokens.get(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");

  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname ?? "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/api\/v10\//, "/api/");

      // Control endpoint: the user (and guilds) the next authorization signs in as.
      if (path === "/__fake/user" && req.method === "POST") {
        next = (await req.json()) as Account;
        return new Response(null, { status: 204 });
      }
      if (path === "/api/oauth2/authorize") {
        const back = new URL(url.searchParams.get("redirect_uri") ?? "");
        const code = crypto.randomUUID();
        codes.set(code, next);
        back.searchParams.set("code", code);
        back.searchParams.set("state", url.searchParams.get("state") ?? "");
        return Response.redirect(back.toString(), 302);
      }
      if (path === "/api/oauth2/token" && req.method === "POST") {
        const code = new URLSearchParams(await req.text()).get("code") ?? "";
        const owner = codes.get(code);
        if (!owner) return Response.json({ error: "invalid_grant" }, { status: 400 });
        codes.delete(code);
        const token = crypto.randomUUID();
        tokens.set(token, owner);
        return Response.json({
          access_token: token,
          token_type: "Bearer",
          expires_in: 604800,
          refresh_token: crypto.randomUUID(),
          scope: "identify email guilds",
        });
      }

      const signedIn = account(req);
      if (path === "/api/users/@me") {
        if (!signedIn) return Response.json({ message: "401: Unauthorized" }, { status: 401 });
        const { user } = signedIn;
        return Response.json({
          id: user.id,
          username: user.username,
          global_name: user.globalName,
          // GoTrue parses the discriminator as an integer; an empty one fails sign-in.
          discriminator: "0",
          avatar: null,
          email: `${user.username}@example.test`,
          verified: true,
        });
      }
      if (path === "/api/users/@me/guilds") {
        if (!signedIn) return Response.json({ message: "401: Unauthorized" }, { status: 401 });
        return Response.json(signedIn.guilds);
      }
      return new Response("Not found", { status: 404 });
    },
  });

  return {
    port: server.port ?? 0,
    stop: () => server.stop(true),
  };
}
