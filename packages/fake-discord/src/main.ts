import { startFakeDiscord } from "./index";

// Bound to every interface: Supabase Auth runs in Docker and reaches this as host.docker.internal.
const discord = await startFakeDiscord({ port: Number(process.env.FAKE_DISCORD_PORT ?? 4599), hostname: "0.0.0.0" });
console.log(`[fake-discord] listening on ${discord.port}`);
