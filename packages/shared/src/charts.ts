import { z } from "zod";
import { trackKey } from "./history";

/** How many songs the Dashboard shows, and Spotify enriches. */
export const CHART_SHOWN = 10;

/** Charts the Dashboard shows (#109, ADR-0010): Apple Music "Top Songs" for these countries. */
export const ChartRegionSchema = z.enum(["th", "us"]);
export type ChartRegion = z.infer<typeof ChartRegionSchema>;

/** Rank change since the previous update of the same chart; null when there was none to compare. */
export const MovementSchema = z.enum(["up", "down", "same", "new"]).nullable();
export type Movement = z.infer<typeof MovementSchema>;

export const ChartEntrySchema = z.object({
  rank: z.number().int().positive(),
  title: z.string(),
  artist: z.string(),
  artwork: z.string().nullable(),
  appleUrl: z.string().nullable(),
  /** Spotify enrichment (spec #72), when the Backend has Spotify credentials. */
  spotifyUrl: z.string().nullable(),
  artistImage: z.string().nullable(),
  movement: MovementSchema,
  previousRank: z.number().int().positive().nullable(),
});
export type ChartEntry = z.infer<typeof ChartEntrySchema>;

/** A chart as served: `stale` is the last good copy, kept because the source failed. */
export const ChartSchema = z.object({
  region: ChartRegionSchema,
  title: z.string(),
  /** The source's own update time, as it states it. */
  sourceUpdatedAt: z.string(),
  /** When the Backend fetched it (ms). */
  fetchedAt: z.number().int().nonnegative(),
  stale: z.boolean(),
  entries: z.array(ChartEntrySchema),
});
export type Chart = z.infer<typeof ChartSchema>;

/**
 * Spec #117's movement (Apple gives none): each song's rank against the previous update of the
 * same chart, matched like Play History (trackKey of title and artist).
 */
export function rankMovement(
  now: ReadonlyArray<{ rank: number; title: string; artist: string }>,
  previous: ReadonlyArray<{ rank: number; title: string; artist: string }> | null,
): Array<{ movement: Movement; previousRank: number | null }> {
  if (!previous) return now.map(() => ({ movement: null, previousRank: null }));
  // A song listed twice counts at its higher place.
  const before = new Map<string, number>();
  for (const e of previous) {
    const key = trackKey(e.title, e.artist);
    if (!before.has(key)) before.set(key, e.rank);
  }
  return now.map((e) => {
    const was = before.get(trackKey(e.title, e.artist));
    if (was === undefined) return { movement: "new", previousRank: null };
    return { movement: e.rank < was ? "up" : e.rank > was ? "down" : "same", previousRank: was };
  });
}
