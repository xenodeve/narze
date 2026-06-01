import type { BotRuntimeMode } from "./runtime-mode";

export interface RedisLifecycle {
  start(): Promise<void>;
  handleReconnect(): Promise<RedisReconnectResult>;
  getMode(): BotRuntimeMode;
}

export interface RedisReconnectResult {
  failedGuildIds: string[];
}

export interface CreateRedisLifecycleOptions {
  mode: BotRuntimeMode;
  startRedis: () => Promise<void>;
  getActiveGuildIds: () => string[];
  publishFullState: (guildId: string) => Promise<void>;
}

export function createRedisLifecycle(
  options: CreateRedisLifecycleOptions,
): RedisLifecycle {
  return {
    async start(): Promise<void> {
      if (options.mode === "connected") {
        await options.startRedis();
      }
    },

    async handleReconnect(): Promise<RedisReconnectResult> {
      const failedGuildIds: string[] = [];

      if (options.mode !== "connected") {
        return { failedGuildIds };
      }

      for (const guildId of options.getActiveGuildIds()) {
        try {
          await options.publishFullState(guildId);
        } catch {
          failedGuildIds.push(guildId);
        }
      }

      return { failedGuildIds };
    },

    getMode(): BotRuntimeMode {
      return options.mode;
    },
  };
}
