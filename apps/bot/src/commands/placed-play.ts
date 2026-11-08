import { SlashCommandBuilder } from "discord.js";
import { formatDuration } from "../music/format";
import type { Music, PlayRequest, PlayResult } from "../music/music";
import { fail, ok } from "./replies";
import type { Command, CommandContext, Reply } from "./types";

const REASON = {
  empty: "กรุณาระบุเพลง",
  unsupported: "ไม่รองรับ Platform นี้",
  "not-found": "ไม่สามารถหาเพลงได้",
  failed: "ไม่สามารถเล่นเพลงได้",
} as const;

type Place = Pick<PlayRequest, "next" | "position" | "skipplay">;

/** The voice checks every play command makes, then the play: a refusal, or what the engine did. */
async function playAt(ctx: CommandContext, music: Music, place: Place): Promise<Reply | PlayResult> {
  const voice = ctx.memberVoiceChannelId;
  if (!voice) return fail("กรุณาเข้าห้องเสียงด้วย");
  const status = music.status(ctx.guildId);
  if (status && status.voiceChannelId !== voice) return fail("กรุณาอยู่ในห้องเสียงเดียวกับบอท");
  if (!status && !ctx.canSpeakIn(voice)) return fail(`บอทไม่มีอำนาจเปิดเพลงในห้อง <#${voice}>`);
  return music.play({
    guildId: ctx.guildId,
    voiceChannelId: voice,
    textChannelId: ctx.channelId,
    query: String(ctx.option("query") ?? ""),
    requester: ctx.user,
    ...place,
  });
}

/** /play, /playnext and /playat: the track and where it landed. */
export async function placedPlay(ctx: CommandContext, music: Music, place: Place = {}): Promise<Reply> {
  const result = await playAt(ctx, music, place);
  if ("notice" in result) return result;
  if (result.kind === "error") return fail(REASON[result.reason]);
  const line = `**${result.track.title}** \` ${formatDuration(result.track.durationMs)} \``;
  if (result.kind === "started") return ok(`\`▶️\`┃${line}`);
  return ok(`\`${place.next ? "⏭️" : "📝"}\`┃${line} \n > ลำดับ: \` ${result.position} \``);
}

const withQuery = (b: SlashCommandBuilder) =>
  b.addStringOption((o) => o.setName("query").setDescription("ชื่อเพลง | ลิ้งก์").setRequired(true));

export const playnext: Command = {
  slow: true,
  data: withQuery(new SlashCommandBuilder().setName("playnext").setDescription("เพิ่มเพลงถัดจากเพลงปัจจุบัน")),
  run: (ctx, music) => placedPlay(ctx, music, { next: true }),
};

export const playat: Command = {
  slow: true,
  data: withQuery(new SlashCommandBuilder().setName("playat").setDescription("เพิ่มเพลงในตำแหน่งที่เลือก")).addStringOption(
    (o) => o.setName("position").setDescription("ตำแหน่ง").setRequired(true).setAutocomplete(true),
  ),
  async run(ctx, music) {
    const position = Number(ctx.option("position"));
    if (!Number.isInteger(position) || position < 1) return fail("ตำแหน่งไม่ถูกต้อง");
    return placedPlay(ctx, music, { position: position - 1 });
  },
  autocomplete(ctx, music, focused) {
    const size = music.status(ctx.guildId)?.queue.length ?? 0;
    if (size === 0) return [{ name: "ไม่มีเพลงในคิว - แทรกเป็นเพลงแรก", value: "1" }];
    const all = [
      { name: "1. ถัดจากเพลงปัจจุบัน (ลำดับแรก)", value: "1" },
      { name: `${size + 1}. ท้ายคิว`, value: String(size + 1) },
      ...Array.from({ length: size - 1 }, (_, i) => ({ name: `${i + 2}. ลำดับที่ ${i + 2}`, value: String(i + 2) })),
    ];
    if (!focused) return all.slice(0, 10);
    const hits = all.filter((c) => c.name.includes(focused)).slice(0, 25);
    return hits.length > 0 ? hits : [{ name: "ไม่พบตำแหน่งที่ค้นหา", value: "not_found_error" }];
  },
};

export const skipplay: Command = {
  slow: true,
  data: withQuery(new SlashCommandBuilder().setName("skipplay").setDescription("ลัดคิวเล่นทันที")),
  async run(ctx, music) {
    if (!music.status(ctx.guildId)?.current) return fail("ไม่มีเพลงก่อนหน้า");
    const result = await playAt(ctx, music, { skipplay: true });
    if ("notice" in result) return result;
    if (result.kind === "error") return fail(REASON[result.reason]);
    return ok(`\`⏭️\`┃**Skipped** ไปยังเพลง **${result.track.title}** โดย: <@${ctx.user.id}>`);
  },
};
