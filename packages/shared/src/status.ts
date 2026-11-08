import { z } from "zod";

/** How often the Bot publishes a heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 2000;
/** A Bot whose last heartbeat is older than this is shown as offline: two intervals, so one lost
 * heartbeat is tolerated, and short enough that the Dashboard flips within #98's 5 s. */
export const HEARTBEAT_TTL_MS = 4000;

export const RuntimeModeSchema = z.enum(["connected", "standalone"]);
export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;

export const BotHeartbeatSchema = z.object({
  botId: z.string().min(1),
  /** Epoch milliseconds on the Bot's clock. */
  at: z.number().int().nonnegative(),
  mode: RuntimeModeSchema,
  guilds: z.number().int().nonnegative(),
  version: z.string().min(1),
});
export type BotHeartbeat = z.infer<typeof BotHeartbeatSchema>;

export const BotStatusSchema = z.enum(["online", "offline"]);
export type BotStatus = z.infer<typeof BotStatusSchema>;

/**
 * Online if a heartbeat was received within the TTL. Both times are on the RECEIVER's clock:
 * the heartbeat's own `at` comes from the Bot's clock, which may run ahead or behind.
 */
export function botStatusAt(lastReceivedAt: number | null, now: number): BotStatus {
  if (lastReceivedAt === null) return "offline";
  return now - lastReceivedAt <= HEARTBEAT_TTL_MS ? "online" : "offline";
}

/** What the Backend tells the Dashboard about the Bot (Socket.io `bot:status`). */
export const BotStatusPayloadSchema = z.object({
  status: BotStatusSchema,
  heartbeat: BotHeartbeatSchema.nullable(),
});
export type BotStatusPayload = z.infer<typeof BotStatusPayloadSchema>;
