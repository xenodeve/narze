import type { Track } from "@narze/shared";
import type { Track as LavalinkTrack } from "lavalink-client";
import { DEFAULT_ICON } from "./format";
import type { Spotify } from "./spotify";
import { classify, type Head, playlistThumbnail, thumbnailFor, upgrade } from "./thumbnails";
import type { YouTube } from "./youtube";

/** Spec #67: what the embed author icon shows. */
export const ICON_TYPES = ["botavatar", "userimage", "playlist_thumbnail", "artistImage"] as const;
export type IconType = (typeof ICON_TYPES)[number];
export interface IconModes {
  normalTrack: IconType;
  playlistDisplay: IconType;
  playlistTrack: IconType;
}

const iconType = (value: string | undefined, fallback: IconType): IconType =>
  (ICON_TYPES as readonly string[]).includes(value ?? "") ? (value as IconType) : fallback;

/** Icon modes from the environment, with v5's config as the defaults (spec #67). */
export function iconModesFrom(env: Record<string, string | undefined>): IconModes {
  return {
    normalTrack: iconType(env.ICON_NORMAL_TRACK, "artistImage"),
    playlistDisplay: iconType(env.ICON_PLAYLIST_DISPLAY, "botavatar"),
    playlistTrack: iconType(env.ICON_PLAYLIST_TRACK, "artistImage"),
  };
}

/** A HEAD over fetch, for the image checks of spec #63. */
export const fetchHead: Head = async (url) => {
  const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(4000) });
  return {
    ok: res.ok,
    contentType: res.headers.get("content-type") ?? "",
    contentLength: Number(res.headers.get("content-length") ?? 0),
  };
};

/**
 * Pictures for tracks, playlists and the embed author icon (Track Resolution, spec #62–#67).
 * Every lookup is optional: without YouTube/Spotify credentials or a reachable image the next
 * fallback is used, and nothing here can stop a track from playing.
 */
export function createArtwork({
  head = fetchHead,
  youtube,
  spotify,
  modes = iconModesFrom({}),
  botIcon = DEFAULT_ICON,
}: {
  head?: Head;
  youtube?: Partial<Pick<YouTube, "videoFacts" | "pageImage">>;
  spotify?: Partial<Pick<Spotify, "artistImage" | "playlistImage">>;
  modes?: IconModes;
  /** The Bot's avatar; a getter, since it is known only once the Bot has logged in. */
  botIcon?: string | (() => string | null);
} = {}) {
  const bot = () => (typeof botIcon === "function" ? botIcon() : botIcon) ?? DEFAULT_ICON;
  return {
    /** Spec #62/#63: a YouTube track's thumbnail by music vs video; any other kept if it checks out. */
    async trackArt(track: LavalinkTrack): Promise<string | null> {
      const info = track.info;
      const uri = info.uri ?? "";
      if (info.sourceName === "youtube" && info.identifier) {
        const facts = await youtube?.videoFacts?.(info.identifier).catch(() => null);
        const { isMusicContent } = classify({
          sourceName: "youtube",
          uri,
          author: info.author ?? "",
          categoryId: facts?.categoryId,
          topics: facts?.topics,
          description: facts?.description,
        });
        return upgrade(thumbnailFor(info.identifier, isMusicContent), head);
      }
      return upgrade(info.artworkUrl ?? null, head);
    },

    /** Spec #64: the playlist's own picture (Spotify image, YouTube page image), then the first track's. */
    playlistArt(url: string, firstTrack: string | null): Promise<string | null> {
      const own = async () =>
        (await spotify?.playlistImage?.(url).catch(() => null)) ??
        (await youtube?.pageImage?.(url).catch(() => null)) ??
        null;
      return playlistThumbnail(own, firstTrack, head);
    },

    /**
     * Spec #67: the author icon by mode — a playlist display, a track from a playlist, or a plain
     * track — falling back to the requester's avatar, then the Bot's, then Discord's default.
     */
    async icon(track: Track | null, playlistPicture: string | null = null, display = false): Promise<string> {
      const fallback = track?.requester.avatarUrl ?? bot();
      const mode = display ? modes.playlistDisplay : track?.playlist ? modes.playlistTrack : modes.normalTrack;
      if (mode === "botavatar") return bot();
      if (mode === "userimage") return fallback;
      if (mode === "playlist_thumbnail") return (track?.playlist || display ? playlistPicture : null) ?? fallback;
      const artist = track ? await spotify?.artistImage?.(track.author).catch(() => null) : null;
      return artist ?? fallback;
    },
  };
}

export type Artwork = ReturnType<typeof createArtwork>;
