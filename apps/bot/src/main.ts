import os from "node:os";
import { join } from "node:path";
import {
  type AdminStats,
  Channels,
  DEFAULT_REDIS_URL,
  GuildEventSchema,
  GuildEventTypes,
  GuildSettingsSchema,
  LOG_RING,
  type LogLine,
  parseJson,
  RedisKeys,
  STATS_POINTS,
} from "@narze/shared";
import { createClient } from "@supabase/supabase-js";
import { AuditLogEvent, Client, GatewayIntentBits, type Guild } from "discord.js";
import { captureConsole, createRingSink } from "./admin/logs";
import { startAdminQueries } from "./admin/queries";
import { createCpuMeter } from "./admin/stats";
import { startCommandBus } from "./command-bus";
import { announcer, handleInteractions } from "./discord/interactions";
import { createGuildRegistry, type GuildVoiceSnapshot } from "./guild-registry";
import { startHeartbeat } from "./heartbeat";
import { createHistory, createSessionFile } from "./history/history";
import { createSupabaseHistoryStore } from "./history/history-store";
import { createLavalink } from "./lavalink";
import { createArtwork, iconModesFrom } from "./music/artwork";
import { createMusic } from "./music/music";
import { createPlayerPublisher, type PlayerPublisher } from "./music/player-state";
import { createSnapshotStore } from "./music/queue-snapshot";
import { createSpotify } from "./music/spotify";
import { createYouTube } from "./music/youtube";
import { detectRuntimeMode } from "./runtime-mode";
import { createGuildSettings, createSupabaseSettingsStore, inviterOf, WELCOME } from "./settings/guild-settings";
import {
  firstSendableTextChannel,
  listenersOf,
  perGuildDebounce,
  publicVoiceChannels,
  sendableTextChannels,
} from "./voice-channels";

const env = process.env;
const logFailure = (what: string) => (error: Error) => console.warn(`[bot] ${what}: ${error.message}`);
const VERSION = env.BOT_VERSION ?? "7.0.0-dev";
/** Spec #21: Queue Recovery waits this long after the Lavalink node is up, as v5 did. */
const RECOVERY_DELAY_MS = 5_000;
let swept = false;
/** A hard kill restores the position of the last write, at most this old (#103). */
const SNAPSHOT_EVERY_MS = 10_000;
/** Spec #109: the admin stats sample window. */
const STATS_EVERY_MS = 5_000;

const { mode, redis } = await detectRuntimeMode(env.REDIS_URL ?? DEFAULT_REDIS_URL, 1500);
// #110, spec #120: in Connected Mode the console also feeds the admin log viewer.
const logSink = redis
  ? createRingSink<LogLine>(redis, { ring: RedisKeys.botLogRing, channel: Channels.botLogs, cap: LOG_RING })
  : null;
if (logSink) captureConsole(logSink);
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
// Supabase holds Guild Settings (#106) and history (#108) in both Runtime Modes (ADR-0003); without
// credentials the Bot plays without a Music Channel, a recorded Bot Owner, sessions or play history.
const db =
  env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
    : null;
const settings = db ? createGuildSettings(createSupabaseSettingsStore(db)) : null;
const youtube = createYouTube({ apiKey: env.YOUTUBE_API_KEY });
const spotify = createSpotify({ clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET });
const publisher = redis ? createPlayerPublisher(redis) : null;
// Listening Sessions and Play History (#108). The local file keeps unsaved sessions across a crash.
const history = db
  ? createHistory({
      store: createSupabaseHistoryStore(db),
      file: createSessionFile(join(env.HISTORY_DIR ?? ".data", "listening-sessions.json")),
      publish: (type, session) => void publisher?.session(type, session).catch(logFailure("publish session")),
      guildName: (guildId) => client.guilds.cache.get(guildId)?.name ?? "",
      members: (guildId, channelId) => {
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
        return channel?.isVoiceBased() ? listenersOf(channel) : [];
      },
      facts: (id) => youtube.videoFacts(id),
      log: (what, error) => console.warn(`[bot] ${what}: ${error instanceof Error ? error.message : error}`),
    })
  : null;

const music = createMusic({
  lavalink,
  publisher: publisher ?? silent,
  announce: announcer(client),
  // Queue Snapshots are local files, so Queue Recovery works in both Runtime Modes (CONTEXT.md).
  snapshots: createSnapshotStore(env.QUEUE_SNAPSHOT_DIR ?? ".data/queue-snapshots"),
  // Track Resolution pictures (#104). Credentials only from the environment; without them the
  // Bot classifies from Lavalink's data and falls back to avatars (spec #62–#67).
  artwork: createArtwork({
    youtube,
    spotify,
    modes: iconModesFrom(env),
    botIcon: () => client.user?.displayAvatarURL() ?? null,
  }),
  usePlaylistUrl: env.USE_PLAYLIST_URL === "true",
  noticeChannel: (guildId) => settings?.musicChannel(guildId) ?? null,
  history: history?.hook,
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
// #110, spec #109: a stats sample every 5 s for the admin pages (Connected Mode only).
const cpu = createCpuMeter({
  now: Date.now,
  cpuMicros: () => {
    const { user, system } = process.cpuUsage();
    return user + system;
  },
  cores: os.cpus().length,
});
// Measured on every sample, so each number belongs to that sample's window (#110 AC).
const caches = {
  autocomplete: music.suggestionStats,
  "spotify-artists": spotify.cacheStats,
  "youtube-facts": youtube.cacheStats,
};
const cacheSizes = (): AdminStats["caches"] =>
  Object.entries(caches).map(([name, stats]) => {
    const { entries, bytes } = stats();
    return { name, items: entries, bytes };
  });
const statsSink = redis
  ? createRingSink<AdminStats>(redis, { ring: RedisKeys.botStatsRing, channel: Channels.botStats, cap: STATS_POINTS })
  : null;
const statsTimer = statsSink
  ? setInterval(
      () =>
        statsSink({
          ...cpu(),
          online: client.isReady(),
          pingMs: client.ws.ping >= 0 ? client.ws.ping : null,
          uptimeMs: Math.round(process.uptime() * 1000),
          guilds: client.guilds.cache.size,
          activePlayers: [...lavalink.players.values()].filter((p) => p.playing).length,
          // The Bot process's resident memory against the machine's total.
          memory: { usedBytes: process.memoryUsage.rss(), totalBytes: os.totalmem() },
          caches: cacheSizes(),
        }),
      STATS_EVERY_MS,
    )
  : null;
handleInteractions(client, music, () => lavalink.nodeManager.leastUsedNodes().length > 0, {
  settings: settings ?? undefined,
  log:
    env.LOG_GUILD_ID && env.LOG_CHANNEL_ID ? { guildId: env.LOG_GUILD_ID, channelId: env.LOG_CHANNEL_ID } : undefined,
  dashboardUrl: env.DASHBOARD_URL,
  // Connected Mode: /setchannel's change reaches open Dashboard tabs like a Dashboard save (AC2).
  settingsChanged: redis
    ? async (guildId) => {
        const changed = await settings?.load(guildId);
        if (!changed) return;
        await redis.publish(
          Channels.guildEvents,
          JSON.stringify({
            type: GuildEventTypes.settingsUpdate,
            guildId,
            revision: 0,
            sequence: 0,
            ts: Date.now(),
            data: changed,
          }),
        );
      }
    : undefined,
});

/** Spec #22, #121: the inviter (audit log BotAdd), else the Server Owner, is the Bot Owner. */
async function recordJoin(guild: Guild): Promise<void> {
  if (!settings) return;
  const inviter = await inviterOf(async () => {
    const log = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    return log.entries.map((e) => ({ targetId: e.targetId, executorId: e.executorId }));
  }, client.user?.id ?? "");
  await settings.join({ id: guild.id, name: guild.name, ownerId: guild.ownerId }, inviter);
}

const publishTextChannels = (guild: Guild) =>
  void registry?.textChannels(guild.id, sendableTextChannels(guild)).catch(logFailure("text channels"));

const textChannelFor = (guildId: string): string | null => {
  const guild = client.guilds.cache.get(guildId);
  return guild ? firstSendableTextChannel(guild) : null;
};
// Connected Mode: a settings change made on the Dashboard reaches the Bot's copy (#106).
if (redis && settings) {
  const listener = redis.duplicate();
  listener.on("message", (_channel, raw) => {
    const event = parseJson(GuildEventSchema, raw);
    if (event?.type !== GuildEventTypes.settingsUpdate) return;
    const changed = GuildSettingsSchema.safeParse(event.data);
    // The data must be about the Guild the event names.
    if (changed.success && changed.data.guildId === event.guildId) settings.apply(changed.data);
  });
  await listener.subscribe(Channels.guildEvents).catch(logFailure("settings updates"));
}
/**
 * The one way out: SIGINT/SIGTERM exit 0; a Dashboard restart exits RESTART_EXIT_CODE (#111).
 * Until everything below is running there is nothing to save, so an early restart just exits; the
 * full shutdown replaces this once it can run (scrutinize m1: no ReferenceError during login).
 */
let shutdown = async (code = 0): Promise<void> => process.exit(code);
if (redis) {
  await startCommandBus({ subscriber: redis.duplicate(), redis, music, textChannelFor }).catch((error: Error) =>
    console.warn(`[bot] command bus: ${error.message}`),
  );
  // Admin reads of Discord and restart/shutdown from the Dashboard (#111).
  await startAdminQueries({ subscriber: redis.duplicate(), redis, client, exit: (code) => void shutdown(code) }).catch(
    (error: Error) => console.warn(`[bot] admin queries: ${error.message}`),
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

client.once("clientReady", async (ready) => {
  console.log(`[bot] logged in as ${ready.user.tag}`);
  await lavalink.init({ id: ready.user.id, username: ready.user.username });
  await registry?.replace(ready.guilds.cache.map(voiceSnapshotOf)).catch(logFailure("guild registry"));
  if (publisher) await publisher.sweep().catch(logFailure("sweep stale Player States"));
  // #108 AC1: sessions a previous process left active end now, before any new one starts.
  await history?.restore([...ready.guilds.cache.keys()]).catch(logFailure("close left-over sessions"));
  for (const guild of ready.guilds.cache.values()) {
    publishVoiceChannels(guild);
    publishTextChannels(guild);
    // Settings rows are created on ready for Guilds joined while the Bot was away (spec #12).
    void settings
      ?.load(guild.id)
      .then((known) => (known ? undefined : recordJoin(guild)))
      .catch(logFailure("guild settings"));
  }
  // Spec #21: after the sweep and once Lavalink is up, bring back the Players a restart dropped.
  swept = true;
  if (lavalink.nodeManager.leastUsedNodes().length > 0) scheduleRecovery();
});
// A Lavalink restart destroys every Player but keeps their snapshots: each reconnect recovers them.
lavalink.nodeManager.on("connect", () => {
  if (swept) scheduleRecovery();
});
client.on("guildCreate", (guild) => {
  void registry?.add(voiceSnapshotOf(guild)).catch(logFailure("guild registry"));
  publishTextChannels(guild);
  void recordJoin(guild).catch(logFailure("guild settings"));
  // Spec #22: a Thai welcome in the system channel; errors swallowed (v5).
  void guild.systemChannel?.send(WELCOME).catch(() => {});
});
client.on("channelCreate", (channel) => {
  if ("guild" in channel) publishTextChannels(channel.guild);
});
client.on("channelDelete", (channel) => {
  if ("guild" in channel) publishTextChannels(channel.guild);
});
// A permission change can open or close a channel to the Bot (#106 review).
client.on("channelUpdate", (_old, channel) => {
  if ("guild" in channel) publishTextChannels(channel.guild);
});
client.on("guildMemberUpdate", (_old, member) => {
  if (member.id === client.user?.id) publishTextChannels(member.guild);
});
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

let stopping = false;
shutdown = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  // A step that hangs must not keep the Bot alive forever (scrutinize m2).
  setTimeout(() => process.exit(code), 10_000).unref();
  stopHeartbeat();
  clearInterval(snapshotTimer);
  if (statsTimer) clearInterval(statsTimer);
  // The exact position survives a clean stop; a hard kill keeps the last periodic write.
  await music.flush();
  await history?.flush().catch(logFailure("save sessions"));
  await client.destroy();
  // The last lines of the shutdown reach the log ring before the connection closes.
  await logSink?.flushed();
  await redis?.quit();
  process.exit(code);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
