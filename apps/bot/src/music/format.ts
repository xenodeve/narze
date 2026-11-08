/** Embed colours and icons from v5 (spec #14). */
export const COLOR_SUCCESS = 0xe4854a;
export const COLOR_FAILURE = 0xff0000;
export const DEFAULT_ICON = "https://cdn.discordapp.com/embed/avatars/0.png";

/** A Discord embed, independent of discord.js so handlers stay testable. */
export interface Notice {
  color: number;
  author?: { name: string; url?: string; iconUrl?: string };
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  footer?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** v5's convertTime: MM:SS under an hour, else HH:MM:SS with hours wrapping at 24. */
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return ms < 3_600_000 ? `${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const MARKDOWN = /[\\*_~`|[\]()<>]/g;
/** Text from a track source, shown literally in Discord markdown. */
export const escapeText = (text: string) => text.replace(MARKDOWN, "\\$&");

/**
 * `[title](uri)` for an embed description. Titles and uris come from the track source, so the
 * title is escaped (no breaking out of the link, no formatting) and the uri cannot close it early.
 */
export function trackLink(track: { title: string; uri: string }, maxTitle = 100): string {
  const chars = Array.from(track.title);
  const title = chars.length > maxTitle ? `${chars.slice(0, maxTitle - 1).join("")}…` : track.title;
  const uri = track.uri.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `[${escapeText(title)}](${uri})`;
}
