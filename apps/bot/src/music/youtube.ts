import { createTtlCache, WEEK_MS } from "@narze/shared/ttl-cache";

/** What the YouTube Data API says about a video, for music-vs-video (spec #48, #62). */
export interface VideoFacts {
  categoryId: string | null;
  description: string;
  topics: string[];
}

/**
 * YouTube lookups. The Data API is used only with `YOUTUBE_API_KEY` (from the environment, never
 * in source); without it the Bot classifies from what Lavalink gives it. Categories are cached for
 * 7 days (spec #73).
 */
export function createYouTube({
  apiKey,
  fetch = globalThis.fetch,
  now = Date.now,
}: {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
} = {}) {
  const facts = createTtlCache<string, VideoFacts>({ ttlMs: WEEK_MS, max: 5000, now });
  return {
    cacheStats: () => facts.stats(),
    async videoFacts(videoId: string): Promise<VideoFacts | null> {
      if (!apiKey) return null;
      const cached = facts.get(videoId);
      if (cached) return cached;
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,topicDetails");
      url.searchParams.set("id", videoId);
      url.searchParams.set("key", apiKey);
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (!res?.ok) return null;
      const body = (await res.json().catch(() => null)) as {
        items?: Array<{
          snippet?: { categoryId?: string; description?: string };
          topicDetails?: { topicCategories?: string[] };
        }>;
      } | null;
      const item = body?.items?.[0];
      if (!item) return null;
      const found: VideoFacts = {
        categoryId: item.snippet?.categoryId ?? null,
        description: item.snippet?.description ?? "",
        topics: item.topicDetails?.topicCategories ?? [],
      };
      facts.set(videoId, found);
      return found;
    },

    /** A YouTube playlist page's og:image (spec #64). Only YouTube's own pages are fetched. */
    async pageImage(pageUrl: string): Promise<string | null> {
      let url: URL;
      try {
        url = new URL(pageUrl);
      } catch {
        return null;
      }
      if (url.protocol !== "https:" || !/(^|\.)youtube\.com$/.test(url.hostname)) return null;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (!res?.ok) return null;
      const html = await res.text().catch(() => "");
      return /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? null;
    },
  };
}

export type YouTube = ReturnType<typeof createYouTube>;
