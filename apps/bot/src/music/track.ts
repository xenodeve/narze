import { type Track, TrackSchema } from "@narze/shared";
import type { Track as LavalinkTrack } from "lavalink-client";

const sourceOf = (sourceName: string, uri: string): Track["source"] => {
  if (sourceName === "spotify") return "spotify";
  if (sourceName === "soundcloud") return "soundcloud";
  if (sourceName === "youtube") return uri.includes("music.youtube.com") ? "youtubemusic" : "youtube";
  return "http";
};

const resolvedArt = (track: LavalinkTrack): string | null | undefined => {
  const data = track.userData as Record<string, unknown> | undefined;
  return data && "artworkUrl" in data ? (data.artworkUrl as string | null) : undefined;
};

/**
 * A Lavalink track as a Player State track, or null when it has no playback identity (uri, source,
 * requester) — such a track must never be published (Invalid Player State).
 */
export function toTrack(track: LavalinkTrack): Track | null {
  const info = track.info ?? {};
  // Spec #3: YouTube links are shown as YouTube Music.
  const uri = (info.uri ?? "").replace("www.youtube.com", "music.youtube.com");
  const candidate = {
    uri,
    source: sourceOf(info.sourceName ?? "", uri),
    title: info.title ?? "",
    author: info.author ?? "",
    durationMs: Math.max(0, Math.round(info.duration ?? 0)),
    // A picture resolved by Track Resolution wins over Lavalink's (spec #62/#63).
    artworkUrl: resolvedArt(track) === undefined ? (info.artworkUrl ?? null) : (resolvedArt(track) ?? null),
    requester: track.requester,
    playlist: (track.userData as { playlist?: unknown } | undefined)?.playlist,
  };
  const parsed = TrackSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
