import { Controller, ForbiddenException, Get, Headers, Inject, NotFoundException, Param, Query } from "@nestjs/common";
import { Authenticator } from "../auth/authenticator";
import { GuildDirectory } from "../guilds/guild-directory";
import { UserStore } from "../users/user-store";
import { HistoryStore } from "./history-store";

/** Listening Sessions and top-played (#108, spec #42, #84, #88). */
@Controller("api")
export class HistoryController {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(HistoryStore) private readonly history: HistoryStore,
    @Inject(UserStore) private readonly users: UserStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
  ) {}

  /** The sessions I took part in, newest first (v5's live route showed every session of every Guild I was in). */
  @Get("sessions")
  async sessions(@Headers("authorization") authorization: string | undefined) {
    const { discordId } = await this.auth.require(authorization);
    return this.history.sessionsOf(discordId);
  }

  @Get("sessions/:id")
  async session(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const { discordId } = await this.auth.require(authorization);
    const session = await this.history.session(discordId, id);
    if (!session) throw new NotFoundException("no such session");
    return session;
  }

  /** `scope=me`: my plays across every Guild. `guildId`: that Guild's plays, for its members only. */
  @Get("history/top")
  async top(
    @Headers("authorization") authorization: string | undefined,
    @Query("scope") scope: string | undefined,
    @Query("guildId") guildId: string | undefined,
  ) {
    const { discordId } = await this.auth.require(authorization);
    if (guildId) {
      const mutual = await this.directory.mutual(await this.users.guildsOf(discordId));
      if (!mutual.some((g) => g.id === guildId)) throw new ForbiddenException("not a member of this server");
      return this.history.top(guildId, "");
    }
    if (scope === "me") return this.history.top("", discordId);
    throw new NotFoundException("choose scope=me or a guildId");
  }
}
