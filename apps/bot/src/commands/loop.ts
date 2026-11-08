import { SlashCommandBuilder } from "discord.js";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

const OFF = "> `🚫` | ลูปเพลง: `ปิด`";

/** /loop off|current|queue (spec #9): choosing the active mode again turns looping off. */
export const loop: Command = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("วนซ้ำ")
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("โหมด")
        .setRequired(true)
        .addChoices(
          { name: "🚫 ปิด", value: "off" },
          { name: "🔂 เพลงปัจจุบัน", value: "current" },
          { name: "🔁 ทั้งคิว", value: "queue" },
        ),
    ),
  async run(ctx, music) {
    const status = music.status(ctx.guildId);
    if (!status) return fail("ไม่มีบอทในห้อง");
    if (!status.current && status.queue.length === 0) return fail("ไม่มีเพลงที่เล่นอยู่");
    const refused = needSameVoice(ctx, music);
    if (refused) return refused;
    const mode = String(ctx.option("mode") ?? "off");
    if (mode === "off") {
      if (status.loop === "off") return ok("> `🚫` | ลูปเพลงปิดอยู่แล้ว", {}, true);
      await music.setLoop(ctx.guildId, "off");
      return ok(OFF);
    }
    const target = mode === "current" ? "track" : "queue";
    if (status.loop === target) {
      await music.setLoop(ctx.guildId, "off");
      return ok(OFF);
    }
    await music.setLoop(ctx.guildId, target);
    return ok(target === "track" ? "> `🔂` | ลูปเพลง: `ปัจจุบัน`" : "> `🔁` | ลูปเพลง: `คิวทั้งหมด`");
  },
};
