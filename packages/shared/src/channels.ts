/** Local development Redis (docker-compose.yml); every process falls back to this when REDIS_URL is unset. */
export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

/** Redis pub/sub channel names shared by Bot and Backend (ADR-0002). */
export const Channels = {
  /** Bot → Backend: periodic BotHeartbeat. */
  botHeartbeat: "bot:status:heartbeat",
  /** Bot → Backend: every Guild event (GuildEventSchema, ADR-0007). */
  guildEvents: "guild:events",
} as const;

/** Redis keys the Bot writes and the Backend reads (ADR-0002). Never authoritative: the Bot rebuilds them on ready. */
export const RedisKeys = {
  /** Set of guild ids the Bot is in. */
  botGuilds: "bot:guilds",
  /** Hash userId → voice channel id, for members currently in voice in one Guild. */
  voiceStates: (guildId: string) => `bot:voice:${guildId}`,
  /**
   * JSON PlayerSummary of one Guild's Player; absent when there is no Player. The Bot sets it
   * before publishing the matching `player:summary` Guild event, so a reader never sees the event first.
   */
  playerSummary: (guildId: string) => `player:summary:${guildId}`,
  /** Hash discordId → number of open Dashboard tabs (Presence). */
  presence: "presence:tabs",
} as const;

/** Guild event types (GuildEventSchema.type). */
export const GuildEventTypes = {
  /** data: PlayerSummary. */
  playerSummary: "player:summary",
} as const;

/** Socket.io event names shared by Backend and Dashboard (ADR-0001). */
export const SocketEvents = {
  botStatus: "bot:status",
  /** Backend → socket: the handshake token was verified and the tab is counted; user rooms are joined. A bad token fails the handshake (`connect_error`) instead. */
  sessionReady: "session:ready",
  /** Backend → one user's sockets: a GuildSummary that changed. */
  guildSummary: "guild:summary",
} as const;
