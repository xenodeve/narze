import { SlashCommandBuilder } from "discord.js";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

export const leave: Command = {
  data: new SlashCommandBuilder().setName("leave").setDescription("ออกห้องเสียง"),
  async run(ctx, music) {
    const refused = needSameVoice(ctx, music, "**ไม่มีบอทในห้อง**");
    if (refused) return refused;
    const channel = music.status(ctx.guildId)?.voiceChannelId;
    if (!(await music.leave(ctx.guildId))) return fail("เกิดข้อผิดพลาดในการออกจากห้องเสียง");
    return ok(`> \`🔊\`| **ออกจากห้อง** <#${channel}>`);
  },
};
