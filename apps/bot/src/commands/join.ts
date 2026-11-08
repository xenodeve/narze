import { SlashCommandBuilder } from "discord.js";
import { fail, ok } from "./replies";
import type { Command } from "./types";

export const join: Command = {
  data: new SlashCommandBuilder().setName("join").setDescription("เข้าห้องเสียง"),
  async run(ctx, music) {
    const voice = ctx.memberVoiceChannelId;
    if (!voice) return fail("กรุณาเข้าห้องเสียงด้วย");
    if (!ctx.canSpeakIn(voice)) return fail(`บอทไม่มีอำนาจเข้าห้อง <#${voice}>`);
    const result = await music.join({ guildId: ctx.guildId, voiceChannelId: voice, textChannelId: ctx.channelId });
    if (result === "already") return ok(`> \`🔊\` | เข้าห้อง <#${voice}> อยู่แล้ว`, {}, true);
    return ok(result === "moved" ? `> \`🔊\` | ย้ายไปห้อง <#${voice}>` : `> \`🔊\` | เข้าห้อง <#${voice}>`);
  },
};
