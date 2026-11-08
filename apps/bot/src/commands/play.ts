import { SlashCommandBuilder } from "discord.js";
import { formatDuration } from "../music/format";
import { fail, ok } from "./replies";
import type { Command } from "./types";

const REASON = {
  empty: "กรุณาระบุเพลง",
  unsupported: "ไม่รองรับ Platform นี้",
  "not-found": "ไม่สามารถหาเพลงได้",
  failed: "ไม่สามารถเล่นเพลงได้",
} as const;

export const play: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("เล่น | เพิ่มคิว")
    .addStringOption((o) => o.setName("query").setDescription("ชื่อเพลง | ลิ้งก์").setRequired(true)),
  async run(ctx, music) {
    const voice = ctx.memberVoiceChannelId;
    if (!voice) return fail("กรุณาเข้าห้องเสียงด้วย");
    const status = music.status(ctx.guildId);
    if (status && status.voiceChannelId !== voice) return fail("กรุณาอยู่ในห้องเสียงเดียวกับบอท");
    if (!status && !ctx.canSpeakIn(voice)) return fail(`บอทไม่มีอำนาจเปิดเพลงในห้อง <#${voice}>`);
    const result = await music.play({
      guildId: ctx.guildId,
      voiceChannelId: voice,
      textChannelId: ctx.channelId,
      query: String(ctx.option("query") ?? ""),
      requester: ctx.user,
    });
    if (result.kind === "error") return fail(REASON[result.reason]);
    const line = `**${result.track.title}** \` ${formatDuration(result.track.durationMs)} \``;
    return result.kind === "started" ? ok(`\`▶️\`┃${line}`) : ok(`\`📝\`┃${line} \n > ลำดับ: \` ${result.position} \``);
  },
};
