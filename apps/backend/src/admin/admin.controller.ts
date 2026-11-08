import {
  ADMIN_USER_ROWS,
  type AdminGuildRow,
  AdminStatsSchema,
  type AdminUser,
  type AdminUserList,
  BotPowerActionSchema,
  BotPowerRequestSchema,
  DiscordIdSchema,
  PlayerSummarySchema,
  parseJson,
  RedisKeys,
  SnowflakeSchema,
  STATS_POINTS,
  startOfDayBangkok,
  WhitelistChangeSchema,
} from "@narze/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Redis from "ioredis";
import { HistoryStore } from "../history/history-store";
import { Presence } from "../presence/presence";
import { check } from "../supabase-check";
import { REDIS, SUPABASE } from "../tokens";
import { AdminGateway } from "./admin.gateway";
import { AdminGuard, type AdminRequest, DeveloperOnly } from "./admin.guard";
import { AdminQueries } from "./admin-queries";
import { AdminRoles } from "./admin-roles";
import { readRing } from "./ring";

/** The admin area (#110). AdminGuard covers every route here; some need a Developer. */
@Controller("api/admin")
@UseGuards(AdminGuard)
export class AdminController {
  private readonly logger = new Logger("AdminController");

  constructor(
    @Inject(AdminRoles) private readonly roles: AdminRoles,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(AdminGateway) private readonly gateway: AdminGateway,
    @Inject(AdminQueries) private readonly queries: AdminQueries,
    @Inject(HistoryStore) private readonly history: HistoryStore,
    @Inject(Presence) private readonly presence: Presence,
    @Inject(SUPABASE) private readonly db: SupabaseClient,
  ) {}

  @Get("me")
  me(@Req() request: AdminRequest) {
    return { role: request.admin?.role };
  }

  /** Spec #109: the Bot's last samples, oldest first; each carries its own window. */
  @Get("stats")
  async stats() {
    return { samples: await readRing(this.redis, RedisKeys.botStatsRing, AdminStatsSchema, STATS_POINTS) };
  }

  @Get("whitelist")
  @DeveloperOnly()
  whitelist() {
    return this.roles.list();
  }

  @Put("whitelist")
  @DeveloperOnly()
  @HttpCode(204)
  async change(@Req() request: AdminRequest, @Body() body: unknown) {
    const change = WhitelistChangeSchema.safeParse(body);
    if (!change.success) throw new BadRequestException("invalid request");
    await this.roles.set(change.data.discordId, change.data.role, request.admin?.identity.discordId ?? "");
  }

  @Delete("whitelist/:discordId")
  @DeveloperOnly()
  @HttpCode(204)
  async remove(@Param("discordId") discordId: string) {
    if (!DiscordIdSchema.safeParse(discordId).success) throw new BadRequestException("invalid id");
    await this.roles.remove(discordId);
    this.gateway.revoke(discordId);
  }

  // --- #111 Admin II: guilds, channels, users, sessions, restart/shutdown ---

  /** Spec #110: every Guild the Bot is in, with whether a Player is playing there. */
  @Get("guilds")
  async guilds(): Promise<AdminGuildRow[]> {
    const guilds = await this.queries.guilds();
    if (guilds.length === 0) return [];
    // One MGET for every Guild's Player summary (the GuildDirectory pattern).
    const raw = await this.redis.mget(guilds.map((g) => RedisKeys.playerSummary(g.id)));
    return guilds.map((g, i) => ({ ...g, playing: parseJson(PlayerSummarySchema, raw[i])?.playing ?? false }));
  }

  @Get("guilds/:guildId")
  async guild(@Param("guildId") guildId: string) {
    return this.queries.guild(snowflake(guildId));
  }

  @Get("guilds/:guildId/channels")
  channels(@Param("guildId") guildId: string) {
    return this.queries.channels(snowflake(guildId));
  }

  /** Spec #111: the last 50 messages, read through the Bot and cached (AC2). */
  @Get("guilds/:guildId/channels/:channelId/messages")
  messages(@Req() request: AdminRequest, @Param("guildId") guildId: string, @Param("channelId") channelId: string) {
    // Reading a private channel is recorded with who read it (security review).
    this.logger.warn(`audit: ${request.admin?.identity.discordId} read channel ${channelId} in ${guildId}`);
    return this.queries.messages(snowflake(guildId), snowflake(channelId));
  }

  @Get("guilds/:guildId/sessions")
  guildSessions(@Param("guildId") guildId: string) {
    return this.history.sessionsIn(snowflake(guildId));
  }

  @Get("guilds/:guildId/history")
  guildHistory(@Param("guildId") guildId: string) {
    return this.history.recent(snowflake(guildId), "");
  }

  /** Spec #114: everyone who played or opened the Dashboard, with live presence and Active Today. */
  @Get("users")
  async users(): Promise<AdminUserList> {
    const users = await this.userStats(null);
    const today = startOfDayBangkok(Date.now());
    return { users, activeToday: users.filter((u) => u.online || (u.lastActiveAt ?? 0) >= today).length };
  }

  /** Spec #114: one person, up to 500 history items (last played first) and 500 sessions across Guilds. */
  @Get("users/:discordId")
  async user(@Param("discordId") discordId: string) {
    if (!DiscordIdSchema.safeParse(discordId).success) throw new BadRequestException("invalid id");
    const [users, history, sessions] = await Promise.all([
      this.userStats(discordId),
      this.history.recent("", discordId, ADMIN_USER_ROWS),
      this.history.sessionsOf(discordId, "", ADMIN_USER_ROWS),
    ]);
    return { user: users[0] ?? null, history, sessions };
  }

  /** admin_user_stats() (#111) with Presence; `only` narrows it to one person. */
  private async userStats(only: string | null): Promise<AdminUser[]> {
    const [{ data, error }, online] = await Promise.all([
      this.db.rpc("admin_user_stats", only ? { p_discord_id: only } : {}),
      this.presence.online(),
    ]);
    check("admin user stats", error);
    const tabs = new Set(online);
    const rows = (data ?? []) as Array<{
      discord_id: string;
      name: string;
      avatar_url: string | null;
      plays: number;
      unique_tracks: number;
      last_active_at: string | null;
    }>;
    return rows.map((r) => ({
      discordId: r.discord_id,
      name: r.name,
      avatarUrl: r.avatar_url,
      plays: Number(r.plays),
      uniqueTracks: Number(r.unique_tracks),
      lastActiveAt: r.last_active_at ? Date.parse(r.last_active_at) : null,
      online: tabs.has(r.discord_id),
    }));
  }

  /** Spec #112: any session, whoever was in it. */
  @Get("sessions/:id")
  async session(@Param("id") id: string) {
    const session = await this.history.session(null, id);
    if (!session) throw new NotFoundException("no such session");
    return session;
  }

  /** Restart and shutdown need a body naming the action, so a stray POST does nothing (AC3). */
  @Post("bot/:action")
  @HttpCode(204)
  async power(@Req() request: AdminRequest, @Param("action") action: string, @Body() body: unknown) {
    const kind = BotPowerActionSchema.safeParse(action);
    if (!kind.success) throw new NotFoundException();
    if (BotPowerRequestSchema.safeParse(body).data?.confirm !== kind.data) {
      throw new BadRequestException(`confirm with { "confirm": "${kind.data}" }`);
    }
    const by = request.admin?.identity.discordId;
    if (!by) throw new BadRequestException("no admin");
    // Recorded here too: the Bot's own log line is lost when it cannot answer.
    this.logger.warn(`audit: ${kind.data} asked by ${by}`);
    await this.queries.ask({ kind: kind.data, by });
  }
}

/** A route parameter that must be a Discord ID; anything else is a 400, never a query to the Bot. */
function snowflake(value: string): string {
  if (!SnowflakeSchema.safeParse(value).success) throw new BadRequestException("invalid id");
  return value;
}
