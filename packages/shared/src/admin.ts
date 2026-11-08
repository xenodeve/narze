import { z } from "zod";

/** Dashboard roles from the Admin Whitelist (#110, spec #97, #122). A Developer can do all an Admin can. */
export const AdminRoleSchema = z.enum(["admin", "developer"]);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

/** A Discord user ID (a snowflake): 17 to 20 digits. */
export const DiscordIdSchema = z.string().regex(/^\d{17,20}$/);

const RANK: Record<AdminRole, number> = { admin: 1, developer: 2 };

/** Whether `role` (null: not on the whitelist) reaches `needed`. */
export function isAtLeast(role: AdminRole | null, needed: AdminRole): boolean {
  return role !== null && RANK[role] >= RANK[needed];
}

export const WhitelistEntrySchema = z.object({
  discordId: DiscordIdSchema,
  role: AdminRoleSchema,
  /** From NARZE_DEVELOPER_IDS: always a Developer, not removable from the Dashboard. */
  fixed: z.boolean(),
  addedBy: z.string().nullable(),
  addedAt: z.string().nullable(),
});
export type WhitelistEntry = z.infer<typeof WhitelistEntrySchema>;

/** A whitelist change; only a Developer may send it. */
export const WhitelistChangeSchema = z.object({ discordId: DiscordIdSchema, role: AdminRoleSchema });

/**
 * One stats sample from the Bot (spec #109, #74), every 5 s. `cpuPercent` is measured over
 * `windowMs` ending at `at`; every number belongs to that window.
 */
export const AdminStatsSchema = z.object({
  at: z.number().int().nonnegative(),
  windowMs: z.number().int().positive(),
  online: z.boolean(),
  pingMs: z.number().nullable(),
  uptimeMs: z.number().nonnegative(),
  guilds: z.number().int().nonnegative(),
  activePlayers: z.number().int().nonnegative(),
  cpuPercent: z.number().nonnegative(),
  memory: z.object({ usedBytes: z.number().nonnegative(), totalBytes: z.number().nonnegative() }),
  caches: z.array(
    z.object({ name: z.string(), items: z.number().int().nonnegative(), bytes: z.number().nonnegative() }),
  ),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;

/** GET /api/admin/me and GET /api/admin/stats. */
export const AdminMeSchema = z.object({ role: AdminRoleSchema });
export const AdminStatsListSchema = z.object({ samples: z.array(AdminStatsSchema) });

export const LogLevelSchema = z.enum(["info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/** One line of the Bot's console (spec #113, #120); `text` keeps its ANSI colours. */
export const LogLineSchema = z.object({ at: z.number().int().nonnegative(), level: LogLevelSchema, text: z.string() });
export type LogLine = z.infer<typeof LogLineSchema>;

/** console.log/info/debug are info; warn and error keep their names. */
export const logLevelOf = (method: string): LogLevel => (method === "warn" || method === "error" ? method : "info");

/** The Bot's log ring holds this many lines (spec #120); a new admin tab gets the last LOG_HISTORY. */
export const LOG_RING = 1000;
export const LOG_HISTORY = 100;
/** The performance page plots this many 5 s samples (5 minutes). */
export const STATS_POINTS = 60;
