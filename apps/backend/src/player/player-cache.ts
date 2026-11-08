import { type PlayerState, PlayerStateSchema, parseJson, RedisKeys } from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../tokens";

/** Guilds kept in memory; the least recently used is dropped first. */
const CAPACITY = 500;

/**
 * Hot Cache tier 1 (ADR-0006): an in-process LRU of Player States in front of the Redis keys the
 * Bot writes. Guild events keep it current, so a page load costs no Redis read once a Guild has
 * played, and never a call to the Bot. Never authoritative: a miss falls back to Redis.
 */
@Injectable()
export class PlayerCache {
  /** Map iteration order is insertion order, so re-inserting on use makes the first key the LRU. */
  private readonly entries = new Map<string, PlayerState | null>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get(guildId: string): Promise<PlayerState | null> {
    if (this.entries.has(guildId)) {
      const hit = this.entries.get(guildId) ?? null;
      this.remember(guildId, hit);
      return hit;
    }
    const stored = parseJson(PlayerStateSchema, await this.redis.get(RedisKeys.playerState(guildId)));
    this.remember(guildId, stored);
    return stored;
  }

  /** From a `player:state` Guild event; an older revision than the cached one is ignored (ADR-0007). */
  apply(state: PlayerState): void {
    const cached = this.entries.get(state.guildId);
    if (cached && state.revision < cached.revision) return;
    this.remember(state.guildId, state);
  }

  /** From a `player:gone` Guild event. */
  clear(guildId: string): void {
    this.remember(guildId, null);
  }

  private remember(guildId: string, state: PlayerState | null): void {
    this.entries.delete(guildId);
    this.entries.set(guildId, state);
    if (this.entries.size > CAPACITY) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
