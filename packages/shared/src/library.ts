import { z } from "zod";

/** A track saved in a Library playlist or liked (#107). `uri` is what plays it again. */
export const PlaylistTrackSchema = z.object({
  title: z.string(),
  artist: z.string(),
  duration: z.number().nonnegative(),
  thumbnail: z.string().nullish(),
  uri: z.string().min(1),
  album: z.string().nullish(),
  addedAt: z.string().nullish(),
});
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;

export const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  thumbnail: z.string().nullable(),
  sourcePlatform: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  tracks: z.array(PlaylistTrackSchema),
  updatedAt: z.string(),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

/** The grid: a playlist without its tracks. */
export const PlaylistSummarySchema = PlaylistSchema.omit({ tracks: true }).extend({ trackCount: z.number() });
export type PlaylistSummary = z.infer<typeof PlaylistSummarySchema>;

/** Where an imported playlist came from. */
export const ImportPlatformSchema = z.enum(["spotify", "youtube"]);
export type ImportPlatform = z.infer<typeof ImportPlatformSchema>;

/** The `library:update` playlistId that means "the likes changed". */
export const LIKED_PLAYLIST = "liked";

const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(300).nullable();

export const NewPlaylistSchema = z.object({
  name,
  description: description.optional(),
  tracks: z.array(PlaylistTrackSchema).max(5000).default([]),
  sourcePlatform: ImportPlatformSchema.nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
});
export type NewPlaylist = z.infer<typeof NewPlaylistSchema>;

/** A change: only these fields (v5's PUT took any field, including the owner). Unknown keys are dropped. */
export const PlaylistChangeSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    tracks: z.array(PlaylistTrackSchema).max(5000).optional(),
  })
  .refine((c) => c.name !== undefined || c.description !== undefined || c.tracks !== undefined, "nothing to change");
export type PlaylistChange = z.infer<typeof PlaylistChangeSchema>;

/** Spec #71: what an import preview shows before saving. */
export const ImportPreviewSchema = z.object({
  platform: ImportPlatformSchema,
  playlist: z.object({
    name: z.string(),
    thumbnail: z.string().nullable(),
    trackCount: z.number(),
    owner: z.string(),
  }),
  tracks: z.array(PlaylistTrackSchema),
});
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

/**
 * Which service a playlist link belongs to; null for anything else. Only these hosts are ever
 * loaded (v5 loaded any URL as "unknown", letting a user make the server fetch an arbitrary address).
 */
export function importPlatform(link: string): ImportPlatform | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname === "open.spotify.com" && /^\/(intl-[a-z]+\/)?(playlist|album)\//.test(url.pathname))
    return "spotify";
  const youtube = ["www.youtube.com", "youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be"];
  if (youtube.includes(url.hostname) && url.searchParams.has("list")) return "youtube";
  return null;
}

export const LikeSchema = PlaylistTrackSchema.extend({ likedAt: z.string() });
export type Like = z.infer<typeof LikeSchema>;
