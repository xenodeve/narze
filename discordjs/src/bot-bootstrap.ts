import {
  createGuildSettingsProvider,
  type GuildSettings,
  type GuildSettingsProvider,
} from "./guild-settings";
import { createRedisAdapter, type RedisAdapter, type RedisClientLike } from "./redis-adapter";
import { createRedisLifecycle, type RedisLifecycle } from "./redis-lifecycle";
import { detectRuntimeMode, type BotRuntimeMode, type RuntimeModeResult } from "./runtime-mode";
import {
  createStateRequestHandler,
  type BotErrorPayload,
  type PlayerState,
  type RuntimeGuildState,
  type StateRequestHandler,
} from "./state-request-handler";

const STATE_REQUEST_PATTERN = "backend:request:state:*";

export interface BotBootstrap {
  mode: BotRuntimeMode;
  runtimeMode: RuntimeModeResult;
  settingsProvider: GuildSettingsProvider;
  lifecycle: RedisLifecycle;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BotBootstrapLogger {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
}

export interface CreateBotBootstrapOptions {
  env: Partial<Pick<NodeJS.ProcessEnv, "REDIS_URL">>;
  connectRedis: (redisUrl: string, signal: AbortSignal) => Promise<void>;
  createRedisClient: (redisUrl: string) => RedisClientLike;
  loadGuildSettingsFromSupabase: (guildId: string) => Promise<GuildSettings>;
  loadGuildSettingsFromConnectedCache: (guildId: string) => Promise<GuildSettings>;
  getRuntimeGuildState: (
    guildId: string,
  ) => Promise<RuntimeGuildState | null | undefined>;
  getActiveGuildIds: () => string[];
  nowIso: () => string;
  redisConnectTimeoutMs?: number;
  logger?: BotBootstrapLogger;
}

export async function createBotBootstrap(
  options: CreateBotBootstrapOptions,
): Promise<BotBootstrap> {
  const runtimeMode = await detectRuntimeMode({
    env: options.env,
    connectRedis: options.connectRedis,
    ...(options.redisConnectTimeoutMs === undefined
      ? {}
      : { timeoutMs: options.redisConnectTimeoutMs }),
  });
  const settingsProvider = createGuildSettingsProvider({
    mode: runtimeMode.mode,
    loadFromSupabase: options.loadGuildSettingsFromSupabase,
    loadFromConnectedCache: options.loadGuildSettingsFromConnectedCache,
  });

  let adapter: RedisAdapter | null = null;
  let lifecycle: RedisLifecycle;
  let stateRequestHandler: StateRequestHandler;

  const publishStateFull = async (
    guildId: string,
    state: PlayerState,
  ): Promise<void> => {
    await requireRedisAdapter(adapter).publish(`bot:${guildId}:state:full`, state);
  };
  const publishError = async (
    guildId: string,
    error: BotErrorPayload,
  ): Promise<void> => {
    await requireRedisAdapter(adapter).publish(`bot:${guildId}:error`, error);
  };

  stateRequestHandler = createStateRequestHandler({
    mode: runtimeMode.mode,
    getGuildSettings: settingsProvider.getGuildSettings,
    getRuntimeGuildState: options.getRuntimeGuildState,
    publishStateFull,
    publishError,
    nowIso: options.nowIso,
    ...(options.logger ? { logger: options.logger } : {}),
  });

  if (runtimeMode.mode === "connected") {
    const redisUrl = options.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("Connected Mode requires REDIS_URL");
    }

    adapter = createRedisAdapter({
      redisUrl,
      patterns: [STATE_REQUEST_PATTERN],
      createClient: options.createRedisClient,
      onMessage: async (channel, payload) => {
        await stateRequestHandler.handleStateRequest(channel, payload);
      },
      onReconnect: async () => {
        await lifecycle.handleReconnect();
      },
      ...(options.logger ? { logger: options.logger } : {}),
    });
  }

  lifecycle = createRedisLifecycle({
    mode: runtimeMode.mode,
    startRedis: async () => {
      await requireRedisAdapter(adapter).start();
    },
    getActiveGuildIds: options.getActiveGuildIds,
    publishFullState: async (guildId) => {
      const result = await stateRequestHandler.handleStateRequest(
        `backend:request:state:${guildId}`,
        { guildId },
      );
      if (!result.statePublished) {
        throw new Error(`Failed to publish full PlayerState for Guild ${guildId}`);
      }
    },
  });

  return {
    mode: runtimeMode.mode,
    runtimeMode,
    settingsProvider,
    lifecycle,
    async start(): Promise<void> {
      await lifecycle.start();
    },
    async stop(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}

function requireRedisAdapter(adapter: RedisAdapter | null): RedisAdapter {
  if (!adapter) {
    throw new Error("Redis adapter is unavailable in Standalone Mode");
  }

  return adapter;
}
