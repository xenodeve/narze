"use client";

import {
  type AlbumPage,
  AlbumPageSchema,
  type ArtistPage,
  ArtistPageSchema,
  type ChannelPage,
  ChannelPageSchema,
  type PlayPermission,
  PlayPermissionListSchema,
  type SearchResponse,
  SearchResponseSchema,
  type SearchSource,
  type SearchTrack,
  type Sources,
  SourcesSchema,
} from "@narze/shared";
import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { BACKEND_URL } from "./config";

// #157: which sources can play is fixed while the Backend runs; one read per page load.
let sourcesLoad: Promise<Sources | null> | null = null;
const loadSources = (): Promise<Sources | null> => {
  if (sourcesLoad) return sourcesLoad;
  const load = fetch(`${BACKEND_URL}/api/sources`)
    .then(async (res) => (res.ok ? SourcesSchema.parse(await res.json()) : null))
    .catch(() => null);
  sourcesLoad = load;
  // A failed read is not remembered: the next page or component asks again.
  void load.then((s) => {
    if (!s && sourcesLoad === load) sourcesLoad = null;
  });
  return load;
};

/** Which sources can play; null until known (and if the Backend did not say). */
export function useSources(): Sources | null {
  const [sources, setSources] = useState<Sources | null>(null);
  useEffect(() => {
    let live = true;
    void loadSources().then((s) => live && setSources(s));
    return () => {
      live = false;
    };
  }, []);
  return sources;
}

export const isSpotifyLink = (text: string) => /^https?:\/\/open\.spotify\.com\//i.test(text.trim());
/** A Spotify link that needs Spotify to load; a track link plays by its title (spec #70). */
export const isSpotifyCollectionLink = (text: string) =>
  /^https?:\/\/open\.spotify\.com\/(intl-[a-z-]+\/)?(playlist|album|artist)\//i.test(text.trim());
export const isSoundCloudLink = (text: string) => /^https?:\/\/([a-z0-9-]+\.)*soundcloud\.com\//i.test(text.trim());

/** Catalog search over the Backend (#105); null when the request failed. */
export async function searchCatalog(
  q: string,
  source: SearchSource,
  signal?: AbortSignal,
): Promise<SearchResponse | null> {
  const res = await apiGet(`/api/search?q=${encodeURIComponent(q)}&source=${source}`, signal).catch(() => null);
  if (!res?.ok) return null;
  const parsed = SearchResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** One catalog page; "missing" for a 404, null for any other failure. */
const PAGE_SCHEMAS = { artist: ArtistPageSchema, album: AlbumPageSchema, channel: ChannelPageSchema } as const;
type Pages = { artist: ArtistPage; album: AlbumPage; channel: ChannelPage };

/** One catalog page, checked against the shared contract; "missing" for a 404, null otherwise. */
export async function catalogPage<K extends keyof Pages>(kind: K, id: string): Promise<Pages[K] | "missing" | null> {
  const res = await apiGet(`/api/catalog/${kind}/${encodeURIComponent(id)}`).catch(() => null);
  if (res?.status === 404) return "missing";
  if (!res?.ok) return null;
  const parsed = PAGE_SCHEMAS[kind].safeParse(await res.json().catch(() => null));
  return parsed.success ? (parsed.data as Pages[K]) : null;
}

/** Spec #91: where the user may start playback, and why not elsewhere. */
export async function playPermissions(): Promise<PlayPermission[] | null> {
  const res = await apiGet("/api/me/play-permissions").catch(() => null);
  if (!res?.ok) return null;
  const parsed = PlayPermissionListSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** Spec #85: which service a track comes from, for its badge. */
export function sourceBadge(track: SearchTrack): "Spotify" | "YT Music" | "YouTube" | "Audio" {
  if (track.uri.includes("spotify.com")) return "Spotify";
  if (track.uri.includes("music.youtube.com")) return "YT Music";
  if (/youtu\.?be/.test(track.uri)) return "YouTube";
  return "Audio";
}

export type { AlbumPage, ArtistPage, ChannelPage };
