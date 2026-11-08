import { SlashCommandBuilder } from "discord.js";
import { placedPlay } from "./placed-play";
import type { Command } from "./types";

export const play: Command = {
  slow: true,
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("เล่น | เพิ่มคิว")
    .addStringOption((o) => o.setName("query").setDescription("ชื่อเพลง | ลิ้งก์").setRequired(true)),
  run: (ctx, music) => placedPlay(ctx, music),
};
