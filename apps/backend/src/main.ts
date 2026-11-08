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
});
await app.listen(Number(env.BACKEND_PORT ?? 4000));
console.log(`[backend] listening on ${await app.getUrl()}`);
