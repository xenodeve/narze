import { describe, expect, mock, test } from "bun:test";
import { SearchResponseSchema } from "@narze/shared";
import { createSpotifyApi } from "@narze/shared/spotify-api";
import { SearchService } from "../src/search/search-service";
import { createYouTubeChannels } from "../src/search/youtube-channels";

const lavalinkTrack = (title: string, author: string, uri: string) => ({
  encoded: `e-${title}`,
  info: {
    identifier: title.toLowerCase(),
    title,
    author,
    length: 200_000,
    uri,
    artworkUrl: null,
    sourceName: "youtube",
  },
});

/** A fetch answering by URL prefix; records each call. */
function fakeFetch(routes: Array<[string, (url: URL) => unknown]>) {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url.toString());
    const route = routes.find(([prefix]) => url.toString().startsWith(prefix));
    return route ? Response.json(route[1](url)) : new Response("nope", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const spotifyRoutes: Array<[string, (url: URL) => unknown]> = [
  ["https://accounts.spotify.com/api/token", () => ({ access_token: "t", expires_in: 3600 })],
  [
    "https://api.spotify.com/v1/search",
    (url) =>
      url.searchParams.get("type") === "track"
        ? {
            tracks: {
              items: [
                {
                  id: "t1",
                  name: "Idol",
                  duration_ms: 213_000,
                  artists: [{ id: "a1", name: "YOASOBI" }],
                  album: { id: "al1", name: "Idol", images: [{ url: "https://i.scdn.co/idol", width: 640 }] },
                  external_urls: { spotify: "https://open.spotify.com/track/t1" },
                },
              ],
            },
          }
        : {
            artists: { items: [{ id: "a1", name: "YOASOBI", images: [], followers: { total: 9 }, genres: ["j-pop"] }] },
            albums: {
              items: [
                { id: "al2", name: "THE BOOK", artists: [{ id: "a1", name: "YOASOBI" }], images: [], total_tracks: 10 },
              ],
            },
          },
  ],
  [
    "https://api.spotify.com/v1/artists/a1/top-tracks",
    () => ({
      tracks: [
        {
          id: "t1",
          name: "Idol",
          duration_ms: 1,
          artists: [{ id: "a1", name: "YOASOBI" }],
          album: { id: "al1", name: "Idol", images: [] },
          external_urls: {},
        },
      ],
    }),
  ],
  [
    "https://api.spotify.com/v1/artists/a1/albums",
    () => ({
      items: [
        {
          id: "al2",
          name: "THE BOOK",
          images: [],
          release_date: "2021",
          total_tracks: 10,
          album_type: "album",
          external_urls: {},
        },
      ],
    }),
  ],
  [
    "https://api.spotify.com/v1/artists/a1",
    () => ({ id: "a1", name: "YOASOBI", images: [], followers: { total: 9 }, genres: ["j-pop"], external_urls: {} }),
  ],
  [
    "https://api.spotify.com/v1/albums/al2",
    () => ({
      id: "al2",
      name: "THE BOOK",
      artists: [{ id: "a1", name: "YOASOBI" }],
      images: [],
      release_date: "2021",
      total_tracks: 2,
      tracks: {
        items: [
          { id: "x1", name: "Yoru", duration_ms: 1, artists: [{ name: "YOASOBI" }], external_urls: {} },
          { id: "x2", name: "Ano", duration_ms: 1, artists: [{ name: "YOASOBI" }], external_urls: {} },
        ],
      },
    }),
  ],
];

const youtubeRoutes: Array<[string, (url: URL) => unknown]> = [
  ["https://www.googleapis.com/youtube/v3/search", () => ({ items: [{ id: { channelId: "UC1" } }] })],
  [
    "https://www.googleapis.com/youtube/v3/channels",
    () => ({
      items: [
        {
          id: "UC1",
          snippet: { title: "YOASOBI", description: "d".repeat(300), thumbnails: { high: { url: "https://yt3/x" } } },
          statistics: { subscriberCount: "100", hiddenSubscriberCount: false },
        },
      ],
    }),
  ],
];

function service({ tracks = [lavalinkTrack("Idol", "YOASOBI", "https://music.youtube.com/watch?v=idol")] } = {}) {
  const { fetch, calls } = fakeFetch([...spotifyRoutes, ...youtubeRoutes]);
  const loadTracks = mock(async (identifier: string) =>
    tracks.length ? { loadType: "search", data: tracks, identifier } : { loadType: "empty", data: {}, identifier },
  );
  const search = new SearchService({
    loadTracks,
    spotify: createSpotifyApi({ clientId: "id", clientSecret: "secret", fetch }),
    youtube: createYouTubeChannels({ apiKey: "k", fetch }),
  });
  return { search, loadTracks, calls };
}

describe("catalog search, every mode answers the shared schema (#105, spec #49, #57–#61)", () => {
  test("spotify-api: Web API tracks, artists and albums; a repeat is served from the cache", async () => {
    const { search, calls } = service();
    const first = await search.search("yoasobi", "spotify-api");
    expect(SearchResponseSchema.parse(first)).toMatchObject({ source: "spotify-api", fromCache: false });
    expect(first.tracks[0]).toMatchObject({
      id: "t1",
      title: "Idol",
      artist: "YOASOBI",
      uri: "https://open.spotify.com/track/t1",
    });
    expect(first.topResult).toMatchObject({ type: "artist", score: 1.1 });
    expect(calls.some((c) => c.includes("market=TH"))).toBe(true);
    expect((await search.search("yoasobi", "spotify-api")).fromCache).toBe(true);
  });

  test("spotify: Lavalink tracks plus Spotify artists and albums; an empty result is never cached (#59)", async () => {
    const { search, loadTracks } = service();
    const found = SearchResponseSchema.parse(await search.search("idol", "spotify"));
    expect(found.tracks[0]).toMatchObject({ title: "Idol", artist: "YOASOBI" });
    expect(found.artists[0]?.name).toBe("YOASOBI");
    expect(loadTracks.mock.calls[0]?.[0]).toBe("spsearch:idol");

    const empty = service({ tracks: [] });
    await empty.search.search("nothing", "spotify");
    await empty.search.search("nothing", "spotify");
    // Not cached: each search asks again (spsearch, then ytmsearch).
    expect(empty.loadTracks).toHaveBeenCalledTimes(4);
  });

  test("youtube and youtubemusic: their search prefix, channels as artists, never cached", async () => {
    const { search, loadTracks, calls } = service();
    const yt = SearchResponseSchema.parse(await search.search("yoasobi", "youtube"));
    expect(loadTracks.mock.calls[0]?.[0]).toBe("ytsearch:yoasobi");
    expect(yt.artists[0]).toMatchObject({
      id: "UC1",
      name: "YOASOBI",
      followers: 100,
      youtubeUrl: "https://www.youtube.com/channel/UC1",
    });
    expect(yt.topResult).toMatchObject({ type: "artist", score: 1 });
    expect(yt.albums).toEqual([]);

    await search.search("yoasobi", "youtubemusic");
    expect(loadTracks.mock.calls[1]?.[0]).toBe("ytmsearch:yoasobi");
    expect(calls.some((c) => c.includes("q=yoasobi+official+artist"))).toBe(true);
    await search.search("yoasobi", "youtube");
    expect(loadTracks).toHaveBeenCalledTimes(3);
  });
});

describe("catalog pages (#105, spec #60, #61)", () => {
  test("an artist: its profile, top tracks in TH and albums and singles (20)", async () => {
    const { search, calls } = service();
    const page = await search.artist("a1");
    expect(page?.artist).toMatchObject({ id: "a1", name: "YOASOBI", followers: 9 });
    expect(page?.topTracks[0]).toMatchObject({ id: "t1", title: "Idol" });
    expect(page?.albums[0]).toMatchObject({ id: "al2", name: "THE BOOK", trackCount: 10 });
    expect(calls.some((c) => c.includes("/top-tracks") && c.includes("market=TH"))).toBe(true);
    expect(calls.some((c) => c.includes("include_groups=album%2Csingle") && c.includes("limit=20"))).toBe(true);
  });

  test("an album lists every track; an unknown one is null", async () => {
    const { search } = service();
    expect((await search.album("al2"))?.tracks.map((t) => t.title)).toEqual(["Yoru", "Ano"]);
    expect(await search.album("missing")).toBeNull();
  });

  test("a YouTube channel: its info (description cut to 200) and `<name> official` tracks", async () => {
    const { search, loadTracks } = service();
    const page = await search.channel("UC1");
    expect(page?.channel).toMatchObject({ id: "UC1", name: "YOASOBI", subscribers: 100 });
    expect(page?.channel.description).toHaveLength(200);
    expect(loadTracks.mock.calls.at(-1)?.[0]).toBe("ytsearch:YOASOBI official");
    expect(page?.tracks[0]?.title).toBe("Idol");
  });
});

describe("#105 review fixes", () => {
  test("spotify mode asks Lavalink with spsearch:, and falls back to ytmsearch: when Spotify finds nothing", async () => {
    const { fetch } = fakeFetch([...spotifyRoutes, ...youtubeRoutes]);
    const asked: string[] = [];
    const search = new SearchService({
      loadTracks: async (identifier) => {
        asked.push(identifier);
        // A real node treats prefix-less words as an identifier and finds nothing.
        return identifier.startsWith("ytmsearch:")
          ? { loadType: "search", data: [lavalinkTrack("Idol", "YOASOBI", "https://music.youtube.com/watch?v=idol")] }
          : { loadType: "empty", data: {} };
      },
      spotify: createSpotifyApi({ clientId: "id", clientSecret: "secret", fetch }),
      youtube: createYouTubeChannels({ apiKey: "k", fetch }),
    });
    const found = await search.search("idol", "spotify");
    expect(asked).toEqual(["spsearch:idol", "ytmsearch:idol"]);
    expect(found.tracks[0]?.title).toBe("Idol");
  });

  test("spotify-api keeps v5's own top result: exact artist, exact track, first track 0.9, first artist 0.8", async () => {
    const { search } = service();
    expect((await search.search("idol", "spotify-api")).topResult).toMatchObject({ type: "track", score: 1.1 });
    expect((await search.search("something else", "spotify-api")).topResult).toMatchObject({
      type: "track",
      score: 0.9,
    });
  });

  test("a YouTube upload that is not YouTube Music is marked as a video (VIDEO chip)", async () => {
    const { search } = service({
      tracks: [
        lavalinkTrack("Clip", "Some Channel", "https://www.youtube.com/watch?v=clip"),
        lavalinkTrack("Song", "LiSA - Topic", "https://www.youtube.com/watch?v=song"),
      ],
    });
    const found = await search.search("x", "youtube");
    expect(found.tracks.map((t) => t.isVideo)).toEqual([true, false]);
  });

  test("a YouTube channel search is cached for 30 minutes (spec #73: the API quota)", async () => {
    const { search, calls } = service();
    await search.search("yoasobi", "youtube");
    await search.search("yoasobi", "youtube");
    expect(calls.filter((c) => c.includes("/youtube/v3/search")).length).toBe(1);
  });

  test("an album longer than one page lists every track", async () => {
    const page = (ids: string[], next: string | null) => ({
      items: ids.map((id) => ({ id, name: id, duration_ms: 1, artists: [{ name: "A" }], external_urls: {} })),
      next,
    });
    const { fetch } = fakeFetch([
      ["https://accounts.spotify.com/api/token", () => ({ access_token: "t", expires_in: 3600 })],
      ["https://api.spotify.com/v1/albums/long/tracks", () => page(["c"], null)],
      [
        "https://api.spotify.com/v1/albums/long",
        () => ({
          id: "long",
          name: "Long",
          artists: [{ name: "A" }],
          images: [],
          tracks: page(["a", "b"], "https://api.spotify.com/v1/albums/long/tracks?offset=2"),
        }),
      ],
    ]);
    const search = new SearchService({
      loadTracks: async () => ({ loadType: "empty", data: {} }),
      spotify: createSpotifyApi({ clientId: "id", clientSecret: "secret", fetch }),
      youtube: createYouTubeChannels({ fetch }),
    });
    expect((await search.album("long"))?.tracks.map((t) => t.title)).toEqual(["a", "b", "c"]);
  });
});

test("no Lavalink mode ever hands Lavalink a bare URL: a pasted link is search text (SSRF, #105 review)", async () => {
  const { search, loadTracks } = service();
  for (const source of ["spotify", "youtube", "youtubemusic"] as const) {
    await search.search("http://169.254.169.254/latest/meta-data", source);
  }
  for (const [identifier] of loadTracks.mock.calls) expect(identifier).toMatch(/^(spsearch|ytsearch|ytmsearch):/);
});
