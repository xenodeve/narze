import type { PlayerState, VoiceChannelList } from "@narze/shared";
import { Controller, ForbiddenException, Get, Headers, Inject, Param } from "@nestjs/common";
import { Authenticator } from "../auth/authenticator";
import { GuildDirectory } from "../guilds/guild-directory";
import { UserStore } from "../users/user-store";
import { PlayerCache } from "./player-cache";

/** Read-only Player State for the Dashboard (#100); control lands in #101. */
@Controller("api/guilds/:guildId")
export class PlayerController {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(UserStore) private readonly store: UserStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
    @Inject(PlayerCache) private readonly cache: PlayerCache,
  ) {}

  /** View Permission: any member of a Mutual Guild may read its Player State (CONTEXT.md). */
  @Get("player")
  async state(
    @Headers("authorization") authorization: string | undefined,
    @Param("guildId") guildId: string,
  ): Promise<{ state: PlayerState | null; now: number; permission: { canControl: boolean; reason: string } }> {
    const { discordId, guild } = await this.member(authorization, guildId);
    const [state, { canControl, reason }] = await Promise.all([
      this.cache.get(guildId),
      this.directory.permission(discordId, guild),
    ]);
    // `now` lets the client place `syncedAt` on its own clock before interpolating (spec #103).
    return { state, now: Date.now(), permission: { canControl, reason } };
  }

  /** The Guild's voice channels with members, for the picker (spec #86). */
  @Get("voice-channels")
  async voiceChannels(
    @Headers("authorization") authorization: string | undefined,
    @Param("guildId") guildId: string,
  ): Promise<VoiceChannelList> {
    await this.member(authorization, guildId);
    return this.directory.voiceChannelList(guildId);
  }

  /** View Permission: the caller must be in this Mutual Guild. */
  private async member(authorization: string | undefined, guildId: string) {
    const { discordId } = await this.auth.require(authorization);
    const mutual = await this.directory.mutual(await this.store.guildsOf(discordId));
    const guild = mutual.find((g) => g.id === guildId);
    if (!guild) throw new ForbiddenException("not a member of this server");
    return { discordId, guild };
  }
}
