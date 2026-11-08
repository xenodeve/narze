import { DEFAULT_REDIS_URL, DiscordIdSchema } from "@narze/shared";
import { createApp } from "./app";
import { DEFAULT_RATE_LIMITS } from "./rate-limit";

const env = process.env;
const required = (name: string) => {
  const value = env[name];
  if (!value) throw new Error(`[backend] ${name} is not set — see .env.example`);
  return value;
};

const app = await createApp({
  redisUrl: env.REDIS_URL ?? DEFAULT_REDIS_URL,
  dashboardOrigin: env.DASHBOARD_ORIGIN ?? "http://localhost:3000",
  supabase: { url: required("SUPABASE_URL"), secretKey: required("SUPABASE_SECRET_KEY") },
  discordApiUrl: env.DISCORD_API_URL ?? "https://discord.com/api/v10",
  // Catalog search (#105, ADR-0009); credentials only from the environment.
  lavalink: env.LAVALINK_PASSWORD
    ? {
        url: `http://${env.LAVALINK_HOST ?? "127.0.0.1"}:${env.LAVALINK_PORT ?? 2333}`,
        password: env.LAVALINK_PASSWORD,
      }
    : undefined,
  spotify: {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    // Only end-to-end tests point these at a fake; unset means the real Spotify.
    apiUrl: env.SPOTIFY_API_URL || undefined,
    accountsUrl: env.SPOTIFY_ACCOUNTS_URL || undefined,
  },
  youtubeApiKey: env.YOUTUBE_API_KEY,
  chartsUrl: env.CHARTS_URL || undefined,
  // A proxy on another address than this machine (cloudflared in Docker): its X-Forwarded-For is believed (#142).
  rateLimits: {
    ...DEFAULT_RATE_LIMITS,
    trustedProxies: (env.TRUSTED_PROXIES ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
  },
  developerIds: (env.NARZE_DEVELOPER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => {
      if (!id) return false;
      const valid = DiscordIdSchema.safeParse(id).success;
      // A typo here closes the only way in on a fresh database, so it is said out loud.
      if (!valid) console.warn(`[backend] NARZE_DEVELOPER_IDS: "${id}" is not a Discord ID; ignored`);
      return valid;
    }),
});
await app.listen(Number(env.BACKEND_PORT ?? 4000));
console.log(`[backend] listening on ${await app.getUrl()}`);
