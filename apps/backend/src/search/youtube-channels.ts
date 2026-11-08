import type { YouTubeChannel } from "@narze/shared";

export type { YouTubeChannel };

interface ChannelItem {
  id: string;
  snippet?: { title?: string; description?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
}

const toChannel = (item: ChannelItem): YouTubeChannel => ({
  id: item.id,
  name: item.snippet?.title ?? "",
  imageUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
  subscribers:
    item.statistics?.hiddenSubscriberCount || item.statistics?.subscriberCount === undefined
      ? undefined
      : Number(item.statistics.subscriberCount),
  // Spec #61: descriptions are cut to 200 characters.
  description: Array.from(item.snippet?.description ?? "")
    .slice(0, 200)
    .join(""),
});

/**
 * YouTube channels as catalog "artists" (spec #57, #61) through the Data API. The key comes only
 * from the environment (`YOUTUBE_API_KEY`); without it there are no channels.
 */
export function createYouTubeChannels({
  apiKey,
  fetch = globalThis.fetch,
}: {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
} = {}) {
  async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    if (!apiKey) return null;
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [key, value] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(key, value);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
  }

  async function channels(ids: string[]): Promise<YouTubeChannel[]> {
    if (ids.length === 0) return [];
    const body = await get<{ items?: ChannelItem[] }>("channels", { part: "snippet,statistics", id: ids.join(",") });
    return (body?.items ?? []).map(toChannel);
  }

  return {
    /** Spec #61: YouTube Music looks for `<query> official artist`. */
    async search(query: string, source: "youtube" | "youtubemusic", limit = 5): Promise<YouTubeChannel[]> {
      const q = source === "youtubemusic" ? `${query} official artist` : query;
      const found = await get<{ items?: Array<{ id?: { channelId?: string } }> }>("search", {
        part: "snippet",
        type: "channel",
        maxResults: String(limit),
        q,
      });
      return channels((found?.items ?? []).flatMap((i) => (i.id?.channelId ? [i.id.channelId] : [])));
    },
    async channel(id: string): Promise<YouTubeChannel | null> {
      return (await channels([id]))[0] ?? null;
    },
  };
}

export type YouTubeChannels = ReturnType<typeof createYouTubeChannels>;
