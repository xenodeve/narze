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
  | "in-bot-voice"
  | "join-voice"
  | "join-bot-voice";

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
  return input.userVoiceChannelId !== null && input.userVoiceChannelId === input.botVoiceChannelId
    ? { canControl: true, reason: "in-bot-voice", badge: "in-voice" }
    : { canControl: false, reason: "join-bot-voice", badge: "view-only" };
}
