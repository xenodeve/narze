import { SlashCommandBuilder } from "discord.js";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

/** /247 (spec #10): keeps the Bot in voice as an Idle Player when the queue ends. */
export const twentyFourSeven: Command = {
  data: new SlashCommandBuilder().setName("247").setDescription("Toggle 24/7 mode - keeps bot online in voice channel"),
  async run(ctx, music) {
    const refused = needSameVoice(ctx, music);
    if (refused) return refused;
    const on = await music.setTwentyFourSeven(ctx.guildId);
    if (on === null) return fail("เกิดข้อผิดพลาดในการเปลี่ยนโหมด 24/7");
    return ok(on ? "> `🌕` | *โหมด 24/7 :* ` เปิดการใช้งาน `" : "> `🌙` | *โหมด 24/7 :* ` ปิดการใช้งาน `");
  },
};
