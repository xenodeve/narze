import { LavalinkManager } from "lavalink-client";

export interface LavalinkConfig {
  host: string;
  port: number;
  password: string;
  sendToShard: (guildId: string, payload: unknown) => void;
  client: { id: string; username: string };
}

/** The Bot's one Lavalink manager. Every node option the Bot relies on is set here and nowhere else. */
export function createLavalink(config: LavalinkConfig): LavalinkManager {
  return new LavalinkManager({
    nodes: [
      {
        id: "main",
        host: config.host,
        port: config.port,
        authorization: config.password,
        // Bun's WebSocket rejects the close code lavalink-client uses on error (ADR-0004).
        closeOnError: false,
      },
    ],
    sendToShard: config.sendToShard,
    client: config.client,
  });
}
