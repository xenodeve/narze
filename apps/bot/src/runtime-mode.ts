import type { RuntimeMode } from "@narze/shared";
import Redis from "ioredis";

export interface RuntimeModeResult {
  mode: RuntimeMode;
  /** The connected client in Connected Mode; null in Standalone Mode. */
  redis: Redis | null;
}

/** Back off from 200 ms up to 5 s between reconnect attempts, and never stop trying. */
export const reconnectDelay = (attempt: number): number => Math.min(attempt * 200, 5000);

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
    // Detection gives up at once; a running Bot does not (ADR-0002, #133). After a Redis restart the
    // client and every duplicate() taken from it reconnect, and subscribers resubscribe.
    redis.options.retryStrategy = reconnectDelay;
    return { mode: "connected", redis };
  } catch {
    redis.disconnect();
    return { mode: "standalone", redis: null };
  }
}

/**
 * A second connection for subscriber mode, with the same reconnect rule. Errors are dropped like the
 * main client's: a reconnect follows each one, and without a listener ioredis prints every attempt.
 */
export function subscriberOf(redis: Redis): Redis {
  const subscriber = redis.duplicate();
  subscriber.on("error", () => {});
  return subscriber;
}
