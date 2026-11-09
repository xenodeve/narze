import { SOUNDCLOUD_PLAYABLE } from "@narze/shared/sources";
import { isInternalUrl } from "./url-safety";

export type ResolvedQuery =
  | { ok: true; query: string; source?: "spsearch" | "ytmsearch" }
  | { ok: false; reason: "empty" | "unsupported" | "coming-soon" };

const UNSUPPORTED = /^https?:\/\/([a-z0-9-]+\.)*(deezer\.com|music\.apple\.com)\//i;
const SOUNDCLOUD = /^https?:\/\/([a-z0-9-]+\.)*soundcloud\.com\//i;
/** A Spotify link that needs the Spotify source to load; a track link has the oEmbed fallback (spec #70). */
const SPOTIFY_COLLECTION = /^https?:\/\/open\.spotify\.com\/(intl-[a-z-]+\/)?(playlist|album|artist)\//i;

/** A YouTube Mix (radio) playlist id starts with RD; RDCLAK… is a YouTube Music album, not a Mix. */
export const isMixList = (list: string) => list.startsWith("RD") && !list.startsWith("RDCLAK");

/** Spec #65: a Mix playlist is shown as a radio station. */
export const playlistDisplayName = (name: string) => name.replace(/^Mix - /, "สถานีวิทยุ");

/**
 * Turns user input into a Lavalink query. Spotify→YouTube mirroring (ISRC, then title) happens in
 * LavaSrc on the node, so the Bot only picks the search prefix: Spotify first when the node has it
 * (spec #55), YouTube Music otherwise.
 */
export function resolveQuery(input: string, sourceManagers: readonly string[]): ResolvedQuery {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (UNSUPPORTED.test(text)) return { ok: false, reason: "unsupported" };
  // #157: sources that are not ready say so instead of "not found".
  if (!SOUNDCLOUD_PLAYABLE && SOUNDCLOUD.test(text)) return { ok: false, reason: "coming-soon" };
  if (SPOTIFY_COLLECTION.test(text) && !sourceManagers.includes("spotify")) return { ok: false, reason: "coming-soon" };
  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, reason: "unsupported" };
    }
    if (isInternalUrl(url)) return { ok: false, reason: "unsupported" };
    // Spec #3: a YouTube list= link plays as the YouTube Music playlist (everything after list= kept),
    // except a Mix (radio, list=RD…), which only loads from its own link (spec #65).
    const list = /youtu\.?be/i.test(text) ? text.split("list=").slice(1).join("list=") : "";
    if (isMixList(list)) return { ok: true, query: text };
    return { ok: true, query: list ? `https://music.youtube.com/playlist?list=${list}` : text };
  }
  return { ok: true, query: text, source: sourceManagers.includes("spotify") ? "spsearch" : "ytmsearch" };
}
