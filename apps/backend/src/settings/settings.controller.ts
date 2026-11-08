import {
  Channels,
  GuildEventTypes,
  type GuildSettings,
  parseJson,
  RedisKeys,
  SettingsUpdateSchema,
  type SettingsView,
  type TextChannelList,
  TextChannelListSchema,
} from "@narze/shared";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Put,
} from "@nestjs/common";
import type Redis from "ioredis";
import { Authenticator } from "../auth/authenticator";
import { GuildDirectory } from "../guilds/guild-directory";
import { UserGateway } from "../realtime/user.gateway";
import { REDIS } from "../tokens";
import { UserStore } from "../users/user-store";
import { SettingsStore } from "./settings-store";

/** Guild Settings (#106, spec #92): any member reads, the Server Owner or Bot Owner changes. */
@Controller("api/guilds/:guildId/settings")
export class SettingsController {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(UserStore) private readonly store: UserStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
    @Inject(SettingsStore) private readonly settings: SettingsStore,
    @Inject(UserGateway) private readonly gateway: UserGateway,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async read(
    @Headers("authorization") authorization: string | undefined,
    @Param("guildId") guildId: string,
  ): Promise<SettingsView> {
    const { discordId, guild } = await this.member(authorization, guildId);
    const [settings, textChannels] = await Promise.all([this.stored(guildId), this.textChannels(guildId)]);
    return { settings, canEdit: guild.isOwner || settings.ownerId === discordId, textChannels };
  }

  @Put()
  async change(
    @Headers("authorization") authorization: string | undefined,
    @Param("guildId") guildId: string,
    @Body() body: unknown,
  ): Promise<SettingsView> {
    const { discordId, guild } = await this.member(authorization, guildId);
    const current = await this.stored(guildId);
    if (!guild.isOwner && current.ownerId !== discordId) {
      throw new ForbiddenException("only the Server Owner or the Bot Owner can change settings");
    }
    const change = SettingsUpdateSchema.safeParse(body);
    if (!change.success) throw new BadRequestException("invalid settings");
    const textChannels = await this.textChannels(guildId);
    const channel = change.data.musicChannelId;
    if (channel && !textChannels.some((c) => c.id === channel)) {
      throw new BadRequestException("not a text channel the Bot can post in");
    }
    const settings = await this.settings.update(current, change.data);
    // The Bot refreshes its copy over Redis; every open tab of this Guild gets it over the socket.
    await this.redis.publish(
      Channels.guildEvents,
      JSON.stringify({
        type: GuildEventTypes.settingsUpdate,
        guildId,
        revision: 0,
        sequence: 0,
        ts: Date.now(),
        data: settings,
      }),
    );
    this.gateway.pushSettings(guildId, settings);
    return { settings, canEdit: true, textChannels };
  }

  private async stored(guildId: string): Promise<GuildSettings> {
    const settings = await this.settings.get(guildId);
    // The Bot creates the row when it joins; none yet means it has not seen this Guild.
    if (!settings) throw new NotFoundException("no settings for this server yet");
    return settings;
  }

  private async textChannels(guildId: string): Promise<TextChannelList> {
    return parseJson(TextChannelListSchema, await this.redis.get(RedisKeys.textChannels(guildId))) ?? [];
  }

  /** View Permission: the caller must be in this Mutual Guild. */
  private async member(authorization: string | undefined, guildId: string) {
    const { discordId } = await this.auth.require(authorization);
    const mutual = await this.directory.mutual(await this.store.guildsOf(discordId), discordId);
    const guild = mutual.find((g) => g.id === guildId);
    if (!guild) throw new ForbiddenException("not a member of this server");
    return { discordId, guild };
  }
}
