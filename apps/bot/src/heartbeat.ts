import { type BotHeartbeat, Channels, HEARTBEAT_INTERVAL_MS, type RuntimeMode } from "@narze/shared";

export interface HeartbeatOptions {
  publish: (channel: string, message: string) => unknown;
  /** Read on every beat: the Bot only knows its id after logging in. */
  botId: () => string;
  mode: RuntimeMode;
  version: string;
  guildCount: () => number;
  intervalMs?: number;
}

/** Publishes a BotHeartbeat now and every interval; returns a stop function. */
export function startHeartbeat(options: HeartbeatOptions): () => void {
  const beat = () => {
    const heartbeat: BotHeartbeat = {
      botId: options.botId(),
      at: Date.now(),
      mode: options.mode,
      guilds: options.guildCount(),
      version: options.version,
    };
    void options.publish(Channels.botHeartbeat, JSON.stringify(heartbeat));
  };
  beat();
  const timer = setInterval(beat, options.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
