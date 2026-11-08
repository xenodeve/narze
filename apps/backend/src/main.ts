import { DEFAULT_REDIS_URL } from "@narze/shared";
import { createApp } from "./app";

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
});
await app.listen(Number(env.BACKEND_PORT ?? 4000));
console.log(`[backend] listening on ${await app.getUrl()}`);
