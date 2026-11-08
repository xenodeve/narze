import {
  type Chart,
  type ChartEntry,
  type ChartRegion,
  ChartSchema,
  parseJson,
  RedisKeys,
  rankMovement,
  trackKey,
} from "@narze/shared";
import { largestImage, type SpotifyApi } from "@narze/shared/spotify-api";
import { Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type Redis from "ioredis";

/** Spec #53, #72: a chart is refreshed every 3 days. */
export const CHART_REFRESH_MS = 3 * 24 * 60 * 60_000;
const CHART_REGIONS: readonly ChartRegion[] = ["th", "us"];
/** Apple's 50 give rank movement its context; the Dashboard shows (and Spotify enriches) the top 10. */
const SIZE = 50;
const SHOWN = 10;

export class ChartUnavailable extends Error {}

type Enrichment = { spotifyUrl: string | null; artistImage: string | null };
type Image = { url: string; width?: number | null };
interface AppleSong {
  name?: string;
  artistName?: string;
  url?: string;
  artworkUrl100?: string;
}
interface AppleFeed {
  feed?: { title?: string; updated?: string; results?: AppleSong[] };
}
interface SpotifySearch {
  tracks?: {
    items?: Array<{
      external_urls?: { spotify?: string };
      album?: { images?: Image[] };
      artists?: Array<{ id: string }>;
    }>;
  };
}

const named = (s: AppleSong): s is AppleSong & { name: string; artistName: string } => Boolean(s.name && s.artistName);

/**
 * Charts (#109, ADR-0010): Apple Music "Top Songs" per country, cached in Redis and refreshed every
 * 3 days (an hourly check, and any read that finds the copy older). When Apple fails, the last good
 * copy is served marked stale; with no copy at all the chart is unavailable, never made up.
 */
export class ChartService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ChartService");
  private readonly inFlight = new Map<ChartRegion, Promise<Chart>>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deps: {
      redis: Redis;
      chartsUrl?: string;
      spotify?: Pick<SpotifyApi, "configured" | "get">;
      now?: () => number;
      fetch?: typeof globalThis.fetch;
    },
  ) {}

  private get now(): number {
    return (this.deps.now ?? Date.now)();
  }

  /** Checks every hour whether a chart is due; the timer never keeps the process alive. */
  onModuleInit(): void {
    this.timer ??= setInterval(() => void this.tick(), 60 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Spec #53's 3-day schedule: every chart that is due is refreshed (a read would do the same). */
  async tick(): Promise<void> {
    await Promise.all(CHART_REGIONS.map((region) => this.get(region).catch(() => {})));
  }

  async get(region: ChartRegion): Promise<Chart> {
    const cached = parseJson(ChartSchema, await this.deps.redis.get(RedisKeys.chart(region)));
    if (cached && this.now - cached.fetchedAt < CHART_REFRESH_MS) return cached;
    try {
      return await this.refresh(region, cached);
    } catch (error) {
      this.logger.warn(`chart ${region}: ${error instanceof Error ? error.message : error}`);
      if (cached) return { ...cached, stale: true };
      throw new ChartUnavailable("chart unavailable");
    }
  }

  /** One fetch per chart at a time; concurrent readers share it. */
  private refresh(region: ChartRegion, previous: Chart | null): Promise<Chart> {
    let run = this.inFlight.get(region);
    if (!run) {
      run = this.load(region, previous).finally(() => this.inFlight.delete(region));
      this.inFlight.set(region, run);
    }
    return run;
  }

  private async load(region: ChartRegion, previous: Chart | null): Promise<Chart> {
    const url = `${this.deps.chartsUrl ?? "https://rss.marketingtools.apple.com"}/api/v2/${region}/music/most-played/${SIZE}/songs.json`;
    const res = await (this.deps.fetch ?? globalThis.fetch)(url, { signal: AbortSignal.timeout(10_000) }).catch(
      () => null,
    );
    if (!res?.ok) throw new ChartUnavailable(`Apple answered ${res?.status ?? "nothing"}`);
    const feed = ((await res.json().catch(() => null)) as AppleFeed | null)?.feed;
    const songs = (feed?.results ?? []).filter(named);
    if (songs.length === 0) throw new ChartUnavailable("Apple sent an empty chart");
    const rows = songs.map((s, i) => ({ rank: i + 1, title: s.name, artist: s.artistName }));
    const moves = rankMovement(rows, previous?.entries ?? null);
    const extras = await this.enrich(rows.slice(0, SHOWN), previous);
    const entries: ChartEntry[] = songs.map((song, i) => ({
      rank: i + 1,
      title: song.name,
      artist: song.artistName,
      // Apple's 100px artwork, at twice the 40px it is shown at.
      artwork: song.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/80x80bb.$1") ?? null,
      appleUrl: song.url ?? null,
      spotifyUrl: extras[i]?.spotifyUrl ?? null,
      artistImage: extras[i]?.artistImage ?? null,
      movement: moves[i]?.movement ?? null,
      previousRank: moves[i]?.previousRank ?? null,
    }));
    const chart: Chart = {
      region,
      title: feed?.title ?? "Top Songs",
      sourceUpdatedAt: feed?.updated ?? "",
      fetchedAt: this.now,
      stale: false,
      entries,
    };
    await this.deps.redis.set(RedisKeys.chart(region), JSON.stringify(chart));
    return chart;
  }

  /**
   * Spec #72: the Spotify link and the artist's picture for the songs shown. A song already enriched
   * in the previous update keeps it; the rest cost one search each and one batched artists call.
   */
  private async enrich(
    rows: ReadonlyArray<{ title: string; artist: string }>,
    previous: Chart | null,
  ): Promise<Array<Enrichment | null>> {
    const spotify = this.deps.spotify;
    if (!spotify?.configured) return rows.map(() => null);
    const known = new Map(
      (previous?.entries ?? [])
        .filter((e) => e.spotifyUrl)
        .map((e) => [trackKey(e.title, e.artist), { spotifyUrl: e.spotifyUrl, artistImage: e.artistImage }] as const),
    );
    const found = await Promise.all(
      rows.map(async ({ title, artist }) => {
        const kept = known.get(trackKey(title, artist));
        if (kept) return { kept };
        const q = encodeURIComponent(`track:${title} artist:${artist}`);
        const hit = (await spotify.get<SpotifySearch>(`/search?type=track&limit=1&q=${q}`))?.tracks?.items?.[0];
        return { hit };
      }),
    );
    const artistIds = [...new Set(found.flatMap((f) => (f.hit?.artists?.[0]?.id ? [f.hit.artists[0].id] : [])))];
    const artists = artistIds.length
      ? await spotify.get<{ artists?: Array<{ id: string; images?: Image[] } | null> }>(
          `/artists?ids=${artistIds.map(encodeURIComponent).join(",")}`,
        )
      : null;
    const pictures = new Map((artists?.artists ?? []).flatMap((a) => (a ? [[a.id, largestImage(a.images)]] : [])));
    return found.map((f) => {
      if (f.kept) return f.kept;
      if (!f.hit) return null;
      const id = f.hit.artists?.[0]?.id;
      return {
        spotifyUrl: f.hit.external_urls?.spotify ?? null,
        artistImage: (id ? pictures.get(id) : null) ?? largestImage(f.hit.album?.images),
      };
    });
  }
}
