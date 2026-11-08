import {
  controlPermission,
  type GuildSummary,
  type PlayerSummary,
  PlayerSummarySchema,
  RedisKeys,
} from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../tokens";
import type { StoredGuild } from "../users/user-store";

const parseSummary = (raw: string | null): PlayerSummary | null => {
  if (!raw) return null;
  try {
    const parsed = PlayerSummarySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** Joins a user's guild snapshot with what the Bot publishes on Redis (ADR-0002). */
@Injectable()
export class GuildDirectory {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Mutual Guilds: the user's guilds that the Bot is also in. */
  async mutual(guilds: StoredGuild[]): Promise<StoredGuild[]> {
    if (guilds.length === 0) return [];
    const flags = await this.redis.smismember(RedisKeys.botGuilds, ...guilds.map((g) => g.id));
    return guilds.filter((_, i) => flags[i] === 1);
  }

  async summaries(discordId: string, guilds: StoredGuild[]): Promise<GuildSummary[]> {
    return Promise.all(guilds.map((guild) => this.summary(discordId, guild)));
  }

  /** `player` may be passed when the caller already holds it (a Guild event), saving a read. */
  async summary(discordId: string, guild: StoredGuild, player?: PlayerSummary | null): Promise<GuildSummary> {
    const [current, userVoice] = await Promise.all([
      player === undefined ? this.redis.get(RedisKeys.playerSummary(guild.id)).then(parseSummary) : player,
      this.redis.hget(RedisKeys.voiceStates(guild.id), discordId),
    ]);
    const { badge } = controlPermission({
      isServerOwner: guild.isOwner,
      isBotOwner: false,
      hasPlayer: current !== null,
      userVoiceChannelId: userVoice,
      botVoiceChannelId: current?.voiceChannelId ?? null,
    });
    return {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      playing: current?.playing ?? false,
      queueLength: current?.queueLength ?? 0,
      badge,
    };
  }
}
