/** Text helpers shared by the Dashboard's pages (#111). */

/** A name's first letter; a Thai leading vowel (เ แ โ ใ ไ) is not a letter on its own. */
export const initial = (name: string) => Array.from(name.replace(/^[เแโใไ]/, ""))[0] ?? "?";

// One formatter each, built once: toLocaleString with options builds a new one on every call.
const day = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" });
const dayTime = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
/** AC4 (#111): Thai dates, Buddhist year. */
export const thaiDate = (ms: number) => day.format(ms);
export const thaiDateTime = (ms: number) => dayTime.format(ms);

export const kb = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
