import { RedisKeys } from "@narze/shared";
import type Redis from "ioredis";

/** One Guild as the Bot sees it: id plus who is in which voice channel ([userId, channelId]). */
export interface GuildVoiceSnapshot {
  id: string;
  memberCount: number;
  voice: Array<[userId: string, channelId: string]>;
}

/**
 * Mirrors the Bot's guild set and voice states into Redis so the Backend can list Mutual Guilds
 * and evaluate Control Permission without asking the Bot (ADR-0002). Connected Mode only.
 */
export function createGuildRegistry(redis: Redis) {
  const writeGuild = (tx: ReturnType<Redis["multi"]>, guild: GuildVoiceSnapshot) => {
    tx.sadd(RedisKeys.botGuilds, guild.id);
    tx.hset(RedisKeys.botMemberCounts, guild.id, guild.memberCount);
    tx.del(RedisKeys.voiceStates(guild.id));
    if (guild.voice.length > 0) tx.hset(RedisKeys.voiceStates(guild.id), Object.fromEntries(guild.voice));
  };

  return {
    /** On ready: the cache is the truth, so anything left from a previous run goes. */
    async replace(guilds: GuildVoiceSnapshot[]): Promise<void> {
      const previous = await redis.smembers(RedisKeys.botGuilds);
      const tx = redis.multi().del(RedisKeys.botGuilds, RedisKeys.botMemberCounts);
      for (const id of previous) tx.del(RedisKeys.voiceStates(id));
      for (const guild of guilds) writeGuild(tx, guild);
      await tx.exec();
    },
    async add(guild: GuildVoiceSnapshot): Promise<void> {
      const tx = redis.multi();
      writeGuild(tx, guild);
      await tx.exec();
    },
    async remove(guildId: string): Promise<void> {
      await redis
        .multi()
        .srem(RedisKeys.botGuilds, guildId)
        .hdel(RedisKeys.botMemberCounts, guildId)
        .del(RedisKeys.voiceStates(guildId))
        .exec();
    },
    async voice(guildId: string, userId: string, channelId: string | null): Promise<void> {
      if (channelId) await redis.hset(RedisKeys.voiceStates(guildId), userId, channelId);
      else await redis.hdel(RedisKeys.voiceStates(guildId), userId);
    },
  };
}
