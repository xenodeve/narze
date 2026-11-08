import { SlashCommandBuilder } from "discord.js";
import { formatDuration } from "../music/format";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

/** /playqueue: pick a queued track to play now; the rest keep their order (spec #7). */
export const playqueue: Command = {
  data: new SlashCommandBuilder()
    .setName("playqueue")
    .setDescription("เลือกเพลงจากคิวมาเล่นทันที")
    .addStringOption((o) => o.setName("song").setDescription("เพลงในคิว").setRequired(true).setAutocomplete(true)),
  async run(ctx, music) {
    const status = music.status(ctx.guildId);
    if (!status?.current) return fail("ไม่มีเพลงในคิว");
    // v5 skipped the voice check here; control from Discord follows the same rule as everywhere else.
    const refused = needSameVoice(ctx, music);
    if (refused) return refused;
    const position = Number(ctx.option("song"));
    if (!Number.isInteger(position) || position < 1) return fail("ตำแหน่งเพลงไม่ถูกต้อง");
    const track = status.queue[position - 1];
    if (!track) return fail("ไม่พบเพลงในตำแหน่งที่เลือก");
    if (!(await music.playNow(ctx.guildId, position - 1))) return fail("ไม่พบเพลงในตำแหน่งที่เลือก");
    return ok(
      `\`⏭️\`┃**Skipped ไปคิวเพลง** **[${track.title}](${track.uri})** \` ${formatDuration(track.durationMs)} \` โดย: <@${ctx.user.id}>`,
      { author: { name: "Go to Page", url: track.uri } },
    );
  },
  autocomplete(ctx, music, focused) {
    const status = music.status(ctx.guildId);
    if (!status) return [{ name: "ไม่มีเพลงในคิว", value: "no_queue_error" }];
    if (status.queue.length === 0) return [{ name: "คิวว่างเปล่า", value: "empty_queue_error" }];
    const all = status.queue
      .slice(0, 25)
      .map((t, i) => ({ name: `${i + 1}. (${t.author}) ${t.title}`.slice(0, 100), value: String(i + 1) }));
    const hits = focused ? all.filter((c) => c.name.toLowerCase().includes(focused.toLowerCase())) : all;
    return hits.length > 0 ? hits : [{ name: "ไม่พบเพลงที่ค้นหาในคิว", value: "not_found_error" }];
  },
};
