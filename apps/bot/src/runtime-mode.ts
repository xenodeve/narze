import type { RuntimeMode } from "@narze/shared";
import Redis from "ioredis";

export interface RuntimeModeResult {
  mode: RuntimeMode;
  /** The connected client in Connected Mode; null in Standalone Mode. */
  redis: Redis | null;
}

/** ADR-0003: Connected Mode if Redis answers within the timeout, otherwise Standalone Mode. */
export async function detectRuntimeMode(url: string, timeoutMs: number): Promise<RuntimeModeResult> {
  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: timeoutMs,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on("error", () => {});
  try {
    await redis.connect();
    await redis.ping();
    return { mode: "connected", redis };
  } catch {
    redis.disconnect();
    return { mode: "standalone", redis: null };
  }
}
