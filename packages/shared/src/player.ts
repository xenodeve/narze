import { z } from "zod";

const snowflake = z.string().regex(/^\d+$/);

export const RequesterSchema = z.object({
  id: snowflake,
  name: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
});
export type Requester = z.infer<typeof RequesterSchema>;

export const TrackSourceSchema = z.enum(["spotify", "youtube", "youtubemusic", "soundcloud", "http"]);

/** A track with full playback identity. Missing uri, source or requester = Invalid Player State. */
export const TrackSchema = z.object({
  uri: z.string().min(1),
  source: TrackSourceSchema,
  title: z.string(),
  author: z.string(),
  durationMs: z.number().int().nonnegative(),
  artworkUrl: z.string().url().nullable(),
  requester: RequesterSchema,
  /** The playlist it was added from (spec #66), shown as `จาก: <name> (index/total)`. */
  playlist: z
    .object({
      name: z.string(),
      url: z.string(),
      index: z.number().int().positive(),
      total: z.number().int().positive(),
    })
    .optional(),
});
export type Track = z.infer<typeof TrackSchema>;

export const LoopModeSchema = z.enum(["off", "track", "queue"]);

export const PlayerStateSchema = z.object({
  guildId: snowflake,
  current: TrackSchema.nullable(),
  /** Position at `syncedAt`; clients interpolate from here. */
  positionMs: z.number().int().nonnegative(),
  syncedAt: z.number().int().nonnegative(),
  paused: z.boolean(),
  volume: z.number().int().min(0).max(1000),
  loop: LoopModeSchema,
  twentyFourSeven: z.boolean(),
  queue: z.array(TrackSchema),
  revision: z.number().int().nonnegative(),
  /**
   * Identifies the Bot process that produced the state. Revisions restart when the Bot restarts,
   * so a new epoch is applied even with a lower revision (ADR-0007).
   */
  epoch: z.string().min(1),
  /** When the last seek happened (same clock as `syncedAt`); lets clients show a small rewind (spec #103). */
  lastSeekAt: z.number().int().nonnegative().nullable(),
  voiceChannelId: snowflake.nullable(),
  /** Queue Recovery (#103) is restoring this Player after a Bot restart; cleared once it plays. */
  recovering: z.boolean().optional(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

/** Every Guild event (ADR-0007): clients drop revision < local and refetch on a gap. */
export const GuildEventSchema = z.object({
  type: z.string().min(1),
  guildId: snowflake,
  revision: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  ts: z.number().int().nonnegative(),
  data: z.unknown(),
});
export type GuildEvent = z.infer<typeof GuildEventSchema>;
