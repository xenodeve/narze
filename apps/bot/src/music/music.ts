import type { Requester, Track } from "@narze/shared";
import { GuildEventTypes, moveTrack, type VoiceEventType } from "@narze/shared";
import { createTtlCache } from "@narze/shared/ttl-cache";
import type { LavalinkManager, Track as LavalinkTrack, Player, RepeatMode } from "lavalink-client";
import { type AnnounceFlags, NO_FLAGS, nowPlayingNotice, recoveryNotice, shouldAnnounce } from "./announce";
import type { Artwork } from "./artwork";
import { type Choice, createSuggester } from "./autocomplete";
import type { Notice } from "./format";
import { type PlayerPublisher, toPlayerState } from "./player-state";
import { playlistDisplayName, resolveQuery } from "./query";
import type { QueueSnapshot, SnapshotStore, StoredTrack } from "./queue-snapshot";
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
  /**
   * Operator console (#112, spec #119): this Player posts nothing to Discord for the rest of its
   * session, whoever queues next. Ends when the Player is gone.
   */
  silent?: boolean;
}

/** A playlist added by one play request (spec #4): what the reply shows. */
export interface AddedPlaylist {
  name: string;
  url: string;
  count: number;
  durationMs: number;
  thumbnail: string | null;
  /** The playlist display icon (spec #67 `playlist_display`). */
  icon?: string;
}

/** How long a reply or notice waits for a lookup before it goes out with the fallback. */
const ICON_WAIT_MS = 1500;
/** Resolves with the promise, or rejects once `ms` have passed. */
const within = <T>(ms: number, promise: Promise<T>): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export type PlayResult =
  | { kind: "started"; track: Track }
  | { kind: "queued"; track: Track; position: number }
  | { kind: "playlist"; playlist: AddedPlaylist; started: boolean; firstPosition: number }
  | { kind: "error"; reason: "empty" | "unsupported" | "not-found" | "failed" };

export interface MusicOptions {
  lavalink: LavalinkManager;
  /** Identifies this Bot process in every Player State (ADR-0007); a restart picks a new one. */
  epoch?: string;
  /** Title of a Spotify URL from its public oEmbed, for links Lavalink cannot resolve (spec #70). */
  oembedTitle?: (url: string) => Promise<string | null>;
  publisher: Pick<PlayerPublisher, "publish" | "gone" | "jump" | "voice">;
  /** Posts a notice in a text channel; `false` when that channel cannot take it. */
  announce: (channelId: string, notice: Notice) => Promise<boolean | void>;
  now?: () => number;
  /** Queue Snapshots for Queue Recovery (#103); without it nothing is written or restored. */
  snapshots?: SnapshotStore;
  /** Pictures and the author icon (spec #62–#67); without it Lavalink's artwork and the avatar are used. */
  artwork?: Pick<Artwork, "trackArt" | "playlistArt" | "icon">;
  /** Spec #68 `use_playlist_url`: a playlist track's notice links to the playlist, not the track. */
  usePlaylistUrl?: boolean;
  /** Spec #12: the Guild's Music Channel, where notices go instead of the command's channel. */
  noticeChannel?: (guildId: string) => string | null;
  /** Spec #28: wait before reconnecting after a voice drop, then before seeking back. */
  voiceRetryMs?: [number, number];
  /** #108: Listening Sessions and Play History hear every track start and the Player leaving. */
  history?: {
    /** `recovered`: Queue Recovery restarted this track; it is not a new play. */
    trackStarted(guildId: string, track: Track, voiceChannelId: string | null, recovered: boolean): void;
    playerGone(guildId: string): void;
  };
}

/** Spec #28: Discord voice close codes worth reconnecting on (plus any close from Discord's side). */
const RECOVERABLE_VOICE_CODES = new Set([4006, 4009, 4014, 4015]);

// Per-player data keys (lavalink-client player.set/get).
const CYCLE: Record<RepeatMode, RepeatMode> = { off: "track", track: "queue", queue: "off" };
const FLAGS = "narze.flags";
const REVISION = "narze.revision";
const TEXT_CHANNEL = "narze.textChannelId";
const ADDED_AT = "addedAt";
/** Track userData: the playlist a track was added from (spec #66). */
const PLAYLIST = "playlist";
/** Track userData: the resolved picture (spec #62/#63), null when none checked out. */
const ARTWORK = "artworkUrl";
const LAST_SEEK = "narze.lastSeekAt";
/** 24/7 (spec #10, #27): the Player stays in voice as an Idle Player when the queue ends. */
const TWENTY_FOUR_SEVEN = "narze.twentyFourSeven";
/** Queue Recovery is restoring this Player; the track start that follows clears it. */
const RECOVERING = "narze.recovering";

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

/** The outcome of a queue edit that names its track (#102). */
export type QueueEdit = "ok" | "invalid-index" | "stale";

export function createMusic({
  lavalink,
  publisher,
  announce,
  epoch = crypto.randomUUID(),
  oembedTitle = spotifyOembedTitle,
  now = Date.now,
  snapshots,
  voiceRetryMs = [1000, 500],
  artwork,
  usePlaylistUrl = false,
  noticeChannel = () => null,
  history,
}: MusicOptions) {
  /**
   * Spec #12: a notice goes to the Guild's Music Channel; when that channel cannot take it (deleted,
   * or the Bot lost Send Messages) it falls back to the channel the command came from.
   */
  async function notify(guildId: string, fallback: string | null, notice: Notice): Promise<void> {
    const music = noticeChannel(guildId);
    if (music && (await announce(music, notice)) !== false) return;
    if (fallback && fallback !== music) await announce(fallback, notice);
  }

  /** Resolves a track's picture once (spec #62/#63); toTrack reads it from userData. */
  async function resolveArt(track: LavalinkTrack): Promise<void> {
    const data = (track.userData ?? {}) as Record<string, unknown>;
    if (!artwork || ARTWORK in data) return;
    const url = await artwork.trackArt(track).catch(() => track.info.artworkUrl ?? null);
    track.userData = { ...(track.userData as Record<string, unknown>), [ARTWORK]: url };
  }

  /**
   * Resolves a track's picture without holding anything up: the Dashboard and the notice go out
   * with Lavalink's picture, and the resolved one follows as its own revision while the Player still
   * has the track.
   */
  function artLater(player: Player, track: LavalinkTrack): void {
    if (!artwork || ARTWORK in ((track.userData ?? {}) as Record<string, unknown>)) return;
    void resolveArt(track).then(async () => {
      const held = player.queue.current === track || (player.queue.tracks as LavalinkTrack[]).includes(track);
      if (held && lavalink.getPlayer(player.guildId) === player) await commit(player);
    }, warn("resolve artwork"));
  }

  const sourceManagers = () => lavalink.nodeManager.leastUsedNodes()[0]?.info?.sourceManagers ?? [];

  // Spec #69: autocomplete answers are kept 30 minutes, at most 1000 of them, in this process
  // (it works without Redis, ADR-0003).
  const suggestions = createTtlCache<string, Choice[]>({ ttlMs: 30 * 60_000, max: 1000, now });
  const suggester = createSuggester({
    cache: suggestions,
    sources: sourceManagers,
    load: async (query, source) => {
      const node = lavalink.nodeManager.leastUsedNodes()[0];
      if (!node) throw new Error("no Lavalink node");
      // Discord drops an autocomplete answer after 3 s.
      const found = await within(2500, node.search(source ? { query, source } : { query }, { id: "autocomplete" }));
      return {
        loadType: found.loadType,
        tracks: found.tracks,
        playlistName: (found as { playlist?: { name?: string } | null }).playlist?.name,
      };
    },
  });

  const is247 = (player: Player) => player.get<boolean | undefined>(TWENTY_FOUR_SEVEN) === true;

  /** Every queue mutation bumps the Queue Revision (ADR-0007). */
  const bump = (player: Player) => player.set(REVISION, (player.get<number | undefined>(REVISION) ?? 0) + 1);

  /** A queue edit lands: one new revision, then the state goes out. */
  async function commit(player: Player): Promise<void> {
    bump(player);
    await publish(player);
  }

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
        twentyFourSeven: is247(player),
        now: now(),
        epoch,
        lastSeekAt: player.get<number | undefined>(LAST_SEEK) ?? null,
        recovering: player.get<boolean | undefined>(RECOVERING) === true,
      },
    );
    // Every published change is also what a restart would need (Queue Snapshot, #103). The write
    // is ordered per Guild by the store; the Dashboard does not wait for the disk.
    void save(player);
    // An Invalid Player State is never published.
    if (state) await publisher.publish(state).catch(warn("publish Player State"));
  }

  const toStoredTrack = (track: LavalinkTrack): StoredTrack | null =>
    track.encoded
      ? {
          encoded: track.encoded,
          info: { ...track.info },
          userData: track.userData as Record<string, unknown> | undefined,
          requester: track.requester,
        }
      : null;

  const fromStoredTrack = (track: StoredTrack) =>
    lavalink.utils.buildTrack(
      { encoded: track.encoded, info: track.info, pluginInfo: {}, userData: track.userData ?? {} } as never,
      track.requester,
    ) as LavalinkTrack;

  /** Writes this Player's Queue Snapshot; best-effort, like publishing. */
  async function save(player: Player): Promise<void> {
    // While restoring, the Player has no current track yet: writing now would lose it.
    if (!snapshots || !player.voiceChannelId || player.get<boolean | undefined>(RECOVERING)) return;
    const current = player.queue.current ? toStoredTrack(player.queue.current) : null;
    const snapshot: QueueSnapshot = {
      guildId: player.guildId,
      voiceChannelId: player.voiceChannelId,
      textChannelId: player.get<string | undefined>(TEXT_CHANNEL) ?? player.textChannelId ?? null,
      current,
      positionMs: current ? Math.max(0, Math.round(player.position)) : 0,
      paused: player.paused,
      queue: (player.queue.tracks as LavalinkTrack[]).map(toStoredTrack).filter((t): t is StoredTrack => t !== null),
      volume: player.volume,
      repeatMode: player.repeatMode,
      twentyFourSeven: is247(player),
      silent: flagsOf(player).terminal,
      savedAt: now(),
    };
    await snapshots.save(snapshot).catch(warn("save Queue Snapshot"));
  }

  /** Brings one Player back from its snapshot: voice, volume, loop, 24/7, queue, then the track. */
  async function restore(snapshot: QueueSnapshot): Promise<void> {
    // A snapshot without a current track but with a queue plays the queue's head from the start.
    const [head, ...rest] = snapshot.current ? [snapshot.current, ...snapshot.queue] : snapshot.queue;
    const current = head ? fromStoredTrack(head) : null;
    const positionMs = snapshot.current ? snapshot.positionMs : 0;
    const player = playerFor({
      guildId: snapshot.guildId,
      voiceChannelId: snapshot.voiceChannelId,
      textChannelId: snapshot.textChannelId,
    });
    player.set(TWENTY_FOUR_SEVEN, snapshot.twentyFourSeven);
    if (current) player.set(RECOVERING, true);
    await player.connect();
    await player.setVolume(snapshot.volume);
    await player.setRepeatMode(snapshot.repeatMode);
    if (rest.length > 0) await player.queue.add(rest.map(fromStoredTrack));
    if (snapshot.silent) player.set(FLAGS, { ...NO_FLAGS, terminal: true });
    else {
      const notice = recoveryNotice(current ? toTrack(current) : null, positionMs, rest.length);
      await notify(snapshot.guildId, snapshot.textChannelId, notice).catch(warn("recovery notice"));
    }
    if (!current) {
      await commit(player);
      return;
    }
    // The Dashboard shows "recovering" until the track starts; the notice above replaces Now Playing.
    player.set(FLAGS, { ...NO_FLAGS, dontShow: true, terminal: snapshot.silent });
    await commit(player);
    await player.play({ clientTrack: current, position: positionMs, paused: snapshot.paused });
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
    const listed = (result as { loadType?: string; playlist?: { name?: string } | null }).loadType === "playlist";
    // Spec #65: a YouTube Mix is a radio station.
    const listName = (result as { playlist?: { name?: string } | null }).playlist?.name;
    const name = listName === undefined ? undefined : playlistDisplayName(listName);
    const playlist = listed ? { name: name ?? resolved.query, url: resolved.query } : null;
    tracks.forEach((track, i) => {
      track.userData = {
        ...track.userData,
        [ADDED_AT]: now(),
        // Spec #66: every playlist track knows where it came from, 1-based.
        ...(playlist ? { [PLAYLIST]: { ...playlist, index: i + 1, total: tracks.length } } : {}),
      };
    });
    return { tracks, playlist } as const;
  }

  function playerFor(request: { guildId: string; voiceChannelId: string; textChannelId: string | null }): Player {
    const existing = lavalink.getPlayer(request.guildId);
    if (existing) return existing;
    const player = lavalink.createPlayer({
      guildId: request.guildId,
      voiceChannelId: request.voiceChannelId,
      textChannelId: request.textChannelId ?? undefined,
      selfDeaf: true,
      selfMute: false,
      volume: DEFAULT_VOLUME,
    });
    if (request.textChannelId) player.set(TEXT_CHANNEL, request.textChannelId);
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
    const recovered = player.get<boolean | undefined>(RECOVERING) === true;
    player.set(RECOVERING, false);
    const flags = { ...flagsOf(player), trackLoop: player.repeatMode === "track" };
    // Spec #25: the per-track flags last one track (terminal playback keeps its flag).
    player.set(FLAGS, { ...NO_FLAGS, terminal: flags.terminal });
    player.set(LAST_SEEK, undefined);
    // Decide on the queue as it was when the track started, before any await: a /play arriving
    // while the picture resolves or the state publishes must not count.
    const announceAllowed = shouldAnnounce(flags, player.queue.tracks.length);
    artLater(player, track);
    const shown = toTrack(track);
    const announceIt = shown !== null && announceAllowed;
    // The Dashboard first; the Discord notice is a slower round trip.
    await publish(player);
    if (shown) history?.trackStarted(player.guildId, shown, player.voiceChannelId ?? null, recovered);
    if (shown && announceIt) {
      const channel = player.get<string | undefined>(TEXT_CHANNEL) ?? player.textChannelId ?? null;
      {
        const from = (track.userData as { playlist?: { url?: string; thumbnail?: string | null } } | undefined)
          ?.playlist;
        // The icon may wait a moment for Spotify, never longer than ICON_WAIT_MS (then the avatar).
        const iconUrl = artwork
          ? await within(ICON_WAIT_MS, artwork.icon(shown, from?.thumbnail ?? null)).catch(() => undefined)
          : undefined;
        const authorUrl = usePlaylistUrl && from?.url ? from.url : undefined;
        await notify(player.guildId, channel, nowPlayingNotice(shown, { iconUrl, authorUrl })).catch(
          warn("now-playing notice"),
        );
      }
    }
  }

  const voiceEvent = (guildId: string, type: VoiceEventType, data: Record<string, unknown>) =>
    publisher.voice(guildId, type, data).catch(warn("publish voice event"));

  /** Guilds reconnecting after a voice drop; a second drop meanwhile joins the first. */
  const reconnecting = new Set<string>();

  /**
   * Spec #28: a dropped voice connection comes back where it was, unless the code says not to.
   * Whatever happens, a drop announced as recovering ends with reconnected or failed, so the
   * Dashboard never stays on "reconnecting".
   */
  async function onVoiceClosed(player: Player, code: number, reason: string, byRemote: boolean): Promise<void> {
    const { guildId } = player;
    // Spec #28: skip a Player that is gone or no longer in voice.
    if (lavalink.getPlayer(guildId) !== player || !player.voiceChannelId || reconnecting.has(guildId)) return;
    const recovering = RECOVERABLE_VOICE_CODES.has(code) || byRemote;
    // Claimed before the first await, so a second close arriving meanwhile is ignored.
    if (recovering) reconnecting.add(guildId);
    const positionMs = player.position;
    const track = player.queue.current?.encoded ?? null;
    const wasPlaying = track !== null && !player.paused;
    await voiceEvent(guildId, GuildEventTypes.voiceDisconnect, { code, reason, byRemote, recovering });
    if (!recovering) return;
    const alive = () => lavalink.getPlayer(guildId) === player;
    try {
      await Bun.sleep(voiceRetryMs[0]);
      if (!alive()) throw new Error("player-gone");
      await player.connect();
      await Bun.sleep(voiceRetryMs[1]);
      if (!alive()) throw new Error("player-gone");
      // Only the track that dropped goes back to where it was; one skipped to meanwhile starts fresh.
      const same = player.queue.current?.encoded === track;
      const resumed = wasPlaying && same;
      if (resumed) {
        if (positionMs > 0) await player.seek(positionMs);
        if (player.paused) await player.resume();
      }
      const title = player.queue.current?.info.title ?? null;
      await voiceEvent(guildId, GuildEventTypes.voiceReconnected, { resumed, positionMs, title });
    } catch (error) {
      // A fixed code: lavalink-client errors can carry the node's address.
      const gone = error instanceof Error && error.message === "player-gone";
      await voiceEvent(guildId, GuildEventTypes.voiceReconnectFailed, { error: gone ? "player-gone" : "reconnect" });
      if (!gone) warn("voice reconnect")(error);
    } finally {
      reconnecting.delete(guildId);
    }
  }

  lavalink.on("playerSocketClosed", (player, payload) => {
    onVoiceClosed(player, payload.code, payload.reason, payload.byRemote).catch(warn("voice drop"));
  });

  lavalink.on("trackStart", (player, track) => {
    onTrackStart(player, track as LavalinkTrack | null).catch(warn("track start"));
  });
  // Spec #27: the queue ended. Without 24/7 the Bot leaves; with it the Player stays as an Idle Player.
  lavalink.on("queueEnd", (player) => {
    const ended = is247(player) ? commit(player) : player.destroy().then(() => {});
    ended.catch(warn("queue end"));
  });
  lavalink.on("playerDestroy", (player, reason) => {
    publisher.gone(player.guildId).catch(warn("publish player gone"));
    // A Player that left (queue end without 24/7, /leave, kicked) is not restored after a restart.
    // One that Lavalink took down (the node failed or was destroyed) is exactly what to restore,
    // so its Listening Session goes on too (#108 review).
    if (String(reason ?? "").startsWith("Node")) return;
    history?.playerGone(player.guildId);
    snapshots?.clear(player.guildId).catch(warn("clear Queue Snapshot"));
  });

  const existing = (guildId: string) => lavalink.getPlayer(guildId) ?? null;

  /**
   * An edit names its track by index and uri; the queue may have moved since the client saw it
   * (a track ended, another tab edited). Checked synchronously, right before the change.
   */
  function checkAt(player: Player, index: number, uri: string): "invalid-index" | "stale" | null {
    const track = player.queue.tracks[index] as LavalinkTrack | undefined;
    if (!track) return "invalid-index";
    return toTrack(track)?.uri === uri ? null : "stale";
  }

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

  /** Spec #4: every track of a playlist, at the requested place, or played from idle. */
  async function addPlaylist(
    player: Player,
    request: PlayRequest,
    tracks: LavalinkTrack[],
    from: { name: string; url: string },
  ): Promise<PlayResult> {
    const playlist: AddedPlaylist = {
      ...from,
      count: tracks.length,
      durationMs: tracks.reduce((sum, t) => sum + (t.info.duration ?? 0), 0),
      thumbnail: tracks[0]?.info.artworkUrl ?? null,
    };
    if (artwork) {
      // The reply shows the playlist's picture and display icon: asked together, never for long.
      const [thumbnail, icon] = await Promise.all([
        within(ICON_WAIT_MS * 2, artwork.playlistArt(from.url, playlist.thumbnail)).catch(() => playlist.thumbnail),
        within(ICON_WAIT_MS, artwork.icon(null, playlist.thumbnail, true)).catch(() => undefined),
      ]);
      playlist.thumbnail = thumbnail ?? playlist.thumbnail;
      playlist.icon = icon;
    }
    // The playlist's picture travels with its tracks, for the playlist_thumbnail icon (spec #67).
    for (const t of tracks) {
      const data = t.userData as Record<string, unknown>;
      t.userData = { ...data, [PLAYLIST]: { ...(data[PLAYLIST] as object), thumbnail: playlist.thumbnail } };
    }
    const at = request.next || request.skipplay ? 0 : request.position;
    if (player.queue.current) {
      const index = at === undefined ? player.queue.tracks.length : Math.min(at, player.queue.tracks.length);
      await player.queue.add(tracks, index);
      if (request.skipplay) {
        player.set(FLAGS, { ...flagsOf(player), skipplay: true });
        await player.skip();
        return { kind: "playlist", playlist, started: true, firstPosition: 1 };
      }
      await commit(player);
      return { kind: "playlist", playlist, started: false, firstPosition: index + 1 };
    }
    const placed = at !== undefined || request.skipplay;
    player.set(FLAGS, {
      ...NO_FLAGS,
      firstFromCommand: !placed,
      dontShow: Boolean(placed),
      // A console session stays silent (#112).
      terminal: flagsOf(player).terminal,
    });
    await player.queue.add(tracks);
    await player.play();
    return { kind: "playlist", playlist, started: true, firstPosition: 1 };
  }

  async function startOrQueue(request: PlayRequest): Promise<PlayResult> {
    const fresh = !existing(request.guildId);
    const player = playerFor(request);
    // Spec #119: the console's silent mode holds for the whole Player session.
    if (request.silent) player.set(FLAGS, { ...flagsOf(player), terminal: true });
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
    if (found.playlist) return addPlaylist(player, request, found.tracks, found.playlist);
    // Where in the upcoming queue: /playnext and play-next at the head, /playat at its 0-based index
    // (clamped to the end, as v5 did), otherwise the end.
    const at = request.next ? 0 : request.position;
    if (player.queue.current) {
      if (request.skipplay) {
        // /skipplay: the new track plays now, the current one is dropped, the queue stays (spec #7).
        // No bump here: the track start that follows is the one revision for this edit.
        await player.queue.add(first, 0);
        player.set(FLAGS, { ...flagsOf(player), skipplay: true });
        await player.skip();
        return { kind: "started", track: shown };
      }
      const index = at === undefined ? undefined : Math.min(at, player.queue.tracks.length);
      await player.queue.add(first, index);
      await commit(player);
      artLater(player, first);
      return { kind: "queued", track: shown, position: (index ?? player.queue.tracks.length - 1) + 1 };
    }
    // From idle, /play announces in its own reply; /playnext, /playat and /skipplay never post a notice (spec #24).
    const placed = at !== undefined || request.skipplay;
    player.set(FLAGS, {
      ...NO_FLAGS,
      firstFromCommand: !placed,
      dontShow: Boolean(placed),
      // A console session stays silent (#112).
      terminal: flagsOf(player).terminal,
    });
    await player.queue.add(first);
    await player.play();
    return { kind: "started", track: shown };
  }

  return {
    /**
     * Queue Recovery (spec #21, #123): restores every Queue Snapshot whose Guild `keep` accepts;
     * the rest are cleared. Returns how many Players came back.
     */
    async recover(keep: (snapshot: QueueSnapshot) => boolean = () => true): Promise<number> {
      if (!snapshots) return 0;
      let restored = 0;
      for (const snapshot of await snapshots.all()) {
        if (lavalink.getPlayer(snapshot.guildId)) continue;
        if (!keep(snapshot)) {
          await snapshots.clear(snapshot.guildId).catch(warn("clear Queue Snapshot"));
          // Nothing will play here again: a session a Lavalink restart kept open ends now (#108).
          history?.playerGone(snapshot.guildId);
          continue;
        }
        try {
          // In the Guild's queue of work, so a /play arriving meanwhile waits for the restore. A
          // /play that got there first started a Player of its own: that one wins.
          const done = await serial(snapshot.guildId, async () => {
            if (lavalink.getPlayer(snapshot.guildId)) return false;
            await restore(snapshot);
            return true;
          });
          if (done) restored += 1;
        } catch (error) {
          warn(`recover ${snapshot.guildId}`)(error);
          await lavalink
            .getPlayer(snapshot.guildId)
            ?.destroy()
            .catch(() => {});
          await snapshots.clear(snapshot.guildId).catch(warn("clear Queue Snapshot"));
        }
      }
      return restored;
    },

    /** Writes every Player's snapshot with its current position (shutdown, and every few seconds). */
    async flush(): Promise<void> {
      await Promise.all([...lavalink.players.values()].map(save));
    },

    /** The /play family's autocomplete (spec #2, #69). */
    suggest: (query: string) => suggester.suggest(query),
    suggestionStats: () => suggestions.stats(),
    clearSuggestions: () => suggestions.clear(),

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
      await commit(player);
      return true;
    },

    /** Spec #46 move inside the upcoming queue. */
    async move(guildId: string, from: number, to: number, uri: string): Promise<QueueEdit> {
      const player = existing(guildId);
      if (!player) return "invalid-index";
      const refused = checkAt(player, from, uri);
      if (refused) return refused;
      const tracks = player.queue.tracks as LavalinkTrack[];
      const next = moveTrack(tracks, from, to);
      if (!next) return "invalid-index";
      await player.queue.splice(0, tracks.length, next);
      await commit(player);
      return "ok";
    },

    async remove(guildId: string, index: number, uri: string): Promise<QueueEdit> {
      const player = existing(guildId);
      if (!player) return "invalid-index";
      const refused = checkAt(player, index, uri);
      if (refused) return refused;
      await player.queue.splice(index, 1);
      await commit(player);
      return "ok";
    },

    async clear(guildId: string): Promise<boolean> {
      const player = existing(guildId);
      if (!player) return false;
      await player.queue.splice(0, player.queue.tracks.length);
      await commit(player);
      return true;
    },

    /**
     * Plays a queued track now and keeps the rest in order. The jump is announced first so the
     * Dashboard can animate it before the list changes (spec #39); no notice for it (spec #24).
     */
    async playNow(guildId: string, index: number, uri: string): Promise<QueueEdit> {
      const player = existing(guildId);
      if (!player?.queue.current) return "invalid-index";
      const refused = checkAt(player, index, uri);
      if (refused) return refused;
      const track = player.queue.tracks[index] as LavalinkTrack;
      await publisher
        .jump(guildId, player.get<number | undefined>(REVISION) ?? 0, { fromIndex: index, title: track.info.title })
        .catch(warn("publish queue jump"));
      await player.queue.splice(index, 1);
      await player.queue.add(track, 0);
      // The track start that follows bumps the revision once for this edit.
      player.set(FLAGS, { ...flagsOf(player), dontShow: true });
      await player.skip();
      return "ok";
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
        // Stopping the last track ends the queue; the queue end decides between leaving and Idle.
        if (is247(player)) await player.stopPlaying(false, false);
        else await player.destroy();
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

    /** Toggles 24/7; the new value, or null when there is no Player (spec #10). */
    async setTwentyFourSeven(guildId: string): Promise<boolean | null> {
      const player = existing(guildId);
      if (!player) return null;
      const next = !is247(player);
      player.set(TWENTY_FOUR_SEVEN, next);
      await publish(player);
      return next;
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
        twentyFourSeven: is247(player),
        queue: (player.queue.tracks as LavalinkTrack[]).map(toTrack).filter((t): t is Track => t !== null),
      };
    },
  };
}

export type Music = ReturnType<typeof createMusic>;
