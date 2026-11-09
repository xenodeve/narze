import { SlashCommandBuilder } from "discord.js";
import { escapeText, formatDuration } from "../music/format";
import type { Music, PlayRequest, PlayResult } from "../music/music";
import { fail, ok } from "./replies";
import type { Command, CommandContext, Reply } from "./types";

const REASON = {
  empty: "กรุณาระบุเพลง",
  unsupported: "ไม่รองรับ Platform นี้",
  "coming-soon": "ยังไม่รองรับแหล่งเพลงนี้ จะรองรับเร็ว ๆ นี้",
  "not-found": "ไม่สามารถหาเพลงได้",
  failed: "ไม่สามารถเล่นเพลงได้",
} as const;

type Place = Pick<PlayRequest, "next" | "position" | "skipplay">;

/** The values our own error suggestions carry; only these exact strings are refused. */
const ERROR_SENTINELS = new Set([
  "error",
  "not_found_error",
  "no_queue_error",
  "empty_queue_error",
  "nobeforsong_error",
]);

/** The voice checks every play command makes, then the play: a refusal, or what the engine did. */
async function playAt(ctx: CommandContext, music: Music, place: Place): Promise<Reply | PlayResult> {
  // v5's sentinels: a suggestion that was itself an error comes back as the query.
  const query = String(ctx.option("query") ?? "");
  if (query === "no_song") return fail("กรุณาระบุเพลง");
  if (ERROR_SENTINELS.has(query)) return fail("กรุณาระบุเพลงที่ถูกต้อง");
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
  if (result.kind === "playlist") return playlistReply(ctx, music, result, place);
  const line = `**${result.track.title}** \` ${formatDuration(result.track.durationMs)} \``;
  if (result.kind === "started") return ok(`\`▶️\`┃${line}`);
  return ok(`\`${place.next ? "⏭️" : "📝"}\`┃${line} \n > ลำดับ: \` ${result.position} \``);
}

/** Spec #4: what a playlist added, in v5's lines; from idle it is 📙 and has no queue line. */
function playlistReply(
  ctx: CommandContext,
  music: Music,
  result: Extract<PlayResult, { kind: "playlist" }>,
  place: Place,
): Reply {
  const { playlist } = result;
  const lines = [
    `> \`${result.started ? "📙" : "📝"}\` **Playlist:** ${escapeText(playlist.name)}`,
    `> \`⌛\` **เวลา:** \` ${formatDuration(playlist.durationMs)} \` `,
    `> \`📊\` **มี:** \` ${playlist.count} \` เพลง `,
  ];
  if (!result.started && place.next) lines.push(`> **ลำดับ:** \` 1 ถึง ${playlist.count} \` `);
  if (!result.started) lines.push(`> **คิวทั้งหมด:** \` ${music.status(ctx.guildId)?.queue.length ?? 0} \` เพลง `);
  lines.push(`> **ห้อง:** <#${ctx.memberVoiceChannelId}>`);
  return ok(lines.join("\n"), {
    author: { name: "Go to Playlist", url: playlist.url, iconUrl: playlist.icon },
    thumbnailUrl: playlist.thumbnail,
  });
}

const withQuery = (b: SlashCommandBuilder) =>
  b.addStringOption((o) => o.setName("query").setDescription("ชื่อเพลง | ลิ้งก์").setRequired(true).setAutocomplete(true));

/** Spec #2: the query option of /play, /playnext, /playat and /skipplay suggests tracks. */
export const suggestTracks: NonNullable<Command["autocomplete"]> = (_ctx, music, focused) => music.suggest(focused);

export const playnext: Command = {
  slow: true,
  data: withQuery(new SlashCommandBuilder().setName("playnext").setDescription("เพิ่มเพลงถัดจากเพลงปัจจุบัน")),
  run: (ctx, music) => placedPlay(ctx, music, { next: true }),
  autocomplete: suggestTracks,
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
  autocomplete(ctx, music, focused, option) {
    if (option === "query") return music.suggest(focused);
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
    const title = result.kind === "playlist" ? result.playlist.name : result.track.title;
    return ok(`\`⏭️\`┃**Skipped** ไปยังเพลง **${title}** โดย: <@${ctx.user.id}>`);
  },
  autocomplete(ctx, music, focused) {
    const status = music.status(ctx.guildId);
    if (!status?.current) return [{ name: "ไม่มีเพลงก่อนหน้า ไม่สามารถใช้ skipplay ได้", value: "nobeforsong_error" }];
    return music.suggest(focused);
  },
};
