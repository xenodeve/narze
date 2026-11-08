import type { GuildSummary } from "@narze/shared";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { Authenticator } from "../auth/authenticator";
import { DiscordApi, guildIconUrl } from "../discord/discord-api";
import { GuildDirectory } from "../guilds/guild-directory";
import { UserStore } from "../users/user-store";

const SyncBodySchema = z.object({ providerToken: z.string().min(1) });

/** The signed-in user's own data. Identity always comes from the bearer token (ADR-0005). */
@Controller("api/me")
export class MeController {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(DiscordApi) private readonly discord: DiscordApi,
    @Inject(UserStore) private readonly store: UserStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
  ) {}

  /**
   * Called once after sign-in with the Discord token Supabase Auth hands the Dashboard. The token
   * must belong to the signed-in user, so nobody can store another user's guild list as their own.
   */
  @Post("sync")
  @HttpCode(204)
  async sync(@Headers("authorization") authorization: string | undefined, @Body() body: unknown): Promise<void> {
    const identity = await this.auth.require(authorization);
    const parsed = SyncBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("providerToken is required");
    const [owner, guilds] = await Promise.all([
      this.discord.me(parsed.data.providerToken),
      this.discord.guilds(parsed.data.providerToken),
    ]);
    if (owner?.id !== identity.discordId) throw new ForbiddenException("the Discord token belongs to another user");
    await this.store.upsertUser(identity);
    await this.store.replaceGuilds(
      identity.discordId,
      guilds.map((g) => ({ id: g.id, name: g.name, iconUrl: guildIconUrl(g), isOwner: g.owner })),
    );
  }

  @Get("guilds")
  async guilds(@Headers("authorization") authorization: string | undefined): Promise<GuildSummary[]> {
    const { discordId } = await this.auth.require(authorization);
    const mutual = await this.directory.mutual(await this.store.guildsOf(discordId));
    return this.directory.summaries(discordId, mutual);
  }
}
