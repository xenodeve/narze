import type { LavalinkLoad } from "./search-service";

/**
 * Lavalink's REST `GET /v4/loadtracks` for catalog search (ADR-0009). Read-only and sessionless:
 * the Bot alone owns Players. Without a configured node every search simply finds no tracks.
 */
export function createLavalinkRest({
  url,
  password,
  fetch = globalThis.fetch,
}: {
  url?: string;
  password?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return async (identifier: string): Promise<LavalinkLoad> => {
    if (!url || !password) return { loadType: "empty", data: {} };
    const endpoint = new URL("/v4/loadtracks", url);
    endpoint.searchParams.set("identifier", identifier);
    const res = await fetch(endpoint, { headers: { authorization: password }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Lavalink loadtracks ${res.status}`);
    return (await res.json()) as LavalinkLoad;
  };
}
