import { z } from "zod";
import { RequesterSchema } from "./player";

/**
 * Play History's track id (spec #116): base64 of the UTF-8 `title-author`, with `/ + =` made `_`,
 * so the same song played from Spotify and from YouTube counts once.
 */
export function trackKey(title: string, author: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(`${title}-${author}`)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/[/+=]/g, "_");
}

const ms = z.number().int().nonnegative();

/** Someone who listened: in the Bot's voice channel at a track start, or a remote requester. */
export const SessionParticipantSchema = RequesterSchema.extend({ joinedAt: ms });
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;

/** A track as it started in a session; every start counts (repeats included, like v5). */
export const SessionTrackSchema = z.object({
  title: z.string(),
  author: z.string(),
  uri: z.string().min(1),
  thumbnail: z.string().nullable(),
  durationMs: ms,
  playedAt: ms,
  requester: RequesterSchema,
});
export type SessionTrack = z.infer<typeof SessionTrackSchema>;

/** A Listening Session (spec #31): one active per Guild, from the first track until the Bot leaves voice. */
export const ListeningSessionSchema = z.object({
  id: z.string().min(1),
  guildId: z.string(),
  guildName: z.string(),
  channelId: z.string().nullable(),
  startTime: ms,
  endTime: ms.nullable(),
  isActive: z.boolean(),
  tracks: z.array(SessionTrackSchema),
  participants: z.array(SessionParticipantSchema),
});
export type ListeningSession = z.infer<typeof ListeningSessionSchema>;

/** The grid's row: everything but the tracks, which only the detail page needs. */
export const SessionSummarySchema = ListeningSessionSchema.omit({ tracks: true }).extend({ trackCount: ms });
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export function sessionSummary(session: ListeningSession): SessionSummary {
  const { tracks, ...rest } = session;
  return { ...rest, trackCount: tracks.length };
}

/**
 * What `session:update` / `session:end` carry (#108 review): the summary and the newest track. The
 * whole track list would grow without bound in a 24/7 Guild and go to every participant each time.
 */
export const SessionEventSchema = SessionSummarySchema.extend({ track: SessionTrackSchema.nullable() });
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export function sessionEvent(session: ListeningSession): SessionEvent {
  return { ...sessionSummary(session), track: session.tracks.at(-1) ?? null };
}

/** A top-played row (spec #33, #84): one song's plays for a user, a Guild, or a user in a Guild. */
export const TopPlayedSchema = z.object({
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  uri: z.string(),
  thumbnail: z.string().nullable(),
  durationMs: ms,
  source: z.string(),
  isMusic: z.boolean(),
  isVideo: z.boolean(),
  playCount: z.number().int().positive(),
  lastPlayedAt: z.string(),
});
export type TopPlayed = z.infer<typeof TopPlayedSchema>;
