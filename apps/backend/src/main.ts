import { DEFAULT_REDIS_URL } from "@narze/shared";
import { createApp } from "./app";

const app = await createApp({
  redisUrl: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
  dashboardOrigin: process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000",
});
await app.listen(Number(process.env.BACKEND_PORT ?? 4000));
console.log(`[backend] listening on ${await app.getUrl()}`);
