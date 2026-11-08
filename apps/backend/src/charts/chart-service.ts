import { type Chart, type ChartEntry, type ChartRegion, ChartSchema, parseJson, rankMovement } from "@narze/shared";
import type { SpotifyApi } from "@narze/shared/spotify-api";
import type { OnModuleDestroy } from "@nestjs/common";
import type Redis from "ioredis";

/** Spec #53, #72: a chart is refreshed every 3 days. */
export const CHART_REFRESH_MS = 3 * 24 * 60 * 60_000;
const CHART_REGIONS: readonly ChartRegion[] = ["th", "us"];
const SIZE = 50;

export const chartKey = (region: ChartRegion, prefix = "") => `${prefix}chart:${region}`;

export class ChartUnavailable extends Error {}

interface AppleFeed {
  feed?: {
    title?: string;
    updated?: string;
    results?: Array<{ name?: string; artistName?: string; url?: string; artworkUrl100?: string }>;
  };
}
interface SpotifySearch {
  tracks?: {
    items?: Array<{
      external_urls?: { spotify?: string };
      album?: { images?: Array<{ url: string }> };
      artists?: Array<{ id: string }>;
    }>;
  };
}

/**
 * Charts (#109, ADR-0010): Apple Music "Top Songs" per country, cached in Redis and refreshed every
 * 3 days (on a timer, and by any read that finds the copy older). When Apple fails, the last good
 * copy is served marked stale; with no copy at all the chart is unavailable, never made up.
 */
export class ChartService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly chartsUrl: string;
  private readonly spotify?: Pick<SpotifyApi, "configured" | "get">;
  private readonly now: () => number;
  private readonly keyPrefix: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly inFlight = new Map<ChartRegion, Promise<Chart>>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: {
    redis: Redis;
    chartsUrl?: string;
    spotify?: Pick<SpotifyApi, "configured" | "get">;
    now?: () => number;
    /** Tests use their own keys, so a running Backend's charts are never touched. */
    keyPrefix?: string;
    fetch?: typeof globalThis.fetch;
  }) {
    this.redis = deps.redis;
    this.chartsUrl = deps.chartsUrl ?? "https://rss.marketingtools.apple.com";
    this.spotify = deps.spotify;
    this.now = deps.now ?? Date.now;
    this.keyPrefix = deps.keyPrefix ?? "";
    this.fetchFn = deps.fetch ?? globalThis.fetch;
  }

  /** Checks every hour whether a chart is due; the timer never keeps the process alive. */
  start(): void {
    this.timer ??= setInterval(() => void this.tick(), 60 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Refreshes every chart whose copy is due (spec #53's 3-day schedule). */
  async tick(): Promise<void> {
    await Promise.all(
      CHART_REGIONS.map(async (region) => {
        const cached = await this.cached(region);
        if (!cached || this.now() - cached.fetchedAt >= CHART_REFRESH_MS)
          await this.refresh(region, cached).catch(() => {});
      }),
    );
  }

  async get(region: ChartRegion): Promise<Chart> {
    const cached = await this.cached(region);
    if (cached && this.now() - cached.fetchedAt < CHART_REFRESH_MS) return cached;
    try {
      return await this.refresh(region, cached);
    } catch {
      if (cached) return { ...cached, stale: true };
      throw new ChartUnavailable("chart unavailable");
    }
  }

  private async cached(region: ChartRegion): Promise<Chart | null> {
    return parseJson(ChartSchema, await this.redis.get(chartKey(region, this.keyPrefix)));
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
    const res = await this.fetchFn(`${this.chartsUrl}/api/v2/${region}/music/most-played/${SIZE}/songs.json`, {
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) throw new ChartUnavailable(`chart ${region}: ${res?.status ?? "no answer"}`);
    const feed = ((await res.json().catch(() => null)) as AppleFeed | null)?.feed;
    const rows = (feed?.results ?? [])
      .filter((r) => r.name && r.artistName)
      .map((r, i) => ({ rank: i + 1, title: r.name as string, artist: r.artistName as string, raw: r }));
    if (rows.length === 0) throw new ChartUnavailable(`chart ${region}: empty`);
    const moves = rankMovement(rows, previous?.entries ?? null);
    const extras = await this.enrich(rows);
    const entries: ChartEntry[] = rows.map((row, i) => ({
      rank: row.rank,
      title: row.title,
      artist: row.artist,
      // Apple's 100px artwork, asked for at a size the Dashboard can use.
      artwork: row.raw.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/300x300bb.$1") ?? null,
      appleUrl: row.raw.url ?? null,
      spotifyUrl: extras[i]?.spotifyUrl ?? null,
      artistImage: extras[i]?.artistImage ?? null,
      movement: moves[i]?.movement ?? null,
      previousRank: moves[i]?.previousRank ?? null,
    }));
    const chart: Chart = {
      region,
      title: feed?.title ?? "Top Songs",
      sourceUpdatedAt: feed?.updated ?? "",
      fetchedAt: this.now(),
      stale: false,
      entries,
    };
    await this.redis.set(chartKey(region, this.keyPrefix), JSON.stringify(chart));
    return chart;
  }

  /** Spec #72: the Spotify link and the artist's picture, ten songs at a time; nothing without credentials. */
  private async enrich(
    rows: ReadonlyArray<{ title: string; artist: string }>,
  ): Promise<Array<{ spotifyUrl: string | null; artistImage: string | null } | null>> {
    const spotify = this.spotify;
    if (!spotify?.configured) return rows.map(() => null);
    const out: Array<{ spotifyUrl: string | null; artistImage: string | null } | null> = [];
    for (let i = 0; i < rows.length; i += 10) {
      out.push(
        ...(await Promise.all(
          rows.slice(i, i + 10).map(async ({ title, artist }) => {
            const q = encodeURIComponent(`track:${title} artist:${artist}`);
            const found = (await spotify.get<SpotifySearch>(`/search?type=track&limit=1&q=${q}`))?.tracks?.items?.[0];
            if (!found) return null;
            const artistId = found.artists?.[0]?.id;
            const image = artistId
              ? (await spotify.get<{ images?: Array<{ url: string }> }>(`/artists/${encodeURIComponent(artistId)}`))
                  ?.images?.[0]?.url
              : undefined;
            return {
              spotifyUrl: found.external_urls?.spotify ?? null,
              artistImage: image ?? found.album?.images?.[0]?.url ?? null,
            };
          }),
        )),
      );
    }
    return out;
  }
}
