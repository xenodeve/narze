"use client";

import {
  type PlayPermission,
  PlayPermissionListSchema,
  type SearchAlbum,
  type SearchArtist,
  type SearchResponse,
  SearchResponseSchema,
  type SearchSource,
  type SearchTrack,
} from "@narze/shared";
import { apiGet } from "./api";

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

export interface ArtistPage {
  artist: SearchArtist;
  topTracks: SearchTrack[];
  albums: SearchAlbum[];
}
export interface AlbumPage {
  album: SearchAlbum;
  tracks: SearchTrack[];
}
export interface ChannelPage {
  channel: { id: string; name: string; imageUrl: string | null; subscribers?: number; description: string };
  tracks: SearchTrack[];
}

/** One catalog page; "missing" for a 404, null for any other failure. */
export async function catalogPage<T>(kind: "artist" | "album" | "channel", id: string): Promise<T | "missing" | null> {
  const res = await apiGet(`/api/catalog/${kind}/${encodeURIComponent(id)}`).catch(() => null);
  if (res?.status === 404) return "missing";
  return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
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
