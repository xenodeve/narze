import { parseJson } from "@narze/shared";
import type Redis from "ioredis";
import type { z } from "zod";

/** The newest `count` items of a Bot ring (newest first in Redis), oldest first; bad entries skipped. */
export async function readRing<T extends z.ZodType>(
  redis: Redis,
  key: string,
  schema: T,
  count: number,
): Promise<Array<z.infer<T>>> {
  const raw = await redis.lrange(key, 0, count - 1);
  return raw
    .flatMap((line) => {
      const item = parseJson(schema, line);
      return item ? [item] : [];
    })
    .reverse();
}
