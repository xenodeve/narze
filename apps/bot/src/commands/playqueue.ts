import { SlashCommandBuilder } from "discord.js";
import { formatDuration, trackLink } from "../music/format";
import { fail, needSameVoice, ok } from "./replies";
import type { Command } from "./types";

/** Discord caps a choice value at 100 characters; the uri part is a prefix check when cut. */
const VALUE_MAX = 100;
const MOVED = "คิวเปลี่ยนไปแล้ว ลองเลือกเพลงใหม่อีกครั้ง";

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
    // A choice is "<position>|<uri>": the queue can move between offering it and running it (#102).
    // A typed number has no uri and means whatever is at that position now.
    const [raw = "", named] = String(ctx.option("song")).split(/\|(.*)/s);
    const position = Number(raw);
    if (!Number.isInteger(position) || position < 1) return fail("ตำแหน่งเพลงไม่ถูกต้อง");
    const track = status.queue[position - 1];
    if (!track) return fail("ไม่พบเพลงในตำแหน่งที่เลือก");
    if (named !== undefined && !track.uri.startsWith(named)) return fail(MOVED);
    const result = await music.playNow(ctx.guildId, position - 1, track.uri);
    if (result === "stale") return fail(MOVED);
    if (result !== "ok") return fail("ไม่พบเพลงในตำแหน่งที่เลือก");
    return ok(
      `\`⏭️\`┃**Skipped ไปคิวเพลง** **${trackLink(track)}** \` ${formatDuration(track.durationMs)} \` โดย: <@${ctx.user.id}>`,
      { author: { name: "Go to Page", url: track.uri } },
    );
  },
  autocomplete(ctx, music, focused) {
    const status = music.status(ctx.guildId);
    if (!status) return [{ name: "ไม่มีเพลงในคิว", value: "no_queue_error" }];
    if (status.queue.length === 0) return [{ name: "คิวว่างเปล่า", value: "empty_queue_error" }];
    const all = status.queue.slice(0, 25).map((t, i) => ({
      name: `${i + 1}. (${t.author}) ${t.title}`.slice(0, 100),
      value: `${i + 1}|${t.uri}`.slice(0, VALUE_MAX),
    }));
    const hits = focused ? all.filter((c) => c.name.toLowerCase().includes(focused.toLowerCase())) : all;
    return hits.length > 0 ? hits : [{ name: "ไม่พบเพลงที่ค้นหาในคิว", value: "not_found_error" }];
  },
};
