/** A guild as the console sees it: plain data, so lookups are tested without Discord (#112). */
export interface ConsoleGuild {
  id: string;
  name: string;
  channels: ConsoleChannel[];
}
export interface ConsoleChannel {
  id: string;
  name: string;
  kind: "voice" | "text";
  /** Text channels: the Bot may post there. */
  canSend: boolean;
  /** Voice channels: people in it now. */
  members?: number;
}

type Found<T> = T | { error: string };

/**
 * An ID, an exact name (any case), or the single name containing the words. Several matches are an
 * error naming them: v5 took the first, which could play into the wrong server.
 */
function pick<T extends { id: string; name: string }>(items: T[], arg: string, label: string, where = ""): Found<T> {
  const byId = items.find((i) => i.id === arg);
  if (byId) return byId;
  const words = arg.toLowerCase();
  const exact = items.filter((i) => i.name.toLowerCase() === words);
  if (exact.length === 1) return exact[0] as T;
  const containing = items.filter((i) => i.name.toLowerCase().includes(words));
  if (containing.length === 1) return containing[0] as T;
  if (containing.length > 1)
    return { error: `หลาย${label}ตรงกับ "${arg}": ${containing.map((i) => i.name).join(", ")}` };
  return { error: `ไม่พบ${label} "${arg}"${where}` };
}

export const findGuild = (guilds: ConsoleGuild[], arg: string) => pick(guilds, arg, "เซิร์ฟเวอร์");

export const findVoice = (guild: ConsoleGuild, arg: string) =>
  pick(
    guild.channels.filter((c) => c.kind === "voice"),
    arg,
    "ห้องเสียง",
    ` ใน ${guild.name}`,
  );

/** Any text channel by ID or name, whether or not the Bot can post there (`find text`). */
export const findTextChannel = (guild: ConsoleGuild, arg: string) =>
  pick(
    guild.channels.filter((c) => c.kind === "text"),
    arg,
    "ช่องข้อความ",
    ` ใน ${guild.name}`,
  );

/** A named text channel the Bot can post in, or the first such channel when none is named. */
export function findText(guild: ConsoleGuild, arg: string | null): Found<ConsoleChannel> {
  if (arg === null) {
    const first = guild.channels.find((c) => c.kind === "text" && c.canSend);
    return first ?? { error: `ไม่มีช่องข้อความที่บอทส่งได้ใน ${guild.name}` };
  }
  const found = findTextChannel(guild, arg);
  if ("error" in found) return found;
  return found.canSend ? found : { error: `บอทส่งข้อความในช่อง "${found.name}" ไม่ได้` };
}
