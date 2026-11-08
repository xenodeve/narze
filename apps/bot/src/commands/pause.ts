import { SlashCommandBuilder } from "discord.js";
import { formatDuration } from "../music/format";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

export const pause: Command = {
  data: new SlashCommandBuilder().setName("pause").setDescription("พัก/เล่นต่อ"),
  async run(ctx, music) {
    const refused = needSameVoice(ctx, music);
    if (refused) return refused;
    const result = await music.togglePause(ctx.guildId);
    if (!result?.track) return fail("ไม่มีเพลงที่เล่นอยู่");
    const icon = result.paused ? "`⏸️`┃" : "`▶️`┃";
    return ok(`${icon}**${result.track.title}** \` ${formatDuration(result.track.durationMs)} \``, {
      author: { name: "Go to Page", url: result.track.uri },
      footer: result.paused ? "พักการเล่น" : "เล่นต่อ",
    });
  },
};
