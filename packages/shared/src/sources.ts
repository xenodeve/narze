import { z } from "zod";

/**
 * Which sources can play right now (#157), as the Backend reports them to the Dashboard. A source
 * that is off is shown as coming soon, never as a search that finds nothing.
 */
export const SourcesSchema = z.object({
  /** Spotify search, albums, artists and playlist import: on when the Spotify credentials are set. */
  spotify: z.boolean(),
  /** SoundCloud links: off until lavaplayer plays SoundCloud's HLS streams (#156). */
  soundcloud: z.boolean(),
});
export type Sources = z.infer<typeof SourcesSchema>;

/**
 * SoundCloud now streams only HLS/AAC, which lavaplayer cannot play yet (lavaplayer #204, #156).
 * Turn this on with the Lavalink release that fixes it.
 */
export const SOUNDCLOUD_PLAYABLE = false;
