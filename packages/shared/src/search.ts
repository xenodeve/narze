import { z } from "zod";

/** Spec #57: the four catalog search modes; `spotify-api` is the Dashboard's default. */
export const SearchSourceSchema = z.enum(["spotify", "spotify-api", "youtube", "youtubemusic"]);
export type SearchSource = z.infer<typeof SearchSourceSchema>;

export const SearchTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  artistId: z.string().optional(),
  album: z.string().optional(),
  albumId: z.string().optional(),
  duration: z.number().nonnegative(),
  thumbnail: z.string().nullish(),
  uri: z.string(),
  spotifyUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
  /** Spec #85: a YouTube upload that is a video, not music (VIDEO chip). */
  isVideo: z.boolean().optional(),
});
export type SearchTrack = z.infer<typeof SearchTrackSchema>;

export const SearchArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullish(),
  followers: z.number().optional(),
  genres: z.array(z.string()).optional(),
  spotifyUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
});
export type SearchArtist = z.infer<typeof SearchArtistSchema>;

export const SearchAlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  artistName: z.string(),
  artistId: z.string().optional(),
  imageUrl: z.string().nullish(),
  releaseDate: z.string().optional(),
  trackCount: z.number().optional(),
  spotifyUrl: z.string().optional(),
});
export type SearchAlbum = z.infer<typeof SearchAlbumSchema>;

export const TopResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("track"), data: SearchTrackSchema, score: z.number() }),
  z.object({ type: z.literal("artist"), data: SearchArtistSchema, score: z.number() }),
  z.object({ type: z.literal("album"), data: SearchAlbumSchema, score: z.number() }),
]);
export type TopResult = z.infer<typeof TopResultSchema>;

/** Spec #58: what every search mode answers. */
export const SearchResponseSchema = z.object({
  query: z.string(),
  source: SearchSourceSchema,
  topResult: TopResultSchema.nullable(),
  tracks: z.array(SearchTrackSchema),
  artists: z.array(SearchArtistSchema),
  albums: z.array(SearchAlbumSchema),
  fromCache: z.boolean(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/** Dice's coefficient on character bigrams, spaces ignored — what v5's `string-similarity` computed. */
export function diceSimilarity(a: string, b: string): number {
  const left = a.replace(/\s+/g, "");
  const right = b.replace(/\s+/g, "");
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i++) {
    const pair = left.slice(i, i + 2);
    bigrams.set(pair, (bigrams.get(pair) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < right.length - 1; i++) {
    const pair = right.slice(i, i + 2);
    const count = bigrams.get(pair) ?? 0;
    if (count > 0) {
      bigrams.set(pair, count - 1);
      shared += 1;
    }
  }
  return (2 * shared) / (left.length + right.length - 2);
}

const PRIORITY = { track: 10, artist: 2, album: 1 } as const;
const MINIMUM = { track: 0.2, artist: 0.6, album: 0.2 } as const;

type Candidate = { name: string } & (
  | { type: "track"; data: SearchTrack }
  | { type: "artist"; data: SearchArtist }
  | { type: "album"; data: SearchAlbum }
);

/**
 * Spec #58 / v5 §7.2: an exact (case- and space-insensitive) match scores 1.1 and the type priority
 * track > artist > album picks among exact matches. Otherwise the best Dice candidates within 0.1
 * are ranked by type; below its minimum (artist 0.6, others 0.2) the first track wins with score 0.
 */
export function topResult(
  query: string,
  found: { tracks: SearchTrack[]; artists: SearchArtist[]; albums: SearchAlbum[] },
): TopResult | null {
  const wanted = query.trim().toLowerCase();
  const candidates: Candidate[] = [
    ...found.tracks.flatMap((data) => [
      { type: "track" as const, data, name: data.title },
      { type: "track" as const, data, name: `${data.title} ${data.artist}` },
    ]),
    ...found.artists.map((data) => ({ type: "artist" as const, data, name: data.name })),
    ...found.albums.map((data) => ({ type: "album" as const, data, name: data.name })),
  ];
  const byPriority = (a: Candidate, b: Candidate) => PRIORITY[b.type] - PRIORITY[a.type];
  const result = (c: Candidate, score: number) => ({ type: c.type, data: c.data, score }) as TopResult;

  const exact = candidates.filter((c) => c.name.trim().toLowerCase() === wanted).sort(byPriority)[0];
  if (exact) return result(exact, 1.1);

  const rated = candidates.map((c) => ({ c, rating: diceSimilarity(wanted, c.name.toLowerCase()) }));
  const best = Math.max(0, ...rated.map((r) => r.rating));
  const winner = rated.filter((r) => r.rating >= best - 0.1).sort((a, b) => byPriority(a.c, b.c))[0];
  if (winner && winner.rating >= MINIMUM[winner.c.type]) return result(winner.c, winner.rating);
  const first = found.tracks[0];
  return first ? { type: "track", data: first, score: 0 } : null;
}
