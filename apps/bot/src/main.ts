import { DEFAULT_REDIS_URL } from "@narze/shared";
import { Client, GatewayIntentBits, type Guild } from "discord.js";
import { createGuildRegistry, type GuildVoiceSnapshot } from "./guild-registry";
import { startHeartbeat } from "./heartbeat";
import { createLavalink } from "./lavalink";
import { detectRuntimeMode } from "./runtime-mode";

const env = process.env;
const VERSION = env.BOT_VERSION ?? "7.0.0-dev";

const { mode, redis } = await detectRuntimeMode(env.REDIS_URL ?? DEFAULT_REDIS_URL, 1500);
console.log(`[bot] ${mode} mode`);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

const lavalink = createLavalink({
  host: env.LAVALINK_HOST ?? "127.0.0.1",
  port: Number(env.LAVALINK_PORT ?? 2333),
  password: env.LAVALINK_PASSWORD ?? "youshallnotpass",
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
  client: { id: env.DISCORD_CLIENT_ID ?? "0", username: "Narze" },
});
lavalink.nodeManager.on("connect", (node) => console.log(`[bot] lavalink node ${node.id} connected`));
lavalink.nodeManager.on("error", (node, error) => console.warn(`[bot] lavalink node ${node.id}: ${error.message}`));

client.on("raw", (packet) => lavalink.sendRawData(packet));

const registry = redis ? createGuildRegistry(redis) : null;
const voiceSnapshotOf = (guild: Guild): GuildVoiceSnapshot => ({
  id: guild.id,
  voice: guild.voiceStates.cache
    .filter((v) => v.channelId)
    .map((v) => [v.id, v.channelId as string] as [string, string]),
});
const logFailure = (what: string) => (error: Error) => console.warn(`[bot] ${what}: ${error.message}`);

client.once("clientReady", async (ready) => {
  console.log(`[bot] logged in as ${ready.user.tag}`);
  await lavalink.init({ id: ready.user.id, username: ready.user.username });
  await registry?.replace(ready.guilds.cache.map(voiceSnapshotOf)).catch(logFailure("guild registry"));
});
client.on("guildCreate", (guild) => void registry?.add(voiceSnapshotOf(guild)).catch(logFailure("guild registry")));
client.on("guildDelete", (guild) => void registry?.remove(guild.id).catch(logFailure("guild registry")));
client.on("voiceStateUpdate", (old, state) => {
  // Mute, deafen and stream toggles fire this too; only a channel change matters here.
  if (old.channelId === state.channelId) return;
  void registry?.voice(state.guild.id, state.id, state.channelId).catch(logFailure("voice registry"));
});

const stopHeartbeat = redis
  ? startHeartbeat({
      publish: (channel, message) => redis.publish(channel, message),
      botId: () => client.user?.id ?? env.DISCORD_CLIENT_ID ?? "local",
      mode,
      version: VERSION,
      guildCount: () => client.guilds.cache.size,
    })
  : () => {};

if (env.DISCORD_TOKEN) await client.login(env.DISCORD_TOKEN);
else console.warn("[bot] DISCORD_TOKEN not set — running without Discord (heartbeat only)");

const shutdown = async () => {
  stopHeartbeat();
  await client.destroy();
  await redis?.quit();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
