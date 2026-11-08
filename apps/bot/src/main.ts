import { DEFAULT_REDIS_URL } from "@narze/shared";
import { Client, GatewayIntentBits, type Guild } from "discord.js";
import { startCommandBus } from "./command-bus";
import { announcer, handleInteractions } from "./discord/interactions";
import { createGuildRegistry, type GuildVoiceSnapshot } from "./guild-registry";
import { startHeartbeat } from "./heartbeat";
import { createLavalink } from "./lavalink";
import { createMusic } from "./music/music";
import { createPlayerPublisher, type PlayerPublisher } from "./music/player-state";
import { createSnapshotStore } from "./music/queue-snapshot";
import { detectRuntimeMode } from "./runtime-mode";
import { firstSendableTextChannel, perGuildDebounce, publicVoiceChannels } from "./voice-channels";

const env = process.env;
const VERSION = env.BOT_VERSION ?? "7.0.0-dev";
/** Spec #21: Queue Recovery waits this long after the Lavalink node is up, as v5 did. */
const RECOVERY_DELAY_MS = 5_000;
let swept = false;
/** A hard kill restores the position of the last write, at most this old (#103). */
const SNAPSHOT_EVERY_MS = 10_000;

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
const silent: Pick<PlayerPublisher, "publish" | "gone" | "jump" | "voice"> = {
  publish: async () => {},
  gone: async () => {},
  jump: async () => {},
  voice: async () => {},
};
const music = createMusic({
  lavalink,
  publisher: redis ? createPlayerPublisher(redis) : silent,
  announce: announcer(client),
  // Queue Snapshots are local files, so Queue Recovery works in both Runtime Modes (CONTEXT.md).
  snapshots: createSnapshotStore(env.QUEUE_SNAPSHOT_DIR ?? ".data/queue-snapshots"),
});
function scheduleRecovery(): void {
  setTimeout(() => {
    const stillThere = (s: { guildId: string; voiceChannelId: string }) =>
      Boolean(client.guilds.cache.get(s.guildId)?.channels.cache.has(s.voiceChannelId));
    music
      .recover(stillThere)
      .then((count) => count > 0 && console.log(`[bot] Queue Recovery restored ${count} Player(s)`))
      .catch((error: Error) => console.warn(`[bot] Queue Recovery: ${error.message}`));
  }, RECOVERY_DELAY_MS);
}
const snapshotTimer = setInterval(() => void music.flush(), SNAPSHOT_EVERY_MS);
handleInteractions(client, music, () => lavalink.nodeManager.leastUsedNodes().length > 0);

const textChannelFor = (guildId: string): string | null => {
  const guild = client.guilds.cache.get(guildId);
  return guild ? firstSendableTextChannel(guild) : null;
};
if (redis) {
  await startCommandBus({ subscriber: redis.duplicate(), redis, music, textChannelFor }).catch((error: Error) =>
    console.warn(`[bot] command bus: ${error.message}`),
  );
}

const voiceLists = perGuildDebounce(async (guildId) => {
  const guild = client.guilds.cache.get(guildId);
  if (guild && registry) await registry.voiceChannels(guildId, publicVoiceChannels(guild));
});
const publishVoiceChannels = (guild: Guild) => voiceLists.schedule(guild.id);

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
  // Spec #21: after the sweep and once Lavalink is up, bring back the Players a restart dropped.
  swept = true;
  if (lavalink.nodeManager.leastUsedNodes().length > 0) scheduleRecovery();
});
// A Lavalink restart destroys every Player but keeps their snapshots: each reconnect recovers them.
lavalink.nodeManager.on("connect", () => {
  if (swept) scheduleRecovery();
});
client.on("guildCreate", (guild) => void registry?.add(voiceSnapshotOf(guild)).catch(logFailure("guild registry")));
client.on("guildDelete", (guild) => {
  voiceLists.cancel(guild.id);
  void registry?.remove(guild.id).catch(logFailure("guild registry"));
});
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
  clearInterval(snapshotTimer);
  // The exact position survives a clean stop; a hard kill keeps the last periodic write.
  await music.flush();
  await client.destroy();
  await redis?.quit();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
