/** Spec #73: a token is used until 5 minutes before Spotify says it expires. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

/**
 * The Spotify Web API with the client-credentials flow, shared by the Bot (artist and playlist
 * images) and the Backend (catalog search). Credentials come only from the environment; without
 * them `get` answers null and callers fall back.
 */
export function createSpotifyApi({
  clientId,
  clientSecret,
  fetch = globalThis.fetch,
  now = Date.now,
  apiUrl = "https://api.spotify.com/v1",
  accountsUrl = "https://accounts.spotify.com",
}: {
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  /** Overridable for end-to-end tests against a fake Spotify; production uses the defaults. */
  apiUrl?: string;
  accountsUrl?: string;
} = {}) {
  let token: { value: string; until: number } | null = null;
  let pending: Promise<string | null> | null = null;

  async function fetchToken(): Promise<string | null> {
    const res = await fetch(`${accountsUrl}/api/token`, {
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

  async function accessToken(): Promise<string | null> {
    if (!clientId || !clientSecret) return null;
    if (token && now() < token.until) return token.value;
    // Concurrent callers share one refresh.
    pending ??= fetchToken().finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    configured: Boolean(clientId && clientSecret),
    /** GET a Web API path or URL; null when unconfigured or anything fails. */
    async get<T>(pathOrUrl: string): Promise<T | null> {
      const bearer = await accessToken();
      if (!bearer) return null;
      const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${apiUrl}${pathOrUrl}`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
    },
  };
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>;

/** A Web API image list's largest picture. */
export const largestImage = (images: Array<{ url: string; width?: number | null }> | undefined): string | null =>
  [...(images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
