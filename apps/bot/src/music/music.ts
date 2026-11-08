import type { Requester, Track } from "@narze/shared";
import { moveTrack } from "@narze/shared";
import type { LavalinkManager, Track as LavalinkTrack, Player, RepeatMode } from "lavalink-client";
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
  /** Play next: insert at the head of the queue instead of the end (#101). */
  next?: boolean;
  /** /playat: 0-based index in the upcoming queue (#102). */
  position?: number;
  /** /skipplay: play it now, dropping the current track and keeping the queue (#102). */
  skipplay?: boolean;
}

export type PlayResult =
  | { kind: "started"; track: Track }
  | { kind: "queued"; track: Track; position: number }
  | { kind: "error"; reason: "empty" | "unsupported" | "not-found" | "failed" };

export interface MusicOptions {
  lavalink: LavalinkManager;
  /** Identifies this Bot process in every Player State (ADR-0007); a restart picks a new one. */
  epoch?: string;
  /** Title of a Spotify URL from its public oEmbed, for links Lavalink cannot resolve (spec #70). */
  oembedTitle?: (url: string) => Promise<string | null>;
  publisher: Pick<PlayerPublisher, "publish" | "gone" | "jump">;
  /** Posts a Now-Playing Notice in a text channel. */
  announce: (channelId: string, notice: Notice) => Promise<void>;
  now?: () => number;
}

// Per-player data keys (lavalink-client player.set/get).
const CYCLE: Record<RepeatMode, RepeatMode> = { off: "track", track: "queue", queue: "off" };
const FLAGS = "narze.flags";
const REVISION = "narze.revision";
const TEXT_CHANNEL = "narze.textChannelId";
const ADDED_AT = "addedAt";
const LAST_SEEK = "narze.lastSeekAt";

/**
 * Publishing is best-effort: playback must go on when Redis is down (ADR-0003), and lavalink-client
 * does not await its event handlers, where a rejection would exit Bun.
 */
const warn = (what: string) => (error: unknown) =>
  console.warn(`[bot] ${what}: ${error instanceof Error ? error.message : String(error)}`);

const flagsOf = (player: Player): AnnounceFlags => player.get<AnnounceFlags | undefined>(FLAGS) ?? NO_FLAGS;
const addedAtOf = (track: LavalinkTrack): number | undefined =>
  (track.userData as Record<string, unknown> | undefined)?.[ADDED_AT] as number | undefined;

/**
 * The Bot's music engine over lavalink-client: commands call it, and every change it makes is
 * published as a Player State (ADR-0002) and, on track start, maybe announced (spec #23–#25).
 */
/** v5: GET https://open.spotify.com/oembed?url=<url>, title with " - " replaced by a space (spec #70). */
async function spotifyOembedTitle(url: string): Promise<string | null> {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { title?: unknown } | null;
  return typeof body?.title === "string" ? body.title : null;
}

export function createMusic({
  lavalink,
  publisher,
  announce,
  epoch = crypto.randomUUID(),
  oembedTitle = spotifyOembedTitle,
  now = Date.now,
}: MusicOptions) {
  const sourceManagers = () => lavalink.nodeManager.leastUsedNodes()[0]?.info?.sourceManagers ?? [];

  /** Every queue mutation bumps the Queue Revision (ADR-0007). */
  const bump = (player: Player) => player.set(REVISION, (player.get<number | undefined>(REVISION) ?? 0) + 1);

  async function publish(player: Player): Promise<void> {
    // A destroyed player (/leave while a track start was being handled) must not come back.
    if (lavalink.getPlayer(player.guildId) !== player) return;
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
      {
        revision: player.get<number | undefined>(REVISION) ?? 0,
        twentyFourSeven: false,
        now: now(),
        epoch,
        lastSeekAt: player.get<number | undefined>(LAST_SEEK) ?? null,
      },
    );
    // An Invalid Player State is never published.
    if (state) await publisher.publish(state).catch(warn("publish Player State"));
  }

  async function search(player: Player, query: string, requester: Requester) {
    const resolved = resolveQuery(query, sourceManagers());
    if (!resolved.ok) return { error: resolved.reason } as const;
    const isSpotifyLink = /spotify\.com\//i.test(resolved.query);
    // lavalink-client refuses a Spotify link outright when the node has no Spotify source.
    let result = await player
      .search(
        resolved.source ? { query: resolved.query, source: resolved.source } : { query: resolved.query },
        requester,
      )
      .catch((error: unknown) => {
        if (isSpotifyLink) return { tracks: [] as unknown[] };
        throw error;
      });
    // Spec #70: a Spotify link the node cannot resolve is searched again by its oEmbed title.
    if (result.tracks.length === 0 && isSpotifyLink) {
      const title = await oembedTitle(resolved.query);
      const text = title ? resolveQuery(title.replace(" - ", " "), sourceManagers()) : null;
      if (text?.ok) {
        result = await player.search(
          text.source ? { query: text.query, source: text.source } : { query: text.query },
          requester,
        );
      }
    }
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

  async function onTrackStart(player: Player, track: LavalinkTrack | null): Promise<void> {
    if (!track) return;
    const addedAt = addedAtOf(track);
    // Spec #26 — swap a stale track as soon as it starts (v5 only fixed the metadata and kept
    // playing the stale one). The first moment of the old stream can still be heard.
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
    // Spec #25: the per-track flags last one track (terminal playback keeps its flag).
    player.set(FLAGS, { ...NO_FLAGS, terminal: flags.terminal });
    player.set(LAST_SEEK, undefined);
    // Decide on the queue as it was when the track started; a /play during the publish must not count.
    const shown = toTrack(track);
    const announceIt = shown !== null && shouldAnnounce(flags, player.queue.tracks.length);
    // The Dashboard first; the Discord notice is a slower round trip.
    await publish(player);
    if (shown && announceIt) {
      const channel = player.get<string | undefined>(TEXT_CHANNEL) ?? player.textChannelId;
      if (channel) await announce(channel, nowPlayingNotice(shown)).catch(warn("now-playing notice"));
    }
  }

  lavalink.on("trackStart", (player, track) => {
    onTrackStart(player, track as LavalinkTrack | null).catch(warn("track start"));
  });
  lavalink.on("queueEnd", (player) => void publish(player));
  lavalink.on("playerDestroy", (player) => {
    publisher.gone(player.guildId).catch(warn("publish player gone"));
  });

  const existing = (guildId: string) => lavalink.getPlayer(guildId) ?? null;

  /** One /play per Guild at a time: two at once could both see an idle player and both start. */
  const locks = new Map<string, Promise<unknown>>();
  function serial<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    const run = (locks.get(guildId) ?? Promise.resolve()).then(task, task);
    const settled = run.catch(() => {});
    locks.set(guildId, settled);
    void settled.then(() => {
      if (locks.get(guildId) === settled) locks.delete(guildId);
    });
    return run;
  }

  async function startOrQueue(request: PlayRequest): Promise<PlayResult> {
    const fresh = !existing(request.guildId);
    const player = playerFor(request);
    // A player created for this request must not outlive a request that plays nothing.
    const abandon = async (result: PlayResult): Promise<PlayResult> => {
      if (fresh && !player.queue.current) await player.destroy();
      return result;
    };
    let found: Awaited<ReturnType<typeof search>>;
    try {
      found = await search(player, request.query, request.requester);
    } catch {
      return abandon({ kind: "error", reason: "failed" });
    }
    if ("error" in found) return abandon({ kind: "error", reason: found.error ?? "failed" });
    const first = found.tracks[0];
    const shown = first ? toTrack(first) : null;
    if (!first || !shown) return abandon({ kind: "error", reason: "not-found" });
    if (!player.connected) await player.connect();
    // Where in the upcoming queue: /playnext and play-next at the head, /playat at its 0-based index
    // (clamped to the end, as v5 did), otherwise the end.
    const at = request.next ? 0 : request.position;
    if (player.queue.current) {
      if (request.skipplay) {
        // /skipplay: the new track plays now, the current one is dropped, the queue stays (spec #7).
        await player.queue.add(first, 0);
        bump(player);
        player.set(FLAGS, { ...flagsOf(player), skipplay: true });
        await player.skip();
        return { kind: "started", track: shown };
      }
      const index = at === undefined ? undefined : Math.min(at, player.queue.tracks.length);
      await player.queue.add(first, index);
      bump(player);
      await publish(player);
      return { kind: "queued", track: shown, position: (index ?? player.queue.tracks.length - 1) + 1 };
    }
    // From idle, /play announces in its own reply; /playnext, /playat and /skipplay never post a notice (spec #24).
    const placed = at !== undefined || request.skipplay;
    player.set(FLAGS, { ...NO_FLAGS, firstFromCommand: !placed, dontShow: Boolean(placed) });
    await player.queue.add(first);
    await player.play();
    return { kind: "started", track: shown };
  }

  return {
    play(request: PlayRequest): Promise<PlayResult> {
      return serial(request.guildId, () => startOrQueue(request));
    },

    /** v5 parity: "previous" restarts the current track; there is no history (spec #107). */
    async previous(guildId: string): Promise<boolean> {
      const player = existing(guildId);
      if (!player?.queue.current) return false;
      await player.seek(0);
      player.set(LAST_SEEK, now());
      await publish(player);
      return true;
    },

    /** Sets a loop mode, or with null cycles off → track → queue → off (spec #47). */
    async setLoop(guildId: string, mode: RepeatMode | null): Promise<RepeatMode | null> {
      const player = existing(guildId);
      if (!player) return null;
      const next = mode ?? CYCLE[player.repeatMode];
      await player.setRepeatMode(next);
      await publish(player);
      return next;
    },

    async shuffle(guildId: string): Promise<boolean> {
      const player = existing(guildId);
      if (!player || player.queue.tracks.length < 2) return false;
      await player.queue.shuffle();
      bump(player);
      await publish(player);
      return true;
    },

    /** Spec #46 move inside the upcoming queue; false when an index is out of range. */
    async move(guildId: string, from: number, to: number): Promise<boolean> {
      const player = existing(guildId);
      if (!player) return false;
      const tracks = player.queue.tracks as LavalinkTrack[];
      const next = moveTrack(tracks, from, to);
      if (!next) return false;
      await player.queue.splice(0, tracks.length, next);
      bump(player);
      await publish(player);
      return true;
    },

    async remove(guildId: string, index: number): Promise<boolean> {
      const player = existing(guildId);
      if (!player || index < 0 || index >= player.queue.tracks.length) return false;
      await player.queue.splice(index, 1);
      bump(player);
      await publish(player);
      return true;
    },

    async clear(guildId: string): Promise<boolean> {
      const player = existing(guildId);
      if (!player) return false;
      await player.queue.splice(0, player.queue.tracks.length);
      bump(player);
      await publish(player);
      return true;
    },

    /** Drops the queued tracks before `index` and plays that one (the next start bumps the revision). */
    async skipTo(guildId: string, index: number): Promise<boolean> {
      const player = existing(guildId);
      if (!player?.queue.current || index < 0 || index >= player.queue.tracks.length) return false;
      if (index > 0) await player.queue.splice(0, index);
      bump(player);
      player.set(FLAGS, { ...flagsOf(player), skip: true });
      await player.skip();
      return true;
    },

    /**
     * Plays a queued track now and keeps the rest in order. The jump is announced first so the
     * Dashboard can animate it before the list changes (spec #39); no notice for it (spec #24).
     */
    async playNow(guildId: string, index: number): Promise<boolean> {
      const player = existing(guildId);
      const track = player?.queue.tracks[index] as LavalinkTrack | undefined;
      if (!player?.queue.current || !track) return false;
      await publisher
        .jump(guildId, player.get<number | undefined>(REVISION) ?? 0, { fromIndex: index, title: track.info.title })
        .catch(warn("publish queue jump"));
      await player.queue.splice(index, 1);
      await player.queue.add(track, 0);
      bump(player);
      player.set(FLAGS, { ...flagsOf(player), dontShow: true });
      await player.skip();
      return true;
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
      player.set(LAST_SEEK, now());
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
        loop: player.repeatMode,
        queue: (player.queue.tracks as LavalinkTrack[]).map(toTrack).filter((t): t is Track => t !== null),
      };
    },
  };
}

export type Music = ReturnType<typeof createMusic>;
