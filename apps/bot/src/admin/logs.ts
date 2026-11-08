import { format } from "node:util";
import { type LogLine, logLevelOf } from "@narze/shared";
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
 * A capped ring in Redis, newest first, with each item published for admin tabs watching live:
 * the log ring (spec #120, LOG_RING lines across restarts) and the stats ring (spec #109). Items
 * that arrive while a write is in flight go out together in the next one, in order; while Redis is
 * unreachable at most `cap` items wait.
 */
export function createRingSink<T>(
  redis: Redis,
  { ring, channel, cap }: { ring: string; channel: string; cap: number },
) {
  let pending: string[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const write = async () => {
    const raws = pending;
    pending = [];
    const multi = redis
      .multi()
      .lpush(ring, ...raws)
      .ltrim(ring, 0, cap - 1);
    for (const raw of raws) multi.publish(channel, raw);
    await multi.exec();
  };
  const sink = (item: T) => {
    pending.push(JSON.stringify(item));
    if (pending.length > cap) pending.splice(0, pending.length - cap);
    if (pending.length === 1) chain = chain.then(write).catch(() => {});
  };
  /** Resolves when every item written so far has reached Redis. */
  sink.flushed = () => chain.then(() => {});
  return sink;
}
