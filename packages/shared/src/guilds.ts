import { z } from "zod";

const snowflake = z.string().regex(/^\d+$/);

/** What the Bot publishes about one Guild's Player; enough for badges, not the full Player State. */
export const PlayerSummarySchema = z.object({
  playing: z.boolean(),
  queueLength: z.number().int().nonnegative(),
  voiceChannelId: snowflake.nullable(),
});
export type PlayerSummary = z.infer<typeof PlayerSummarySchema>;

export const PermissionBadgeSchema = z.enum(["owner", "in-voice", "can-play", "view-only"]);
export type PermissionBadge = z.infer<typeof PermissionBadgeSchema>;

/** One row of the Dashboard's server list: a Mutual Guild with its live Player summary. */
export const GuildSummarySchema = z.object({
  id: snowflake,
  name: z.string(),
  iconUrl: z.string().url().nullable(),
  /** Reported by the Bot; null until it has (spec #79). */
  memberCount: z.number().int().nonnegative().nullable(),
  playing: z.boolean(),
  queueLength: z.number().int().nonnegative(),
  badge: PermissionBadgeSchema,
});
export type GuildSummary = z.infer<typeof GuildSummarySchema>;

export interface ControlPermissionInput {
  isServerOwner: boolean;
  /** Always false until guild settings store the Bot Owner (#106). */
  isBotOwner: boolean;
  hasPlayer: boolean;
  userVoiceChannelId: string | null;
  botVoiceChannelId: string | null;
}

export type ControlReason =
  | "server-owner"
  | "bot-owner"
  | "in-voice"
  | "join-voice"
  | "in-bot-voice"
  | "not-in-voice"
  | "other-voice"
  /** Not part of the ladder: a non-owner picked a channel other than their own to start in (#101). */
  | "own-voice-only";

/** v5's reason strings (spec #98, C.4). "No active player - can start playback" is a UI contract: it hides the idle banner. */
export const CONTROL_REASON_TEXT: Record<ControlReason, string> = {
  "server-owner": "Server owner",
  "bot-owner": "Bot owner in this guild",
  "in-voice": "No active player - can start playback",
  "join-voice": "Join a voice channel to start playback",
  "in-bot-voice": "In same voice channel",
  "not-in-voice": "You must be in a voice channel to control the bot",
  "other-voice": "You must be in the same voice channel as the bot",
  "own-voice-only": "You can only start playback in your own voice channel",
};

export interface ControlPermission {
  canControl: boolean;
  /** Shown to the user, so a refusal always says what to do. */
  reason: ControlReason;
  badge: PermissionBadge;
}

/** The Control Permission ladder (CONTEXT.md), evaluated in order. */
export function controlPermission(input: ControlPermissionInput): ControlPermission {
  if (input.isServerOwner) return { canControl: true, reason: "server-owner", badge: "owner" };
  if (input.isBotOwner) return { canControl: true, reason: "bot-owner", badge: "can-play" };
  if (!input.hasPlayer) {
    return input.userVoiceChannelId
      ? { canControl: true, reason: "in-voice", badge: "can-play" }
      : { canControl: false, reason: "join-voice", badge: "view-only" };
  }
  if (input.userVoiceChannelId === null) return { canControl: false, reason: "not-in-voice", badge: "view-only" };
  return input.userVoiceChannelId === input.botVoiceChannelId
    ? { canControl: true, reason: "in-bot-voice", badge: "in-voice" }
    : { canControl: false, reason: "other-voice", badge: "view-only" };
}
