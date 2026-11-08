import { createTtlCache, WEEK_MS } from "@narze/shared/ttl-cache";

/** Spec #73: a token is used until 5 minutes before Spotify says it expires. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

type Image = { url: string; width?: number | null };
const largest = (images: Image[] | undefined): string | null =>
  [...(images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;

/**
 * Spotify Web API lookups with the client-credentials flow. Credentials come only from the
 * environment (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`); without them every lookup answers
 * null and the caller falls back (spec #67).
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
  let token: { value: string; until: number } | null = null;
  const artists = createTtlCache<string, string | null>({ ttlMs: WEEK_MS, max: 2000, now });

  async function accessToken(): Promise<string | null> {
    if (!clientId || !clientSecret) return null;
    if (token && now() < token.until) return token.value;
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (!res?.ok) return null;
    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
    if (!body?.access_token) return null;
    token = { value: body.access_token, until: now() + (body.expires_in ?? 3600) * 1000 - TOKEN_MARGIN_MS };
    return token.value;
  }

  async function get<T>(url: string): Promise<T | null> {
    const bearer = await accessToken();
    if (!bearer) return null;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
  }

  return {
    /** Spec #67: the image of the artist found by the track's author, cached for 7 days. */
    async artistImage(name: string): Promise<string | null> {
      const key = name.trim().toLowerCase();
      if (!key || !clientId || !clientSecret) return null;
      const cached = artists.get(key);
      if (cached !== undefined) return cached;
      const url = `https://api.spotify.com/v1/search?type=artist&limit=1&q=${encodeURIComponent(name)}`;
      const body = await get<{ artists?: { items?: Array<{ images?: Image[] }> } }>(url);
      if (!body) return null;
      const found = largest(body.artists?.items?.[0]?.images);
      artists.set(key, found);
      return found;
    },

    /** Spec #64: a Spotify playlist's largest image; any other URL answers null. */
    async playlistImage(playlistUrl: string): Promise<string | null> {
      const id = /^https:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/.exec(playlistUrl)?.[1];
      if (!id) return null;
      const body = await get<{ images?: Image[] }>(`https://api.spotify.com/v1/playlists/${id}?fields=images`);
      return largest(body?.images);
    },
  };
}

export type Spotify = ReturnType<typeof createSpotify>;
