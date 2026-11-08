import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FAKE_DISCORD_PORT, type FakeDiscordGuild, type FakeDiscordUser, setFakeDiscordUser } from "./index";

export { FAKE_DISCORD_PORT };

export interface LocalSupabase {
  url: string;
  publishableKey: string;
  secretKey: string;
}

// Node APIs only: this also runs inside Playwright's config, which Node executes.
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
/** Bun itself under `bun test`; under Playwright (Node), the Bun that `bun run` recorded. */
export const BUN = process.env.BUN_BIN ?? (process.versions.bun ? process.execPath : process.env.npm_execpath) ?? "bun";

function supabaseCli(...args: string[]): string {
  const run = spawnSync(BUN, ["x", "supabase@3", ...args, "--workdir", REPO_ROOT], { encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(`supabase ${args.join(" ")} failed — is Supabase local running? (bun run infra:up)\n${run.stderr}`);
  }
  return run.stdout;
}

/** Set by the first caller in a process tree, so Playwright workers and specs do not spawn the CLI again. */
const CACHE_ENV = "NARZE_LOCAL_SUPABASE";

/**
 * URL and keys of the running Supabase local, read from the CLI so no key is written into the
 * repo. Read-only: `bun run infra:up` starts the stack and applies migrations.
 */
export function localSupabase(): LocalSupabase {
  const cached = process.env[CACHE_ENV];
  if (cached) return JSON.parse(cached) as LocalSupabase;
  const status = JSON.parse(supabaseCli("status", "-o", "json")) as Record<string, string>;
  const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = status;
  if (!API_URL || !PUBLISHABLE_KEY || !SECRET_KEY) throw new Error("supabase status is missing API_URL or keys");
  const local = { url: API_URL, publishableKey: PUBLISHABLE_KEY, secretKey: SECRET_KEY };
  process.env[CACHE_ENV] = JSON.stringify(local);
  return local;
}

export interface FakeSession {
  access_token: string;
  provider_token: string;
  user: { id: string };
}

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString("base64url");
  return { verifier, challenge };
}

const redirectOf = async (url: string) => {
  const res = await fetch(url, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) throw new Error(`expected a redirect from ${url}, got ${res.status}`);
  return location;
};

/**
 * Signs `user` in through the real Supabase Auth PKCE flow, with Discord played by the fake on
 * FAKE_DISCORD_PORT — the same hops a browser makes. Supabase Auth runs in Docker and names the
 * fake host.docker.internal; this process reaches it on loopback.
 */
export async function signInWithFakeDiscord(
  supabase: LocalSupabase,
  user: FakeDiscordUser,
  guilds: FakeDiscordGuild[],
  redirectTo = "http://localhost:3000/auth/callback",
): Promise<FakeSession> {
  const fake = `http://127.0.0.1:${FAKE_DISCORD_PORT}`;
  await setFakeDiscordUser(user, guilds);
  const { verifier, challenge } = await pkcePair();
  const authorize = new URL(`${supabase.url}/auth/v1/authorize`);
  authorize.search = new URLSearchParams({
    provider: "discord",
    redirect_to: redirectTo,
    scopes: "identify guilds",
    code_challenge: challenge,
    code_challenge_method: "s256",
  }).toString();
  const toDiscord = new URL(await redirectOf(authorize.toString()));
  const toSupabase = await redirectOf(`${fake}${toDiscord.pathname}${toDiscord.search}`);
  const toApp = new URL(await redirectOf(toSupabase));
  const code = toApp.searchParams.get("code");
  if (!code) throw new Error(`sign-in failed: ${toApp.searchParams.get("error_description") ?? toApp}`);
  const token = await fetch(`${supabase.url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: supabase.publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!token.ok) throw new Error(`code exchange failed: ${token.status} ${await token.text()}`);
  return (await token.json()) as FakeSession;
}
