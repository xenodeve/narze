import { SlashCommandBuilder } from "discord.js";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

export const volume: Command = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("ปรับความดัง")
    .addIntegerOption((o) => o.setName("amount").setDescription("ความดัง (%)").setMinValue(1).setMaxValue(1000)),
  async run(ctx, music) {
    const refused = needSameVoice(ctx, music);
    if (refused) return refused;
    const status = music.status(ctx.guildId);
    if (!status?.playing) return fail("ไม่มีเพลงที่เล่นอยู่");
    const amount = ctx.option("amount");
    if (typeof amount === "number") await music.setVolume(ctx.guildId, amount);
    return ok(`> \`📢\`┃**เสียง:** \`${typeof amount === "number" ? amount : status.volume}%\``);
  },
};
