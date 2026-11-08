import { z } from "zod";
import { RequesterSchema } from "./player";

/** A Discord id. */
export const SnowflakeSchema = z.string().regex(/^\d+$/);
const snowflake = SnowflakeSchema;

/** One playback action from the Dashboard (spec #107) or queue edit (#102). */
export const PlayerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("skip") }),
  /** v5 parity: restarts the current track (there is no history). */
  z.object({ action: z.literal("previous") }),
  z.object({ action: z.literal("shuffle") }),
  z.object({ action: z.literal("seek"), positionMs: z.number().int().nonnegative() }),
  z.object({ action: z.literal("volume"), volume: z.number().int().min(0).max(1000) }),
  /** `null` cycles off → track → queue → off (spec #47). */
  z.object({ action: z.literal("loop"), mode: z.enum(["off", "track", "queue"]).nullable() }),
  // Queue editing (#102). Indexes are 0-based positions in the upcoming queue (not the current track).
  /** Spec #46: `to` may equal the queue length (append); moving down drops before the target. */
  z.object({ action: z.literal("move"), from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }),
  /** Skip to a queued track, dropping the ones before it. */
  z.object({ action: z.literal("skipTo"), index: z.number().int().nonnegative() }),
  /** Play a queued track now; the rest of the queue keeps its order (spec #39: jump first, then the update). */
  z.object({ action: z.literal("playNow"), index: z.number().int().nonnegative() }),
  z.object({ action: z.literal("remove"), index: z.number().int().nonnegative() }),
  z.object({ action: z.literal("clear") }),
  z.object({
    action: z.literal("play"),
    query: z.string().trim().min(1).max(500),
    /** Play next: insert at the head of the queue instead of the end. */
    next: z.boolean(),
    /** Where to join when the Bot is not in voice yet (the picker, spec #86). */
    voiceChannelId: snowflake.nullable(),
  }),
]);
export type PlayerAction = z.infer<typeof PlayerActionSchema>;

/** Backend → Bot over Redis: an action already allowed by Control Permission, with who asked. */
export const PlayerCommandSchema = z.object({
  id: z.string().min(1),
  guildId: snowflake,
  actor: RequesterSchema,
  command: PlayerActionSchema,
});
export type PlayerCommand = z.infer<typeof PlayerCommandSchema>;

/**
 * Dashboard → Backend `player:command`. The tab sends its current access token with every command:
 * the handshake token expires after an hour, the tab's token is refreshed (ADR-0005, ADR-0008).
 */
export const ControlRequestSchema = z.object({
  guildId: snowflake,
  command: PlayerActionSchema,
  token: z.string().min(1),
});
export type ControlRequest = z.infer<typeof ControlRequestSchema>;

/** The ack of `player:command`: done, refused with a Control Permission reason, or failed with an error code. */
export type ControlAck = { ok: true } | { ok: false; reason?: string; error?: string };

/** Bot → Backend: the outcome of one command, by id. `error` is a code the Dashboard maps to text. */
export const CommandResultSchema = z.object({
  id: z.string().min(1),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type CommandResult = z.infer<typeof CommandResultSchema>;

export const VoiceMemberSchema = z.object({ id: snowflake, name: z.string(), avatarUrl: z.string().url().nullable() });

/** A Guild's voice channels with who is in each, for the voice-channel picker (spec #86). */
export const VoiceChannelListSchema = z.array(
  z.object({ id: snowflake, name: z.string(), members: z.array(VoiceMemberSchema) }),
);
export type VoiceChannelList = z.infer<typeof VoiceChannelListSchema>;
