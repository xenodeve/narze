import { SlashCommandBuilder } from "discord.js";
import { formatDuration } from "../music/format";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

/** "30", "2:30" or "1:20:15" to milliseconds; minutes and seconds must be under 60. */
export function parseTime(input: string): number | null {
  const text = input.trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  const match = text.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (!match) return null;
  const [hours, minutes, seconds] = [Number(match[1] ?? 0), Number(match[2]), Number(match[3])];
  if (minutes >= 60 || seconds >= 60) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

const FORMAT_HELP = "รูปแบบเวลาไม่ถูกต้อง\n> ใช้: `30` (วินาที) หรือ `2:30` (นาที:วินาที) หรือ `1:20:15` (ชั่วโมง:นาที:วินาที)";

export const seek: Command = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("ข้ามไปยังเวลาที่ระบุ")
    .addStringOption((o) =>
      o.setName("time").setDescription("ระบุเวลาที่ต้องการไป (30 หรือ 2:30 หรือ 1:20:15)").setRequired(true),
    ),
  async run(ctx, music) {
    const raw = ctx.option("time");
    if (raw === null || String(raw).trim() === "") return fail("กรุณาระบุเวลา");
    const target = parseTime(String(raw));
    if (target === null) return fail(FORMAT_HELP);
    const status = music.status(ctx.guildId);
    if (!status) return fail("ไม่มีบอทในห้อง");
    if (!status.playing || !status.current) return fail("ไม่มีการเล่นเพลงอยู่");
    const refused = needSameVoice(ctx, music);
    if (refused) return refused;
    const length = status.current.durationMs;
    if (target / 1000 > Math.floor(length / 1000)) {
      return fail(`เวลาที่ระบุเกินความยาวของเพลง (${formatDuration(length)})`);
    }
    if (!(await music.seek(ctx.guildId, target))) return fail("ไม่สามารถข้ามไปยังเวลาที่ระบุได้");
    return ok(`> \`⏭️\`┃ข้ามไป: \` ${formatDuration(target)} \``);
  },
};
