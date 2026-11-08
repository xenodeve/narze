/** Local development Redis (docker-compose.yml); every process falls back to this when REDIS_URL is unset. */
export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

/** Redis pub/sub channel names shared by Bot and Backend (ADR-0002). */
export const Channels = {
  /** Bot → Backend: periodic BotHeartbeat. */
  botHeartbeat: "bot:status:heartbeat",
  /** Bot → Backend: every Guild event (GuildEventSchema, ADR-0007). */
  guildEvents: "guild:events",
  /** Backend → Bot: a PlayerCommand already allowed by Control Permission (#101). */
  botCommands: "bot:commands",
  /** Bot → Backend: the CommandResult for each command id. */
  botCommandResults: "bot:command-results",
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
  /** Hash guildId → member count, for the server list (spec #79). */
  botMemberCounts: "bot:member-counts",
  /**
   * JSON PlayerState of one Guild; absent when there is no Player. Set before the `player:state`
   * Guild event, like the summary. The Backend's Hot Cache sits in front of it (ADR-0006).
   */
  playerState: (guildId: string) => `player:state:${guildId}`,
  /** JSON VoiceChannelList of one Guild, for the voice-channel picker (spec #86). */
  voiceChannels: (guildId: string) => `bot:voice-channels:${guildId}`,
  /** JSON `TextChannelList`: text channels the Bot can post in, for the Music Channel picker (#106). */
  textChannels: (guildId: string) => `bot:text-channels:${guildId}`,
  /** Hash discordId → number of open Dashboard tabs (Presence). */
  presence: "presence:tabs",
} as const;

/** Guild event types (GuildEventSchema.type). */
export const GuildEventTypes = {
  /** data: PlayerSummary. */
  playerSummary: "player:summary",
  /** data: PlayerState. */
  playerState: "player:state",
  /** data: null — the Player was destroyed. */
  playerGone: "player:gone",
  /** data: `{ fromIndex, title }` — a queued track is about to play now; sent before the queue update (spec #39). */
  queueJump: "queue:jump",
  /** data: VoiceChannelList — someone joined, left or moved voice channels in the Guild. */
  voiceUpdate: "voice:update",
  /** data: GuildSettings — a Guild's settings changed (#106); the Bot refreshes its copy. */
  settingsUpdate: "settings:update",
  /** data: `{ code, reason, byRemote, recovering }` — the Bot's voice connection dropped (spec #28). */
  voiceDisconnect: "voice:disconnect",
  /** data: `{ resumed, positionMs, title }` — the voice connection is back after a drop (v5 sent `position` and the whole `track`). */
  voiceReconnected: "voice:reconnected",
  /** data: `{ error: "player-gone" | "reconnect" }` — reconnecting failed; a fixed code, never the raw error. */
  voiceReconnectFailed: "voice:reconnect-failed",
} as const;

/** The voice-drop events (spec #28), drawn by the Dashboard and never cached. */
export const VOICE_EVENT_TYPES = [
  GuildEventTypes.voiceDisconnect,
  GuildEventTypes.voiceReconnected,
  GuildEventTypes.voiceReconnectFailed,
] as const;
export type VoiceEventType = (typeof VOICE_EVENT_TYPES)[number];

/** Socket.io event names shared by Backend and Dashboard (ADR-0001). */
export const SocketEvents = {
  botStatus: "bot:status",
  /** Backend → socket: the handshake token was verified and the tab is counted; user rooms are joined. A bad token fails the handshake (`connect_error`) instead. */
  sessionReady: "session:ready",
  /** Backend → one user's sockets: a GuildSummary that changed. */
  guildSummary: "guild:summary",
  /** Backend → a Guild's room: the GuildEvent carrying a PlayerState (or `player:gone`). */
  playerEvent: "player:event",
  /** Dashboard → Backend with ack: `{ guildId, command: PlayerAction }`; ack `{ ok, reason?, error? }`. */
  playerCommand: "player:command",
  /** Backend → one tab: `{ guildId, canControl, reason }` whenever its Control Permission may have changed. */
  permissionUpdate: "permission:update",
  /** Backend → room: `{ guildId, settings }` after a settings change (#106, spec #92). */
  settingsUpdate: "settings:update",
  /** Backend → the user's own tabs: `{ playlistId }` after a Library change (#107). */
  libraryUpdate: "library:update",
  /** Backend → a Guild's room: the Guild's VoiceChannelList changed. */
  voiceChannels: "voice:channels",
} as const;
