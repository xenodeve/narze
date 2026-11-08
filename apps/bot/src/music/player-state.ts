import {
  Channels,
  type GuildEvent,
  GuildEventTypes,
  type PlayerState,
  PlayerStateSchema,
  type PlayerSummary,
  RedisKeys,
} from "@narze/shared";
import type Redis from "ioredis";
import type { Track as LavalinkTrack, RepeatMode } from "lavalink-client";
import { toTrack } from "./track";

/** The parts of a lavalink-client Player the Player State is built from. */
export interface PlayerView {
  guildId: string;
  current: LavalinkTrack | null;
  queue: LavalinkTrack[];
  position: number;
  paused: boolean;
  volume: number;
  repeatMode: RepeatMode;
  voiceChannelId: string | null;
}

const LOOP = { off: "off", track: "track", queue: "queue" } as const;

/**
 * The published snapshot of one Guild's Player, or null when any track lacks identity — an
 * Invalid Player State is never published (CONTEXT.md).
 */
export function toPlayerState(
  view: PlayerView,
  extra: {
    revision: number;
    twentyFourSeven: boolean;
    now: number;
    epoch: string;
    lastSeekAt: number | null;
    recovering?: boolean;
  },
): PlayerState | null {
  const current = view.current ? toTrack(view.current) : null;
  if (view.current && !current) return null;
  const queue = view.queue.map(toTrack);
  if (queue.some((t) => t === null)) return null;
  const parsed = PlayerStateSchema.safeParse({
    guildId: view.guildId,
    current,
    positionMs: Math.max(0, Math.round(view.position)),
    syncedAt: extra.now,
    paused: view.paused,
    volume: view.volume,
    loop: LOOP[view.repeatMode] ?? "off",
    twentyFourSeven: extra.twentyFourSeven,
    queue,
    revision: extra.revision,
    epoch: extra.epoch,
    lastSeekAt: extra.lastSeekAt,
    voiceChannelId: view.voiceChannelId,
    ...(extra.recovering ? { recovering: true } : {}),
  });
  return parsed.success ? parsed.data : null;
}

const summaryOf = (state: PlayerState): PlayerSummary => ({
  playing: state.current !== null && !state.paused,
  queueLength: state.queue.length,
  voiceChannelId: state.voiceChannelId,
});

/**
 * Writes the Player State and its summary to Redis, then announces both as Guild events — keys
 * first, so a reader reacting to an event never finds the old value (ADR-0002, ADR-0007).
 */
export type VoiceEventType =
  | typeof GuildEventTypes.voiceDisconnect
  | typeof GuildEventTypes.voiceReconnected
  | typeof GuildEventTypes.voiceReconnectFailed;

export function createPlayerPublisher(redis: Redis) {
  let sequence = 0;
  const event = (type: string, guildId: string, revision: number, data: unknown): string =>
    JSON.stringify({ type, guildId, revision, sequence: sequence++, ts: Date.now(), data } satisfies GuildEvent);

  return {
    async publish(state: PlayerState): Promise<void> {
      const summary = summaryOf(state);
      await redis
        .multi()
        .set(RedisKeys.playerState(state.guildId), JSON.stringify(state))
        .set(RedisKeys.playerSummary(state.guildId), JSON.stringify(summary))
        .publish(Channels.guildEvents, event(GuildEventTypes.playerState, state.guildId, state.revision, state))
        .publish(Channels.guildEvents, event(GuildEventTypes.playerSummary, state.guildId, state.revision, summary))
        .exec();
    },
    /** A voice drop and how recovering from it went (spec #28); drawn by the Dashboard, not cached. */
    async voice(guildId: string, type: VoiceEventType, data: Record<string, unknown>): Promise<void> {
      await redis.publish(Channels.guildEvents, event(type, guildId, 0, data));
    },
    /** Announces that a queued track is about to play now, before the queue update (spec #39). */
    async jump(guildId: string, revision: number, data: { fromIndex: number; title: string }): Promise<void> {
      await redis.publish(Channels.guildEvents, event(GuildEventTypes.queueJump, guildId, revision, data));
    },
    /**
     * On start: no Player survives a Bot restart until Queue Recovery (#103), so any state a
     * previous process left is removed and announced as gone, or the Backend would keep serving it.
     */
    async sweep(): Promise<void> {
      const prefix = RedisKeys.playerState("");
      const stale = new Set<string>();
      for await (const keys of redis.scanStream({ match: `${prefix}*`, count: 100 })) {
        for (const key of keys as string[]) stale.add(key.slice(prefix.length));
      }
      for (const guildId of stale) await this.gone(guildId);
    },
    async gone(guildId: string): Promise<void> {
      await redis
        .multi()
        .del(RedisKeys.playerState(guildId), RedisKeys.playerSummary(guildId))
        .publish(Channels.guildEvents, event(GuildEventTypes.playerGone, guildId, 0, null))
        .exec();
    },
  };
}

export type PlayerPublisher = ReturnType<typeof createPlayerPublisher>;
