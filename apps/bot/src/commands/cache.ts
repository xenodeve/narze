import { SlashCommandBuilder } from "discord.js";
import { ok } from "./replies";
import type { Command } from "./types";

const kb = (bytes: number) => (bytes / 1024).toFixed(2);

/**
 * /cache (spec #2, #69): the autocomplete cache's size, or empty it. Private replies; like v5, any
 * member may clear it. Entries replace v5's files: the cache lives in memory (#104 inventory).
 */
export const cache: Command = {
  data: new SlashCommandBuilder()
    .setName("cache")
    .setDescription("จัดการ cache ของ autocomplete")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("การทำงาน")
        .setRequired(true)
        .addChoices({ name: "stats - ดูสถิติ cache", value: "stats" }, { name: "clear - ลบ cache ทั้งหมด", value: "clear" }),
    ),
  async run(ctx, music) {
    const stats = music.suggestionStats();
    if (ctx.option("action") === "clear") {
      music.clearSuggestions();
      console.log(`[CACHE] Cache cleared by ${ctx.user.name}`);
      return ok(
        `✅ ลบ cache ทั้งหมดแล้ว

📊 **ก่อนลบ:**
• รายการ: \`${stats.entries}\`
• ขนาด: \`${kb(stats.bytes)} KB\``,
        { title: "🗑️ Cache Cleared" },
        true,
      );
    }
    return ok(
      "",
      {
        title: "📊 Cache Statistics",
        footer: "Cache จะหมดอายุภายใน 30 นาที",
        fields: [
          { name: "📁 จำนวนรายการ cache", value: `\`${stats.entries}\` รายการ`, inline: true },
          { name: "💾 ขนาดรวม", value: `\`${kb(stats.bytes)}\` KB`, inline: true },
          {
            name: "📅 รายการเก่าสุด",
            value: stats.oldestAt ? `<t:${Math.floor(stats.oldestAt / 1000)}:R>` : "ไม่มี",
            inline: true,
          },
        ],
      },
      true,
    );
  },
};
