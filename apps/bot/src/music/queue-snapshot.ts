import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseJson, SnowflakeSchema } from "@narze/shared";
import { z } from "zod";
import { writeJsonAtomic } from "../json-file";

/** A Lavalink track as stored: `encoded` is what plays it again without a new search. */
const StoredTrackSchema = z.object({
  encoded: z.string(),
  info: z.record(z.string(), z.unknown()),
  userData: z.record(z.string(), z.unknown()).optional(),
  requester: z.unknown(),
});
export type StoredTrack = z.infer<typeof StoredTrackSchema>;

/**
 * Queue Snapshot (CONTEXT.md): what a Guild's Player needs to come back after a restart. A local
 * file, not Redis or Supabase, so Queue Recovery works in both Runtime Modes.
 */
export const QueueSnapshotSchema = z.object({
  guildId: SnowflakeSchema,
  voiceChannelId: z.string(),
  textChannelId: z.string().nullable(),
  current: StoredTrackSchema.nullable(),
  positionMs: z.number().nonnegative(),
  paused: z.boolean(),
  queue: z.array(StoredTrackSchema),
  volume: z.number(),
  repeatMode: z.enum(["off", "track", "queue"]),
  twentyFourSeven: z.boolean(),
  savedAt: z.number(),
});
export type QueueSnapshot = z.infer<typeof QueueSnapshotSchema>;

/**
 * One JSON file per Guild under `dir`. Writes for a Guild run one after another (a save from the
 * periodic flush can overlap one from a publish, and a clear must not be undone by a save still in
 * flight); each lands whole, through its own temp file and a rename.
 */
export function createSnapshotStore(dir: string) {
  // The file name is the Guild id, so only a snowflake may become one.
  const fileOf = (guildId: string) => join(dir, `${SnowflakeSchema.parse(guildId)}.json`);
  const chains = new Map<string, Promise<void>>();
  function inOrder(guildId: string, task: () => Promise<void>): Promise<void> {
    const run = (chains.get(guildId) ?? Promise.resolve()).then(task, task);
    const tail = run.catch(() => {});
    chains.set(guildId, tail);
    void tail.then(() => {
      if (chains.get(guildId) === tail) chains.delete(guildId);
    });
    return run;
  }
  return {
    async save(snapshot: QueueSnapshot): Promise<void> {
      const file = fileOf(snapshot.guildId);
      return inOrder(snapshot.guildId, () => writeJsonAtomic(file, snapshot));
    },
    async clear(guildId: string): Promise<void> {
      const file = fileOf(guildId);
      return inOrder(guildId, () => rm(file, { force: true }));
    },
    /** Every readable snapshot; a damaged file is skipped (it cannot be restored anyway). */
    async all(): Promise<QueueSnapshot[]> {
      const names = await readdir(dir).catch(() => [] as string[]);
      const found: QueueSnapshot[] = [];
      for (const name of names.filter((n) => n.endsWith(".json"))) {
        const raw = await readFile(join(dir, name), "utf8").catch(() => "");
        const snapshot = parseJson(QueueSnapshotSchema, raw);
        if (snapshot) found.push(snapshot);
      }
      return found;
    },
  };
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
