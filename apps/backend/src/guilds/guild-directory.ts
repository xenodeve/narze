import {
  controlPermission,
  type GuildSummary,
  type PlayerSummary,
  PlayerSummarySchema,
  parseJson,
  RedisKeys,
} from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../tokens";
import type { StoredGuild } from "../users/user-store";

/** A GuildSummary from parts already read: the stored guild, its Player and the user's voice channel. */
export function summarize(guild: StoredGuild, player: PlayerSummary | null, userVoice: string | null): GuildSummary {
  const { badge } = controlPermission({
    isServerOwner: guild.isOwner,
    isBotOwner: false,
    hasPlayer: player !== null,
    userVoiceChannelId: userVoice,
    botVoiceChannelId: player?.voiceChannelId ?? null,
  });
  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconUrl,
    playing: player?.playing ?? false,
    queueLength: player?.queueLength ?? 0,
    badge,
  };
}

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

  /** One MGET for every Player summary and one pipelined round trip for the user's voice channels. */
  async summaries(discordId: string, guilds: StoredGuild[]): Promise<GuildSummary[]> {
    if (guilds.length === 0) return [];
    const voice = this.redis.pipeline();
    for (const guild of guilds) voice.hget(RedisKeys.voiceStates(guild.id), discordId);
    const [players, voices] = await Promise.all([
      this.redis.mget(guilds.map((g) => RedisKeys.playerSummary(g.id))),
      voice.exec(),
    ]);
    return guilds.map((guild, i) =>
      summarize(guild, parseJson(PlayerSummarySchema, players[i]), (voices?.[i]?.[1] as string | null) ?? null),
    );
  }

  /** Each listed user's voice channel in one Guild, in one HMGET. */
  async voiceChannels(guildId: string, discordIds: string[]): Promise<Map<string, string | null>> {
    if (discordIds.length === 0) return new Map();
    const channels = await this.redis.hmget(RedisKeys.voiceStates(guildId), ...discordIds);
    return new Map(discordIds.map((id, i) => [id, channels[i] ?? null]));
  }
}
