import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { startFakeDiscord } from "@narze/fake-discord";
import { FAKE_DISCORD_PORT, localSupabase } from "@narze/fake-discord/supabase-local";
import { ChartSchema, DEFAULT_REDIS_URL } from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import { createApp } from "../src/app";
import { CHART_REFRESH_MS, ChartService, chartKey } from "../src/charts/chart-service";

const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(redisUrl);
/** A test-only key prefix, so a running Backend's real charts are never touched. */
const PREFIX = "test109:";

let titles = ["Song A", "Song B", "Song C"];
let up = true;
let requests = 0;
const byRegion: Record<string, number> = {};
const apple = Bun.serve({
  port: 0,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (!/^\/api\/v2\/(th|us)\/music\/most-played\/\d+\/songs\.json$/.test(path))
      return new Response("no", { status: 404 });
    requests += 1;
    const region = path.split("/")[3] ?? "";
    byRegion[region] = (byRegion[region] ?? 0) + 1;
    if (!up) return new Response("down", { status: 503 });
    return Response.json({
      feed: {
        title: "Top Songs",
        updated: "Sun, 8 Nov 2026 11:28:29 +0000",
        results: titles.map((name, i) => ({
          name,
          artistName: "Artist",
          url: `https://music.apple.com/th/album/${i}`,
          artworkUrl100: `https://is1-ssl.mzstatic.com/${i}/100x100bb.jpg`,
        })),
      },
    });
  },
});
const spotify = {
  configured: true,
  async get<T>(path: string): Promise<T | null> {
    if (!path.startsWith("/search")) return null;
    return {
      tracks: {
        items: [
          {
            external_urls: { spotify: "https://open.spotify.com/track/x" },
            album: { images: [{ url: "https://i.scdn.co/album.jpg" }] },
            artists: [{ id: "ar1" }],
          },
        ],
      },
    } as T;
  },
};

let clock = 1_000_000;
const service = () =>
  new ChartService({
    redis,
    chartsUrl: `http://127.0.0.1:${apple.port}`,
    spotify,
    now: () => clock,
    keyPrefix: PREFIX,
  });

beforeEach(async () => {
  await redis.del(chartKey("th", PREFIX), chartKey("us", PREFIX));
  titles = ["Song A", "Song B", "Song C"];
  up = true;
  requests = 0;
  for (const k of Object.keys(byRegion)) delete byRegion[k];
  clock = 1_000_000;
});

afterAll(async () => {
  await redis.del(chartKey("th", PREFIX), chartKey("us", PREFIX));
  await redis.quit();
  apple.stop(true);
});

describe("charts from Apple Music (#109, ADR-0010)", () => {
  test("a chart matches the shared schema, enriched from Spotify, and is cached", async () => {
    const charts = service();
    const chart = ChartSchema.parse(await charts.get("th"));
    expect(chart).toMatchObject({ region: "th", title: "Top Songs", stale: false, fetchedAt: 1_000_000 });
    expect(chart.entries.map((e) => [e.rank, e.title, e.movement])).toEqual([
      [1, "Song A", null],
      [2, "Song B", null],
      [3, "Song C", null],
    ]);
    // Apple's 100px artwork, asked for at a size the Dashboard can use.
    expect(chart.entries[0]?.artwork).toBe("https://is1-ssl.mzstatic.com/0/300x300bb.jpg");
    expect(chart.entries[0]?.spotifyUrl).toBe("https://open.spotify.com/track/x");
    await charts.get("th");
    expect(requests).toBe(1);
  });

  test("after 3 days it refreshes, and each song's movement is against the previous update", async () => {
    const charts = service();
    await charts.get("th");
    titles = ["Song B", "Song A", "Song D"];
    clock += CHART_REFRESH_MS - 1;
    expect((await charts.get("th")).entries[0]?.title).toBe("Song A");
    clock += 1;
    await charts.tick();
    const chart = await charts.get("th");
    // The tick refreshed Thailand (due) and fetched the US chart for the first time.
    expect(byRegion).toEqual({ th: 2, us: 1 });
    expect(chart.entries.map((e) => [e.title, e.movement, e.previousRank])).toEqual([
      ["Song B", "up", 2],
      ["Song A", "down", 1],
      ["Song D", "new", null],
    ]);
  });

  test("when Apple fails, the last good chart is served as stale; with none, it is unavailable", async () => {
    const charts = service();
    up = false;
    await expect(charts.get("us")).rejects.toThrow("chart unavailable");
    up = true;
    await charts.get("us");
    up = false;
    clock += CHART_REFRESH_MS;
    const chart = await charts.get("us");
    expect(chart.stale).toBe(true);
    expect(chart.entries).toHaveLength(3);
  });
});

describe("GET /api/charts/:region (#109)", () => {
  let app: INestApplication;
  let url: string;
  let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
  beforeAll(async () => {
    discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
    app = await createApp({
      redisUrl,
      dashboardOrigin: "http://localhost:3000",
      supabase: localSupabase(),
      discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
      chartsUrl: `http://127.0.0.1:${apple.port}`,
      chartsKeyPrefix: PREFIX,
    });
    await app.listen(0);
    url = await app.getUrl();
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    discord?.stop();
  });

  test("answers the chart, 503 when it cannot, and 404 for a region it does not have", async () => {
    const ok = await fetch(`${url}/api/charts/th`);
    expect(ok.status).toBe(200);
    expect(ChartSchema.parse(await ok.json()).entries).toHaveLength(3);
    up = false;
    expect((await fetch(`${url}/api/charts/us`)).status).toBe(503);
    expect((await fetch(`${url}/api/charts/global`)).status).toBe(404);
  });
});
