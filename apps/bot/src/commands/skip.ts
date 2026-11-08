import { SlashCommandBuilder } from "discord.js";
import { COLOR_FAILURE } from "../music/format";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

export const skip: Command = {
  data: new SlashCommandBuilder().setName("skip").setDescription("ข้าม"),
  async run(ctx, music) {
    const refused = needSameVoice(ctx, music, "ไม่มีเครื่องเล่น");
    if (refused) return refused;
    if (!music.status(ctx.guildId)?.playing) return fail("ไม่มีเพลงที่เล่นอยู่");
    const result = await music.skip(ctx.guildId);
    if (result?.kind === "ended") {
      return {
        notice: { color: COLOR_FAILURE, description: "`⏭️`┃ **ไม่เหลือเพลงให้ข้าม**", footer: "ข้าม • เพิ่มคิวอัตโนมัติ" },
        ephemeral: false,
      };
    }
    return ok(`\`⏭️\`┃**Skipped** โดย: <@${ctx.user.id}>`);
  },
};
