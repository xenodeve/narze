import { format } from "node:util";
import { Channels, LOG_RING, type LogLine, logLevelOf, RedisKeys } from "@narze/shared";
import type Redis from "ioredis";

type ConsoleLike = Pick<Console, "log" | "info" | "debug" | "warn" | "error">;
const METHODS = ["log", "info", "debug", "warn", "error"] as const;

/**
 * Spec #120: every console line the Bot writes still prints, and also reaches `sink` with its level.
 * Returns a function that puts the console back. A sink that throws never breaks the print.
 */
export function captureConsole(
  sink: (line: LogLine) => void,
  { target = console as ConsoleLike, now = Date.now }: { target?: ConsoleLike; now?: () => number } = {},
): () => void {
  const originals = new Map(METHODS.map((m) => [m, target[m]] as const));
  let inSink = false;
  for (const method of METHODS) {
    const original = originals.get(method) as (...args: unknown[]) => void;
    target[method] = (...args: unknown[]) => {
      original.apply(target, args);
      // A sink that logs (or fails and logs) must not loop back into itself.
      if (inSink) return;
      inSink = true;
      try {
        sink({ at: now(), level: logLevelOf(method), text: format(...args) });
      } catch {
        // The print above already happened; losing a log line is better than losing the Bot.
      } finally {
        inSink = false;
      }
    };
  }
  return () => {
    for (const method of METHODS) target[method] = originals.get(method) as ConsoleLike[typeof method];
  };
}

/**
 * The log ring in Redis (spec #120): newest first, capped at LOG_RING lines across restarts, and
 * each line published for admin tabs watching live. Writes go out in order.
 */
export function createLogSink(
  redis: Redis,
  { ring = RedisKeys.botLogRing, channel = Channels.botLogs }: { ring?: string; channel?: string } = {},
) {
  let chain: Promise<unknown> = Promise.resolve();
  const sink = (line: LogLine) => {
    const raw = JSON.stringify(line);
    chain = chain
      .then(() =>
        redis
          .multi()
          .lpush(ring, raw)
          .ltrim(ring, 0, LOG_RING - 1)
          .publish(channel, raw)
          .exec(),
      )
      .catch(() => {});
  };
  /** Resolves when every line written so far has reached Redis. */
  sink.flushed = () => chain.then(() => {});
  return sink;
}
