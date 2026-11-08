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
  extra: { revision: number; twentyFourSeven: boolean; now: number },
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
    voiceChannelId: view.voiceChannelId,
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
