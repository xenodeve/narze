/** Local development Redis (docker-compose.yml); every process falls back to this when REDIS_URL is unset. */
export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

/** Redis pub/sub channel names shared by Bot and Backend (ADR-0002). */
export const Channels = {
  /** Bot → Backend: periodic BotHeartbeat. */
  botHeartbeat: "bot:status:heartbeat",
} as const;

/** Socket.io event names shared by Backend and Dashboard (ADR-0001). */
export const SocketEvents = {
  botStatus: "bot:status",
} as const;
