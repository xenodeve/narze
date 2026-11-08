import type { PlayerState } from "@narze/shared";
import { Controller, ForbiddenException, Get, Headers, Inject, Param } from "@nestjs/common";
import { Authenticator } from "../auth/authenticator";
import { GuildDirectory } from "../guilds/guild-directory";
import { UserStore } from "../users/user-store";
import { PlayerCache } from "./player-cache";

/** Read-only Player State for the Dashboard (#100); control lands in #101. */
@Controller("api/guilds/:guildId/player")
export class PlayerController {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(UserStore) private readonly store: UserStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
    @Inject(PlayerCache) private readonly cache: PlayerCache,
  ) {}

  /** View Permission: any member of a Mutual Guild may read its Player State (CONTEXT.md). */
  @Get()
  async state(
    @Headers("authorization") authorization: string | undefined,
    @Param("guildId") guildId: string,
  ): Promise<{ state: PlayerState | null }> {
    const { discordId } = await this.auth.require(authorization);
    const mutual = await this.directory.mutual(await this.store.guildsOf(discordId));
    if (!mutual.some((g) => g.id === guildId)) throw new ForbiddenException("not a member of this server");
    return { state: await this.cache.get(guildId) };
  }
}
