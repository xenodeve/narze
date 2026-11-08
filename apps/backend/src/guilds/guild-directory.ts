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

/** What the Bot publishes about one Guild for one user, read from Redis. */
export interface GuildLive {
  player: PlayerSummary | null;
  userVoice: string | null;
  memberCount: number | null;
}

/** A GuildSummary from parts already read: the stored guild and what the Bot reported about it. */
export function summarize(guild: StoredGuild, { player, userVoice, memberCount }: GuildLive): GuildSummary {
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
    memberCount,
    playing: player?.playing ?? false,
    queueLength: player?.queueLength ?? 0,
    badge,
  };
}

const toCount = (raw: string | null | undefined) => (raw == null ? null : Number(raw));

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

  /** One MGET for the Player summaries, one HMGET for member counts, one pipeline for voice channels. */
  async summaries(discordId: string, guilds: StoredGuild[]): Promise<GuildSummary[]> {
    if (guilds.length === 0) return [];
    const ids = guilds.map((g) => g.id);
    const voice = this.redis.pipeline();
    for (const id of ids) voice.hget(RedisKeys.voiceStates(id), discordId);
    const [players, counts, voices] = await Promise.all([
      this.redis.mget(ids.map((id) => RedisKeys.playerSummary(id))),
      this.redis.hmget(RedisKeys.botMemberCounts, ...ids),
      voice.exec(),
    ]);
    return guilds.map((guild, i) =>
      summarize(guild, {
        player: parseJson(PlayerSummarySchema, players[i]),
        userVoice: (voices?.[i]?.[1] as string | null) ?? null,
        memberCount: toCount(counts[i]),
      }),
    );
  }

  async memberCount(guildId: string): Promise<number | null> {
    return toCount(await this.redis.hget(RedisKeys.botMemberCounts, guildId));
  }

  /** Each listed user's voice channel in one Guild, in one HMGET. */
  async voiceChannels(guildId: string, discordIds: string[]): Promise<Map<string, string | null>> {
    if (discordIds.length === 0) return new Map();
    const channels = await this.redis.hmget(RedisKeys.voiceStates(guildId), ...discordIds);
    return new Map(discordIds.map((id, i) => [id, channels[i] ?? null]));
  }
}
