import {
  Channels,
  type GuildEvent,
  GuildEventTypes,
  RedisKeys,
  type TextChannelList,
  type VoiceChannelList,
} from "@narze/shared";
import type Redis from "ioredis";

/** One Guild as the Bot sees it: id plus who is in which voice channel ([userId, channelId]). */
export interface GuildVoiceSnapshot {
  id: string;
  memberCount: number;
  /** The Server Owner now (#141): the Backend trusts this over the user's sign-in snapshot. */
  ownerId: string;
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
    tx.hset(RedisKeys.botGuildOwners, guild.id, guild.ownerId);
    tx.del(RedisKeys.voiceStates(guild.id));
    if (guild.voice.length > 0) tx.hset(RedisKeys.voiceStates(guild.id), Object.fromEntries(guild.voice));
  };

  return {
    /** On ready: the cache is the truth, so anything left from a previous run goes. */
    async replace(guilds: GuildVoiceSnapshot[]): Promise<void> {
      const previous = await redis.smembers(RedisKeys.botGuilds);
      const tx = redis.multi().del(RedisKeys.botGuilds, RedisKeys.botMemberCounts, RedisKeys.botGuildOwners);
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
        .hdel(RedisKeys.botGuildOwners, guildId)
        .del(RedisKeys.voiceStates(guildId), RedisKeys.voiceChannels(guildId), RedisKeys.textChannels(guildId))
        .exec();
    },
    /** A guild changed hands (guildUpdate): the new owner's rights apply at once, the old one's end. */
    async owner(guildId: string, ownerId: string): Promise<void> {
      await redis.hset(RedisKeys.botGuildOwners, guildId, ownerId);
      // Key first, then the event: open tabs re-read their permission (#141).
      const event: GuildEvent = {
        type: GuildEventTypes.ownerUpdate,
        guildId,
        revision: 0,
        sequence: 0,
        ts: Date.now(),
        data: null,
      };
      await redis.publish(Channels.guildEvents, JSON.stringify(event));
    },
    /** The Guild's voice channels and who is in them, for the picker; key first, then the event. */
    async voiceChannels(guildId: string, list: VoiceChannelList): Promise<void> {
      const event: GuildEvent = {
        type: GuildEventTypes.voiceUpdate,
        guildId,
        revision: 0,
        sequence: 0,
        ts: Date.now(),
        data: list,
      };
      await redis
        .multi()
        .set(RedisKeys.voiceChannels(guildId), JSON.stringify(list))
        .publish(Channels.guildEvents, JSON.stringify(event))
        .exec();
    },
    /** Text channels the Bot can post in, for the Music Channel picker and its check (#106). */
    async textChannels(guildId: string, list: TextChannelList): Promise<void> {
      await redis.set(RedisKeys.textChannels(guildId), JSON.stringify(list));
    },
    async voice(guildId: string, userId: string, channelId: string | null): Promise<void> {
      if (channelId) await redis.hset(RedisKeys.voiceStates(guildId), userId, channelId);
      else await redis.hdel(RedisKeys.voiceStates(guildId), userId);
    },
  };
}
