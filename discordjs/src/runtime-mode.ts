export type BotRuntimeMode = "connected" | "standalone";

export type RuntimeModeReason =
  | "redis_connected"
  | "redis_url_missing"
  | "redis_unavailable";

export interface RuntimeModeResult {
  mode: BotRuntimeMode;
  reason: RuntimeModeReason;
}

export interface DetectRuntimeModeOptions {
  env: Partial<Pick<NodeJS.ProcessEnv, "REDIS_URL">>;
  connectRedis: (redisUrl: string, signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}

export async function detectRuntimeMode(
  options: DetectRuntimeModeOptions,
): Promise<RuntimeModeResult> {
  const redisUrl = options.env.REDIS_URL;

  if (!redisUrl) {
    return {
      mode: "standalone",
      reason: "redis_url_missing",
    };
  }

  const timeoutMs = options.timeoutMs ?? 3000;
  const abortController = new AbortController();

  try {
    await withTimeout(
      options.connectRedis(redisUrl, abortController.signal),
      timeoutMs,
      abortController,
    );
  } catch {
    return {
      mode: "standalone",
      reason: "redis_unavailable",
    };
  }

  return {
    mode: "connected",
    reason: "redis_connected",
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abortController: AbortController,
): Promise<T> {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      abortController.abort();
      reject(new Error(`Redis connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}
