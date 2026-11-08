import {
  type AvatarOutfit,
  type ControlPermission,
  controlPermission,
  type GuildSummary,
  type PlayerSummary,
  PlayerSummarySchema,
  parseJson,
  RedisKeys,
  type VoiceChannelList,
  VoiceChannelListSchema,
} from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { SettingsStore } from "../settings/settings-store";
import { REDIS } from "../tokens";
import type { StoredGuild } from "../users/user-store";

/** What the Bot publishes about one Guild for one user, read from Redis. */
export interface GuildLive {
  player: PlayerSummary | null;
  userVoice: string | null;
  memberCount: number | null;
}

/** The ladder for one user from parts already read (Bot Owner joins with guild settings, #106). */
export function permissionOf(
  guild: StoredGuild,
  player: PlayerSummary | null,
  userVoice: string | null,
  isBotOwner: boolean,
): ControlPermission {
  return controlPermission({
    isServerOwner: guild.isOwner,
    isBotOwner,
    hasPlayer: player !== null,
    userVoiceChannelId: userVoice,
    botVoiceChannelId: player?.voiceChannelId ?? null,
  });
}

/** A GuildSummary from parts already read: the stored guild and what the Bot reported about it. */
export function summarize(
  guild: StoredGuild,
  { player, userVoice, memberCount }: GuildLive,
  settings: { isBotOwner: boolean; avatar?: AvatarOutfit },
): GuildSummary {
  const { badge } = permissionOf(guild, player, userVoice, settings.isBotOwner);
  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconUrl,
    memberCount,
    playing: player?.playing ?? false,
    queueLength: player?.queueLength ?? 0,
    badge,
    ...(settings.avatar ? { avatar: settings.avatar } : {}),
  };
}

const toCount = (raw: string | null | undefined) => (raw == null ? null : Number(raw));

/** Joins a user's guild snapshot with what the Bot publishes on Redis (ADR-0002). */
@Injectable()
export class GuildDirectory {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SettingsStore) private readonly settings: SettingsStore,
  ) {}

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
    const [players, counts, voices, settings] = await Promise.all([
      this.redis.mget(ids.map((id) => RedisKeys.playerSummary(id))),
      this.redis.hmget(RedisKeys.botMemberCounts, ...ids),
      voice.exec(),
      this.settings.cachedMany(ids),
    ]);
    return guilds.map((guild, i) => {
      const stored = settings.get(guild.id);
      return summarize(
        guild,
        {
          player: parseJson(PlayerSummarySchema, players[i]),
          userVoice: (voices?.[i]?.[1] as string | null) ?? null,
          memberCount: toCount(counts[i]),
        },
        { isBotOwner: stored?.ownerId === discordId, avatar: stored?.avatar },
      );
    });
  }

  async memberCount(guildId: string): Promise<number | null> {
    return toCount(await this.redis.hget(RedisKeys.botMemberCounts, guildId));
  }

  /** Each listed user's voice channel in one Guild, in one HMGET. */
  async userVoices(guildId: string, discordIds: string[]): Promise<Map<string, string | null>> {
    if (discordIds.length === 0) return new Map();
    const channels = await this.redis.hmget(RedisKeys.voiceStates(guildId), ...discordIds);
    return new Map(discordIds.map((id, i) => [id, channels[i] ?? null]));
  }

  async playerSummary(guildId: string): Promise<PlayerSummary | null> {
    return parseJson(PlayerSummarySchema, await this.redis.get(RedisKeys.playerSummary(guildId)));
  }

  /** Control Permission of one user in one Guild, plus the voice channel they are in. */
  async permission(discordId: string, guild: StoredGuild): Promise<ControlPermission & { userVoice: string | null }> {
    const [player, userVoice, settings] = await Promise.all([
      this.playerSummary(guild.id),
      this.redis.hget(RedisKeys.voiceStates(guild.id), discordId),
      this.settings.cached(guild.id),
    ]);
    // Bot Owner: whoever invited the Bot, from Guild Settings (#106, spec #121).
    return { ...permissionOf(guild, player, userVoice, settings?.ownerId === discordId), userVoice };
  }

  /** The Guild's voice channels with members, as the Bot last published them (spec #86). */
  async voiceChannelList(guildId: string): Promise<VoiceChannelList> {
    return parseJson(VoiceChannelListSchema, await this.redis.get(RedisKeys.voiceChannels(guildId))) ?? [];
  }
}
