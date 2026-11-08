import { RedisKeys } from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../tokens";
import { UserStore } from "../users/user-store";

/**
 * Presence: a user is active while at least one Dashboard tab holds a socket. The count lives in
 * Redis; the active flag is written to Supabase only on the 0→1 and 1→0 edges.
 */
@Injectable()
export class Presence {
  /** Per-user chain so an open and a close for the same user never write out of order. */
  private readonly chains = new Map<string, Promise<void>>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(UserStore) private readonly store: UserStore,
  ) {}

  open(discordId: string): Promise<void> {
    return this.serial(discordId, async () => {
      const tabs = await this.redis.hincrby(RedisKeys.presence, discordId, 1);
      if (tabs === 1) await this.store.setActive(discordId, true);
    });
  }

  close(discordId: string): Promise<void> {
    return this.serial(discordId, async () => {
      const tabs = await this.redis.hincrby(RedisKeys.presence, discordId, -1);
      if (tabs > 0) return;
      await this.redis.hdel(RedisKeys.presence, discordId);
      await this.store.setActive(discordId, false);
    });
  }

  /** On start: every socket of the previous process is gone. */
  async reset(): Promise<void> {
    await Promise.all([this.redis.del(RedisKeys.presence), this.store.deactivateAll()]);
  }

  private serial(discordId: string, task: () => Promise<void>): Promise<void> {
    const run = (this.chains.get(discordId) ?? Promise.resolve()).then(task, task);
    const settled = run.catch(() => {});
    this.chains.set(discordId, settled);
    void settled.then(() => {
      if (this.chains.get(discordId) === settled) this.chains.delete(discordId);
    });
    return run;
  }
}
