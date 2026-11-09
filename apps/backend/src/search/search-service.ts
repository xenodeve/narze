import {
  type AlbumPage,
  type ArtistPage,
  type ChannelPage,
  type SearchAlbum,
  type SearchArtist,
  type SearchResponse,
  type SearchSource,
  type SearchTrack,
  topResult,
} from "@narze/shared";
import { largestImage, type SpotifyApi } from "@narze/shared/spotify-api";
import { createTtlCache, WEEK_MS } from "@narze/shared/ttl-cache";
import type { YouTubeChannel, YouTubeChannels } from "./youtube-channels";

export type { AlbumPage, ArtistPage, ChannelPage };

/** What Lavalink's `GET /v4/loadtracks` answers (only the parts the catalog reads). */
export interface LavalinkLoad {
  loadType: string;
  data: unknown;
}
export interface LavalinkTrackData {
  info: {
    identifier?: string;
    title?: string;
    author?: string;
    length?: number;
    uri?: string | null;
    artworkUrl?: string | null;
  };
}

type Image = { url: string; width?: number | null };
interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists?: Array<{ id?: string; name: string }>;
  album?: { id?: string; name?: string; images?: Image[] };
  external_urls?: { spotify?: string };
}
interface SpotifyArtist {
  id: string;
  name: string;
  images?: Image[];
  followers?: { total?: number };
  genres?: string[];
  external_urls?: { spotify?: string };
}
interface SpotifyAlbum {
  id: string;
  name: string;
  artists?: Array<{ id?: string; name: string }>;
  images?: Image[];
  release_date?: string;
  total_tracks?: number;
  external_urls?: { spotify?: string };
}

const MINUTES = 60_000;
/**
 * Every Lavalink search carries a search prefix, so a query is never loaded as a URL: the node has
 * the HTTP source on, and a bare `http://internal/...` would make it fetch that (SSRF). Spotify mode
 * tries spsearch first (LavaSrc), then YouTube Music, as the Bot does (apps/bot/src/music/query.ts).
 */
const LAVALINK_PREFIXES: Record<"spotify" | "youtube" | "youtubemusic", string[]> = {
  spotify: ["spsearch:", "ytmsearch:"],
  youtube: ["ytsearch:"],
  youtubemusic: ["ytmsearch:"],
};

const fromLavalink = (t: LavalinkTrackData): SearchTrack => {
  const uri = t.info.uri ?? "";
  return {
    id: t.info.identifier ?? uri,
    title: t.info.title ?? "",
    artist: t.info.author ?? "",
    duration: t.info.length ?? 0,
    thumbnail: t.info.artworkUrl ?? null,
    uri,
    ...(uri.includes("spotify") ? { spotifyUrl: uri } : {}),
    ...(uri.includes("youtube") ? { youtubeUrl: uri } : {}),
    // Spec #85 VIDEO chip: a YouTube upload outside YouTube Music, not from a "- Topic" channel.
    isVideo:
      /(^|\.)youtube\.com\/watch|youtu\.be\//.test(uri) &&
      !uri.includes("music.youtube.com") &&
      !/- Topic$/.test(t.info.author ?? ""),
  };
};
const fromSpotifyTrack = (t: SpotifyTrack): SearchTrack => {
  const uri = t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`;
  return {
    id: t.id,
    title: t.name,
    artist: t.artists?.[0]?.name ?? "",
    artistId: t.artists?.[0]?.id,
    album: t.album?.name,
    albumId: t.album?.id,
    duration: t.duration_ms,
    thumbnail: largestImage(t.album?.images),
    uri,
    spotifyUrl: uri,
  };
};
const fromSpotifyArtist = (a: SpotifyArtist): SearchArtist => ({
  id: a.id,
  name: a.name,
  imageUrl: largestImage(a.images),
  followers: a.followers?.total,
  genres: a.genres ?? [],
  spotifyUrl: a.external_urls?.spotify,
});
const fromSpotifyAlbum = (a: SpotifyAlbum): SearchAlbum => ({
  id: a.id,
  name: a.name,
  artistName: a.artists?.[0]?.name ?? "Unknown",
  artistId: a.artists?.[0]?.id,
  imageUrl: largestImage(a.images),
  releaseDate: a.release_date,
  trackCount: a.total_tracks,
  spotifyUrl: a.external_urls?.spotify,
});
const fromChannel = (c: YouTubeChannel): SearchArtist => ({
  id: c.id,
  name: c.name,
  imageUrl: c.imageUrl,
  followers: c.subscribers,
  genres: [],
  youtubeUrl: `https://www.youtube.com/channel/${c.id}`,
});

/**
 * The Catalog (#105, spec #49, #57–#61): search in four modes and the artist, album and channel
 * pages. Lavalink is asked over its REST API (ADR-0009); Spotify and YouTube through their Web APIs.
 * Results are cached with the spec TTLs (#73); YouTube searches are not, and an empty
 * spotify-mode search never is (#59).
 */
export class SearchService {
  private readonly searches = createTtlCache<string, Omit<SearchResponse, "fromCache">>({
    ttlMs: 30 * MINUTES,
    max: 1000,
  });
  private readonly artists = createTtlCache<string, ArtistPage>({ ttlMs: WEEK_MS, max: 500 });
  private readonly albums = createTtlCache<string, AlbumPage>({ ttlMs: WEEK_MS, max: 500 });
  private readonly channels = createTtlCache<string, ChannelPage>({ ttlMs: 60 * MINUTES, max: 500 });
  /** Spec #73: a YouTube channel search is kept 30 minutes (each one costs API quota). */
  private readonly channelSearches = createTtlCache<string, YouTubeChannel[]>({ ttlMs: 30 * MINUTES, max: 1000 });

  constructor(
    private readonly deps: {
      loadTracks: (identifier: string) => Promise<LavalinkLoad>;
      spotify: SpotifyApi;
      youtube: YouTubeChannels;
    },
  ) {}

  /** The first prefix that finds tracks wins (spsearch, then ytmsearch, in Spotify mode). */
  private async searchLavalink(query: string, mode: keyof typeof LAVALINK_PREFIXES): Promise<SearchTrack[]> {
    for (const prefix of LAVALINK_PREFIXES[mode]) {
      const tracks = await this.lavalinkTracks(`${prefix}${query}`);
      if (tracks.length > 0) return tracks;
    }
    return [];
  }

  private async channelSearch(query: string, source: "youtube" | "youtubemusic"): Promise<YouTubeChannel[]> {
    const key = `${source}:${query.toLowerCase()}`;
    const cached = this.channelSearches.get(key);
    if (cached) return cached;
    const found = await this.deps.youtube.search(query, source, 5);
    if (found.length > 0) this.channelSearches.set(key, found);
    return found;
  }

  private async lavalinkTracks(identifier: string): Promise<SearchTrack[]> {
    const load = await this.deps.loadTracks(identifier).catch(() => null);
    if (!load || !Array.isArray(load.data)) return [];
    return (load.data as LavalinkTrackData[]).slice(0, 10).map(fromLavalink);
  }

  private async spotifyArtistsAndAlbums(query: string) {
    const body = await this.deps.spotify.get<{
      artists?: { items?: SpotifyArtist[] };
      albums?: { items?: SpotifyAlbum[] };
    }>(`/search?type=artist,album&limit=5&market=TH&q=${encodeURIComponent(query)}`);
    return {
      artists: (body?.artists?.items ?? []).map(fromSpotifyArtist),
      albums: (body?.albums?.items ?? []).map(fromSpotifyAlbum),
    };
  }

  async search(rawQuery: string, source: SearchSource): Promise<SearchResponse> {
    const query = rawQuery.trim();
    const key = `${source}:${query.toLowerCase()}`;
    const cached = this.searches.get(key);
    if (cached) return { ...cached, fromCache: true };

    let found: { tracks: SearchTrack[]; artists: SearchArtist[]; albums: SearchAlbum[] };
    if (source === "youtube" || source === "youtubemusic") {
      const [tracks, channels] = await Promise.all([
        this.searchLavalink(query, source),
        this.channelSearch(query, source),
      ]);
      found = { tracks, artists: channels.map(fromChannel), albums: [] };
      // Measured like every mode, not v5 §7.1's fixed scores (#164).
      return { query, source, topResult: topResult(query, found), ...found, fromCache: false };
    }
    if (source === "spotify-api") {
      const [trackBody, rest] = await Promise.all([
        this.deps.spotify.get<{ tracks?: { items?: SpotifyTrack[] } }>(
          `/search?type=track&limit=10&market=TH&q=${encodeURIComponent(query)}`,
        ),
        this.spotifyArtistsAndAlbums(query),
      ]);
      found = { tracks: (trackBody?.tracks?.items ?? []).map(fromSpotifyTrack), ...rest };
    } else {
      const [tracks, rest] = await Promise.all([
        this.searchLavalink(query, "spotify"),
        this.spotifyArtistsAndAlbums(query),
      ]);
      found = { tracks, ...rest };
    }
    const response = { query, source, topResult: topResult(query, found), ...found };
    // Spec #59: an empty result is retried next time, not remembered.
    if (found.tracks.length > 0) this.searches.set(key, response);
    return { ...response, fromCache: false };
  }

  /** Spec #60: the artist, its top tracks in TH and its albums and singles (20). */
  async artist(id: string): Promise<ArtistPage | null> {
    const cached = this.artists.get(id);
    if (cached) return cached;
    const path = encodeURIComponent(id);
    const [artist, top, albums] = await Promise.all([
      this.deps.spotify.get<SpotifyArtist>(`/artists/${path}`),
      this.deps.spotify.get<{ tracks?: SpotifyTrack[] }>(`/artists/${path}/top-tracks?market=TH`),
      this.deps.spotify.get<{ items?: SpotifyAlbum[] }>(
        `/artists/${path}/albums?include_groups=${encodeURIComponent("album,single")}&limit=20&market=TH`,
      ),
    ]);
    if (!artist?.id) return null;
    const page = {
      artist: fromSpotifyArtist(artist),
      topTracks: (top?.tracks ?? []).map(fromSpotifyTrack),
      albums: (albums?.items ?? []).map(fromSpotifyAlbum),
    };
    // A part that failed is not remembered for a week: only a complete page is cached.
    if (top && albums) this.artists.set(id, page);
    return page;
  }

  /** Spec #60: the album and every one of its tracks. */
  async album(id: string): Promise<AlbumPage | null> {
    const cached = this.albums.get(id);
    if (cached) return cached;
    type TrackPage = { items?: SpotifyTrack[]; next?: string | null };
    const album = await this.deps.spotify.get<SpotifyAlbum & { tracks?: TrackPage }>(
      `/albums/${encodeURIComponent(id)}?market=TH`,
    );
    if (!album?.id) return null;
    // Spotify embeds the first 50 tracks; follow `next` for the rest (bounded).
    const items = [...(album.tracks?.items ?? [])];
    let next = album.tracks?.next ?? null;
    for (let pages = 0; next && pages < 20; pages++) {
      const more: TrackPage | null = await this.deps.spotify.get<TrackPage>(next);
      items.push(...(more?.items ?? []));
      next = more?.next ?? null;
    }
    const page = {
      album: fromSpotifyAlbum(album),
      tracks: items.map((t) =>
        fromSpotifyTrack({ ...t, album: { id: album.id, name: album.name, images: album.images } }),
      ),
    };
    this.albums.set(id, page);
    return page;
  }

  /** Spec #60: a YouTube channel and `ytsearch:<name> official`. */
  async channel(id: string): Promise<ChannelPage | null> {
    const cached = this.channels.get(id);
    if (cached) return cached;
    const channel = await this.deps.youtube.channel(id).catch(() => null);
    if (!channel) return null;
    const page = { channel, tracks: await this.lavalinkTracks(`ytsearch:${channel.name} official`) };
    this.channels.set(id, page);
    return page;
  }
}
