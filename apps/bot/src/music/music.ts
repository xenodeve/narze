import type { Requester, Track } from "@narze/shared";
import type { LavalinkManager, Track as LavalinkTrack, Player } from "lavalink-client";
import { type AnnounceFlags, NO_FLAGS, nowPlayingNotice, shouldAnnounce } from "./announce";
import type { Notice } from "./format";
import { type PlayerPublisher, toPlayerState } from "./player-state";
import { resolveQuery } from "./query";
import { toTrack } from "./track";

/** Spec #6/#19: a new Player starts at volume 15. */
export const DEFAULT_VOLUME = 15;
/** Spec #26: a queued track resolved longer ago than this is resolved again before it plays. */
export const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

export interface PlayRequest {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  query: string;
  requester: Requester;
}

export type PlayResult =
  | { kind: "started"; track: Track }
  | { kind: "queued"; track: Track; position: number }
  | { kind: "error"; reason: "empty" | "unsupported" | "not-found" | "failed" };

export interface MusicOptions {
  lavalink: LavalinkManager;
  publisher: PlayerPublisher;
  /** Posts a Now-Playing Notice in a text channel. */
  announce: (channelId: string, notice: Notice) => Promise<void>;
  now?: () => number;
}

// Per-player data keys (lavalink-client player.set/get).
const FLAGS = "narze.flags";
const REVISION = "narze.revision";
const TEXT_CHANNEL = "narze.textChannelId";
const ADDED_AT = "addedAt";

const flagsOf = (player: Player): AnnounceFlags => player.get<AnnounceFlags | undefined>(FLAGS) ?? NO_FLAGS;
const addedAtOf = (track: LavalinkTrack): number | undefined =>
  (track.userData as Record<string, unknown> | undefined)?.[ADDED_AT] as number | undefined;

/**
 * The Bot's music engine over lavalink-client: commands call it, and every change it makes is
 * published as a Player State (ADR-0002) and, on track start, maybe announced (spec #23–#25).
 */
export function createMusic({ lavalink, publisher, announce, now = Date.now }: MusicOptions) {
  const sourceManagers = () => lavalink.nodeManager.leastUsedNodes()[0]?.info?.sourceManagers ?? [];

  /** Every queue mutation bumps the Queue Revision (ADR-0007). */
  const bump = (player: Player) => player.set(REVISION, (player.get<number | undefined>(REVISION) ?? 0) + 1);

  async function publish(player: Player): Promise<void> {
    const state = toPlayerState(
      {
        guildId: player.guildId,
        current: player.queue.current,
        queue: player.queue.tracks as LavalinkTrack[],
        position: player.position,
        paused: player.paused,
        volume: player.volume,
        repeatMode: player.repeatMode,
        voiceChannelId: player.voiceChannelId,
      },
      { revision: player.get<number | undefined>(REVISION) ?? 0, twentyFourSeven: false, now: now() },
    );
    // An Invalid Player State is never published.
    if (state) await publisher.publish(state);
  }

  async function search(player: Player, query: string, requester: Requester) {
    const resolved = resolveQuery(query, sourceManagers());
    if (!resolved.ok) return { error: resolved.reason } as const;
    const result = await player.search(
      resolved.source ? { query: resolved.query, source: resolved.source } : { query: resolved.query },
      requester,
    );
    const tracks = result.tracks as LavalinkTrack[];
    for (const track of tracks) track.userData = { ...track.userData, [ADDED_AT]: now() };
    return { tracks } as const;
  }

  function playerFor(request: Pick<PlayRequest, "guildId" | "voiceChannelId" | "textChannelId">): Player {
    const existing = lavalink.getPlayer(request.guildId);
    if (existing) return existing;
    const player = lavalink.createPlayer({
      guildId: request.guildId,
      voiceChannelId: request.voiceChannelId,
      textChannelId: request.textChannelId,
      selfDeaf: true,
      selfMute: false,
      volume: DEFAULT_VOLUME,
    });
    player.set(TEXT_CHANNEL, request.textChannelId);
    return player;
  }

  lavalink.on("trackStart", async (player, track) => {
    if (!track) return;
    const addedAt = addedAtOf(track);
    // Spec #26 — re-resolve before it is heard (v5 only fixed the metadata, after playback began).
    if (addedAt !== undefined && now() - addedAt > STALE_AFTER_MS && track.info.uri) {
      const fresh = await player.search({ query: track.info.uri }, track.requester);
      const replacement = fresh.tracks[0] as LavalinkTrack | undefined;
      if (replacement) {
        replacement.userData = { ...track.userData, [ADDED_AT]: now() };
        await player.play({ clientTrack: replacement });
        return;
      }
    }
    bump(player);
    const flags = { ...flagsOf(player), trackLoop: player.repeatMode === "track" };
    const shown = toTrack(track);
    if (shown && shouldAnnounce(flags, player.queue.tracks.length)) {
      const channel = player.get<string | undefined>(TEXT_CHANNEL) ?? player.textChannelId;
      if (channel) await announce(channel, nowPlayingNotice(shown)).catch(() => {});
    }
    // Spec #25: the per-track flags last one track (terminal playback keeps its flag).
    player.set(FLAGS, { ...NO_FLAGS, terminal: flagsOf(player).terminal });
    await publish(player);
  });
  lavalink.on("queueEnd", (player) => void publish(player));
  lavalink.on("playerDestroy", (player) => void publisher.gone(player.guildId));

  const existing = (guildId: string) => lavalink.getPlayer(guildId) ?? null;

  return {
    async play(request: PlayRequest): Promise<PlayResult> {
      const player = playerFor(request);
      const found = await search(player, request.query, request.requester);
      if ("error" in found) return { kind: "error", reason: found.error ?? "failed" };
      const first = found.tracks[0];
      const shown = first ? toTrack(first) : null;
      if (!first || !shown) {
        if (!player.queue.current) await player.destroy();
        return { kind: "error", reason: "not-found" };
      }
      if (!player.connected) await player.connect();
      if (player.queue.current) {
        await player.queue.add(first);
        bump(player);
        await publish(player);
        return { kind: "queued", track: shown, position: player.queue.tracks.length };
      }
      player.set(FLAGS, { ...NO_FLAGS, firstFromCommand: true });
      await player.queue.add(first);
      await player.play();
      return { kind: "started", track: shown };
    },

    /** Toggles pause; null when nothing is playing. */
    async togglePause(guildId: string): Promise<{ paused: boolean; track: Track | null } | null> {
      const player = existing(guildId);
      if (!player?.queue.current) return null;
      if (player.paused) await player.resume();
      else await player.pause();
      await publish(player);
      return { paused: player.paused, track: toTrack(player.queue.current) };
    },

    /** Spec #10: with nothing queued, /skip ends playback (24/7 lands in #103). */
    async skip(guildId: string): Promise<{ kind: "skipped" } | { kind: "ended" } | null> {
      const player = existing(guildId);
      if (!player?.queue.current) return null;
      if (player.queue.tracks.length === 0) {
        await player.destroy();
        return { kind: "ended" };
      }
      player.set(FLAGS, { ...flagsOf(player), skip: true });
      await player.skip();
      return { kind: "skipped" };
    },

    async seek(guildId: string, positionMs: number): Promise<boolean> {
      const player = existing(guildId);
      if (!player?.queue.current) return false;
      await player.seek(positionMs);
      await publish(player);
      return true;
    },

    async setVolume(guildId: string, volume: number): Promise<boolean> {
      const player = existing(guildId);
      if (!player) return false;
      await player.setVolume(volume);
      await publish(player);
      return true;
    },

    /** Joins (or moves to) a voice channel without playing (spec #11). */
    async join(request: Pick<PlayRequest, "guildId" | "voiceChannelId" | "textChannelId">) {
      const current = existing(request.guildId);
      if (current?.voiceChannelId === request.voiceChannelId && current.connected) return "already" as const;
      // v5 moved by destroy + recreate, losing the queue; kept for parity until queue handling (#102).
      if (current) await current.destroy();
      await playerFor(request).connect();
      return current ? ("moved" as const) : ("joined" as const);
    },

    async leave(guildId: string): Promise<boolean> {
      const player = existing(guildId);
      if (!player) return false;
      await player.destroy();
      return true;
    },

    /** What a command needs to check before acting. */
    status(guildId: string) {
      const player = existing(guildId);
      if (!player) return null;
      return {
        voiceChannelId: player.voiceChannelId,
        current: player.queue.current ? toTrack(player.queue.current) : null,
        playing: Boolean(player.queue.current) && !player.paused,
        paused: player.paused,
        volume: player.volume,
        positionMs: player.position,
      };
    },
  };
}

export type Music = ReturnType<typeof createMusic>;
