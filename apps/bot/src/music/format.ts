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
