import { SlashCommandBuilder } from "discord.js";
import { COLOR_SUCCESS } from "../music/format";
import type { Command } from "./types";

export const ping: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Ping command"),
  async run(ctx) {
    const ms = (n: number) => `${Math.abs(Math.round(n))} ms`;
    return {
      notice: {
        color: COLOR_SUCCESS,
        title: "🏓 |  Ping Status",
        thumbnailUrl: "https://i.gifer.com/fyMe.gif",
        fields: [
          { name: "Reply Latency", value: ms(ctx.latencyMs.reply), inline: true },
          { name: "Bot Latency", value: ms(ctx.latencyMs.reply), inline: true },
          { name: "API Latency", value: ms(ctx.latencyMs.ws), inline: true },
        ],
      },
      ephemeral: false,
    };
  },
};
