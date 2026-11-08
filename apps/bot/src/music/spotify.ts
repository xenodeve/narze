import { createSpotifyApi, largestImage } from "@narze/shared/spotify-api";
import { createTtlCache, WEEK_MS } from "@narze/shared/ttl-cache";

type Image = { url: string; width?: number | null };

/**
 * The Bot's Spotify lookups (spec #64, #67) over the shared Web API client. Without credentials
 * every lookup answers null and the caller falls back.
 */
export function createSpotify({
  clientId,
  clientSecret,
  fetch = globalThis.fetch,
  now = Date.now,
}: {
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
} = {}) {
  const api = createSpotifyApi({ clientId, clientSecret, fetch, now });
  const artists = createTtlCache<string, string | null>({ ttlMs: WEEK_MS, max: 2000, now });

  return {
    cacheStats: () => artists.stats(),
    /** Spec #67: the image of the artist found by the track's author, cached for 7 days. */
    async artistImage(name: string): Promise<string | null> {
      const key = name.trim().toLowerCase();
      if (!key || !api.configured) return null;
      const cached = artists.get(key);
      if (cached !== undefined) return cached;
      const body = await api.get<{ artists?: { items?: Array<{ images?: Image[] }> } }>(
        `/search?type=artist&limit=1&q=${encodeURIComponent(name)}`,
      );
      if (!body) return null;
      const found = largestImage(body.artists?.items?.[0]?.images);
      artists.set(key, found);
      return found;
    },

    /** Spec #64: a Spotify playlist's largest image; any other URL answers null. */
    async playlistImage(playlistUrl: string): Promise<string | null> {
      const id = /^https:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/.exec(playlistUrl)?.[1];
      if (!id) return null;
      const body = await api.get<{ images?: Image[] }>(`/playlists/${id}?fields=images`);
      return largestImage(body?.images);
    },
  };
}

export type Spotify = ReturnType<typeof createSpotify>;
