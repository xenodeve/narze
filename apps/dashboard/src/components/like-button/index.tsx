"use client";

import type { PlaylistTrack, Track } from "@narze/shared";
import dynamic from "next/dynamic";
import { toggleLike, useLikes } from "@/lib/library";

// The supplied PulseHeart (DESIGN.md): like a track; liked tracks form the Liked playlist.
const PulseHeart = dynamic(() => import("@/components/vendor/pulse-heart/PulseHeart"), { ssr: false });

/** A playing or queued track, as the Library stores it. */
export const libraryTrack = (t: Track): PlaylistTrack => ({
  title: t.title,
  artist: t.author,
  duration: t.durationMs,
  thumbnail: t.artworkUrl,
  uri: t.uri,
});

/** A like toggle for one track, on Now Playing, the queue, search and the Library (#107). */
export function LikeButton({ track, size = 32 }: { track: PlaylistTrack; size?: number }) {
  const likes = useLikes();
  const liked = likes?.some((l) => l.uri === track.uri) ?? false;
  return (
    <PulseHeart
      liked={liked}
      onChange={(on: boolean) => void toggleLike(track, on)}
      showCount={false}
      size={size}
      label={`ถูกใจ ${track.title}`}
      disabled={likes === null}
      likedColor="var(--danger)"
      idleColor="var(--ink-3)"
      pillColor="transparent"
      textColor="var(--ink)"
    />
  );
}
