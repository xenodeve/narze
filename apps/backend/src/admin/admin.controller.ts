import {
  ADMIN_USER_ROWS,
  type AdminGuildRow,
  AdminGuildSchema,
  AdminStatsSchema,
  type AdminUser,
  type AdminUserList,
  DiscordIdSchema,
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
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Redis from "ioredis";
import { GuildDirectory } from "../guilds/guild-directory";
import { HistoryStore } from "../history/history-store";
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
  constructor(
    @Inject(AdminRoles) private readonly roles: AdminRoles,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(AdminGateway) private readonly gateway: AdminGateway,
    @Inject(AdminQueries) private readonly queries: AdminQueries,
    @Inject(HistoryStore) private readonly history: HistoryStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
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
    const guilds = AdminGuildSchema.array().parse(await this.queries.ask({ kind: "guilds" }));
    const summaries = await Promise.all(guilds.map((g) => this.directory.playerSummary(g.id)));
    return guilds.map((g, i) => ({ ...g, playing: summaries[i]?.playing ?? false }));
  }

  @Get("guilds/:guildId")
  async guild(@Param("guildId") guildId: string) {
    return AdminGuildSchema.parse(await this.queries.ask({ kind: "guild", guildId: snowflake(guildId) }));
  }

  @Get("guilds/:guildId/channels")
  channels(@Param("guildId") guildId: string) {
    return this.queries.channels(snowflake(guildId));
  }

  /** Spec #111: the last 50 messages, read through the Bot and cached (AC2). */
  @Get("guilds/:guildId/channels/:channelId/messages")
  messages(@Param("guildId") guildId: string, @Param("channelId") channelId: string) {
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
    const [{ data, error }, online] = await Promise.all([
      this.db.rpc("admin_user_stats"),
      this.redis.hgetall(RedisKeys.presence),
    ]);
    check("admin user stats", error);
    const rows = (data ?? []) as Array<{
      discord_id: string;
      name: string;
      avatar_url: string | null;
      plays: number;
      unique_tracks: number;
      last_active_at: string | null;
    }>;
    const users: AdminUser[] = rows.map((r) => ({
      discordId: r.discord_id,
      name: r.name,
      avatarUrl: r.avatar_url,
      plays: Number(r.plays),
      uniqueTracks: Number(r.unique_tracks),
      lastActiveAt: r.last_active_at ? Date.parse(r.last_active_at) : null,
      online: Number(online[r.discord_id] ?? 0) > 0,
    }));
    const today = startOfDayBangkok(Date.now());
    return { users, activeToday: users.filter((u) => u.online || (u.lastActiveAt ?? 0) >= today).length };
  }

  /** Spec #114: up to 500 history items (last played first) and 500 sessions across Guilds. */
  @Get("users/:discordId")
  async user(@Param("discordId") discordId: string) {
    const id = snowflake(discordId);
    const [history, sessions] = await Promise.all([
      this.history.recent("", id, ADMIN_USER_ROWS),
      this.history.sessionsOf(id, "", ADMIN_USER_ROWS),
    ]);
    return { history, sessions };
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
    if (action !== "restart" && action !== "shutdown") throw new NotFoundException();
    if ((body as { confirm?: unknown } | null)?.confirm !== action) {
      throw new BadRequestException(`confirm with { "confirm": "${action}" }`);
    }
    const by = request.admin?.identity.discordId;
    if (!by) throw new BadRequestException("no admin");
    await this.queries.ask({ kind: action, by });
  }
}

/** A route parameter that must be a Discord ID; anything else is a 400, never a query to the Bot. */
function snowflake(value: string): string {
  if (!SnowflakeSchema.safeParse(value).success) throw new BadRequestException("invalid id");
  return value;
}
