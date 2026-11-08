import { DEFAULT_REDIS_URL } from "@narze/shared";
import { ChannelType, Client, GatewayIntentBits, type Guild, PermissionFlagsBits } from "discord.js";
import { startCommandBus } from "./command-bus";
import { announcer, handleInteractions } from "./discord/interactions";
import { createGuildRegistry, type GuildVoiceSnapshot } from "./guild-registry";
import { startHeartbeat } from "./heartbeat";
import { createLavalink } from "./lavalink";
import { createMusic } from "./music/music";
import { createPlayerPublisher, type PlayerPublisher } from "./music/player-state";
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

// Standalone Mode plays without publishing: there is no Redis to publish to (ADR-0003).
const silent: Pick<PlayerPublisher, "publish" | "gone"> = { publish: async () => {}, gone: async () => {} };
const music = createMusic({
  lavalink,
  publisher: redis ? createPlayerPublisher(redis) : silent,
  announce: announcer(client),
});
handleInteractions(client, music, () => lavalink.nodeManager.leastUsedNodes().length > 0);

/** The first text channel the Bot may post in: where notices go for a Dashboard-started player (#106 adds the Music Channel). */
const textChannelFor = (guildId: string): string | null => {
  const guild = client.guilds.cache.get(guildId);
  const me = guild?.members.me;
  if (!guild || !me) return null;
  const channel = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText && c.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages))
    .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
    .first();
  return channel?.id ?? null;
};
if (redis) {
  await startCommandBus({ subscriber: redis.duplicate(), redis, music, textChannelFor }).catch((error: Error) =>
    console.warn(`[bot] command bus: ${error.message}`),
  );
}

/** The picker's view of one Guild: voice channels and the people (not bots) in each (spec #86). */
const voiceChannelsOf = (guild: Guild) =>
  guild.channels.cache
    .filter((c) => c.isVoiceBased())
    .map((c) => ({
      id: c.id,
      name: c.name,
      members: c.members
        .filter((m) => !m.user.bot)
        .map((m) => ({ id: m.id, name: m.displayName, avatarUrl: m.displayAvatarURL({ size: 64 }) })),
    }));

/** One voice:update per Guild per second at most, carrying the latest state (trailing, unlike v5's drop). */
const pendingVoice = new Map<string, ReturnType<typeof setTimeout>>();
const publishVoiceChannels = (guild: Guild) => {
  if (!registry || pendingVoice.has(guild.id)) return;
  pendingVoice.set(
    guild.id,
    setTimeout(() => {
      pendingVoice.delete(guild.id);
      void registry.voiceChannels(guild.id, voiceChannelsOf(guild)).catch(logFailure("voice channels"));
    }, 1000),
  );
};

const registry = redis ? createGuildRegistry(redis) : null;
const voiceSnapshotOf = (guild: Guild): GuildVoiceSnapshot => ({
  id: guild.id,
  memberCount: guild.memberCount,
  voice: guild.voiceStates.cache
    .filter((v) => v.channelId)
    .map((v) => [v.id, v.channelId as string] as [string, string]),
});
const logFailure = (what: string) => (error: Error) => console.warn(`[bot] ${what}: ${error.message}`);

client.once("clientReady", async (ready) => {
  console.log(`[bot] logged in as ${ready.user.tag}`);
  await lavalink.init({ id: ready.user.id, username: ready.user.username });
  await registry?.replace(ready.guilds.cache.map(voiceSnapshotOf)).catch(logFailure("guild registry"));
  if (redis) await createPlayerPublisher(redis).sweep().catch(logFailure("sweep stale Player States"));
  for (const guild of ready.guilds.cache.values()) publishVoiceChannels(guild);
});
client.on("guildCreate", (guild) => void registry?.add(voiceSnapshotOf(guild)).catch(logFailure("guild registry")));
client.on("guildDelete", (guild) => void registry?.remove(guild.id).catch(logFailure("guild registry")));
client.on("voiceStateUpdate", (old, state) => {
  // Mute, deafen and stream toggles fire this too; only a channel change matters here.
  if (old.channelId === state.channelId) return;
  publishVoiceChannels(state.guild);
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
