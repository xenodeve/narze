import { isInternalUrl } from "./url-safety";

export type ResolvedQuery =
  | { ok: true; query: string; source?: "spsearch" | "ytmsearch" }
  | { ok: false; reason: "empty" | "unsupported" };

const UNSUPPORTED = /^https?:\/\/([a-z0-9-]+\.)*(deezer\.com|music\.apple\.com)\//i;

/**
 * Turns user input into a Lavalink query. Spotify→YouTube mirroring (ISRC, then title) happens in
 * LavaSrc on the node, so the Bot only picks the search prefix: Spotify first when the node has it
 * (spec #55), YouTube Music otherwise.
 */
export function resolveQuery(input: string, sourceManagers: readonly string[]): ResolvedQuery {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (UNSUPPORTED.test(text)) return { ok: false, reason: "unsupported" };
  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, reason: "unsupported" };
    }
    if (isInternalUrl(url)) return { ok: false, reason: "unsupported" };
    // Spec #3: a YouTube list= link plays as the YouTube Music playlist (everything after list= kept).
    const list = /youtu\.?be/i.test(text) ? text.split("list=").slice(1).join("list=") : "";
    return { ok: true, query: list ? `https://music.youtube.com/playlist?list=${list}` : text };
  }
  return { ok: true, query: text, source: sourceManagers.includes("spotify") ? "spsearch" : "ytmsearch" };
}
