import { Inject, Injectable } from "@nestjs/common";
import { DISCORD_API_URL } from "../tokens";

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
}

/** Discord REST calls made with the user's own OAuth token (scope `identify guilds`). */
@Injectable()
export class DiscordApi {
  constructor(@Inject(DISCORD_API_URL) private readonly baseUrl: string) {}

  private async get<T>(path: string, token: string): Promise<T | null> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
    return res.ok ? ((await res.json()) as T) : null;
  }

  /** The user the token belongs to, or null if Discord refuses it. */
  me(token: string): Promise<{ id: string } | null> {
    return this.get("/users/@me", token);
  }

  /**
   * The user's guilds, or null when Discord refuses (429, 5xx): an empty list would be stored as
   * "in no servers". One page of up to 200, Discord's maximum; more is not fetched.
   */
  guilds(token: string): Promise<DiscordGuild[] | null> {
    return this.get<DiscordGuild[]>("/users/@me/guilds", token);
  }
}

export const guildIconUrl = (guild: DiscordGuild) =>
  guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96` : null;
