import { COLOR_FAILURE, COLOR_SUCCESS, type Notice } from "../music/format";
import type { Music } from "../music/music";
import type { CommandContext, Reply } from "./types";

export const ok = (description: string, extra: Partial<Notice> = {}, ephemeral = false): Reply => ({
  notice: { color: COLOR_SUCCESS, description, ...extra },
  ephemeral,
});

/** The v5 error line, "> `❌` <message>", sent privately. */
export const fail = (message: string): Reply => ({
  notice: { color: COLOR_FAILURE, description: `> \`❌\` ${message}` },
  ephemeral: true,
});

/**
 * The checks most commands share: the Bot must be in voice, the member too, and in the same
 * channel. Returns a refusal, or null to proceed.
 */
export function needSameVoice(ctx: CommandContext, music: Music, noBot = "ไม่มีบอทในห้อง"): Reply | null {
  const status = music.status(ctx.guildId);
  if (!status) return fail(noBot);
  if (!ctx.memberVoiceChannelId) return fail("กรุณาเข้าห้องเสียงด้วย");
  if (status.voiceChannelId !== ctx.memberVoiceChannelId) return fail("คุณต้องอยู่ในห้องเดียวกับบอท");
  return null;
}
