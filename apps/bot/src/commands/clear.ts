import { SlashCommandBuilder } from "discord.js";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

export const clear: Command = {
  data: new SlashCommandBuilder().setName("clear").setDescription("เคลียร์คิว"),
  async run(ctx, music) {
    const status = music.status(ctx.guildId);
    if (!status) return fail("ไม่มีบอทในห้อง");
    if (status.queue.length === 0) return fail("ไม่มีเพลงในคิว");
    const refused = needSameVoice(ctx, music);
    if (refused) return refused;
    const count = status.queue.length;
    // The current track keeps playing; only the upcoming queue is cleared (v5).
    if (!(await music.clear(ctx.guildId))) return fail("เกิดข้อผิดพลาดในการเคลียร์คิว");
    return ok(`> \`🧹\` | **เคลียร์คิวแล้ว** (\`${count}\` เพลง)`);
  },
};
