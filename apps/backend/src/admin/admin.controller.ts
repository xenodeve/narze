import { AdminStatsSchema, DiscordIdSchema, RedisKeys, STATS_POINTS, WhitelistChangeSchema } from "@narze/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../tokens";
import { AdminGuard, type AdminRequest, DeveloperOnly } from "./admin.guard";
import { AdminRoles } from "./admin-roles";
import { readRing } from "./ring";

/** The admin area (#110). AdminGuard covers every route here; some need a Developer. */
@Controller("api/admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    @Inject(AdminRoles) private readonly roles: AdminRoles,
    @Inject(REDIS) private readonly redis: Redis,
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
  }
}
