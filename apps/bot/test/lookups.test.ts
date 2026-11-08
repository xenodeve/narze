import { describe, expect, test } from "bun:test";
import { createSpotify } from "../src/music/spotify";
import { createYouTube } from "../src/music/youtube";

/** A fetch that answers by URL prefix and records every call. */
function fakeFetch(routes: Array<[string, () => unknown]>) {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    if (!route) return new Response("not found", { status: 404 });
    const body = route[1]();
    return typeof body === "string" ? new Response(body) : Response.json(body);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("YouTube lookups (#104, spec #48, #73)", () => {
  test("without an API key nothing is asked", async () => {
    const { fetch, calls } = fakeFetch([]);
    expect(await createYouTube({ fetch }).videoFacts("abc")).toBeNull();
    expect(calls).toEqual([]);
  });

  test("a video's category, topics and description, cached for 7 days", async () => {
    let clock = 0;
    const { fetch, calls } = fakeFetch([
      [
        "https://www.googleapis.com/youtube/v3/videos",
        () => ({
          items: [
            {
              snippet: { categoryId: "10", description: "Provided to YouTube by X" },
              topicDetails: { topicCategories: ["https://en.wikipedia.org/wiki/Music"] },
            },
          ],
        }),
      ],
    ]);
    const youtube = createYouTube({ apiKey: "k", fetch, now: () => clock });
    const facts = {
      categoryId: "10",
      description: "Provided to YouTube by X",
      topics: ["https://en.wikipedia.org/wiki/Music"],
    };
    expect(await youtube.videoFacts("abc")).toEqual(facts);
    clock = 7 * 24 * 3600_000 - 1;
    expect(await youtube.videoFacts("abc")).toEqual(facts);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("id=abc");
  });

  test("a YouTube playlist page's og:image; other hosts are never fetched", async () => {
    const { fetch, calls } = fakeFetch([
      [
        "https://www.youtube.com/playlist",
        () => '<meta property="og:image" content="https://i.ytimg.com/vi/x/hqdefault.jpg">',
      ],
    ]);
    const youtube = createYouTube({ fetch });
    expect(await youtube.pageImage("https://www.youtube.com/playlist?list=PL1")).toBe(
      "https://i.ytimg.com/vi/x/hqdefault.jpg",
    );
    expect(await youtube.pageImage("http://127.0.0.1/admin")).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("Spotify lookups (#104, spec #67, #73)", () => {
  const token = (expires_in = 3600) => ({ access_token: `t${expires_in}`, expires_in });

  test("without credentials nothing is asked", async () => {
    const { fetch, calls } = fakeFetch([]);
    expect(await createSpotify({ fetch }).artistImage("LiSA")).toBeNull();
    expect(calls).toEqual([]);
  });

  test("an artist's largest image, cached for 7 days; the token is reused until 5 min before it expires", async () => {
    let clock = 0;
    const { fetch, calls } = fakeFetch([
      ["https://accounts.spotify.com/api/token", () => token()],
      [
        "https://api.spotify.com/v1/search",
        () => ({
          artists: {
            items: [
              {
                images: [
                  { url: "https://i.scdn.co/big", width: 640 },
                  { url: "https://i.scdn.co/small", width: 64 },
                ],
              },
            ],
          },
        }),
      ],
    ]);
    const spotify = createSpotify({ clientId: "id", clientSecret: "secret", fetch, now: () => clock });
    expect(await spotify.artistImage("LiSA")).toBe("https://i.scdn.co/big");
    expect(await spotify.artistImage("LiSA")).toBe("https://i.scdn.co/big");
    clock = (3600 - 300) * 1000 - 1;
    await spotify.artistImage("YOASOBI");
    expect(calls.filter((c) => c.includes("/api/token"))).toHaveLength(1);
    clock = (3600 - 300) * 1000;
    await spotify.artistImage("Aimer");
    expect(calls.filter((c) => c.includes("/api/token"))).toHaveLength(2);
    expect(calls.filter((c) => c.includes("/v1/search"))).toHaveLength(3);
  });

  test("a Spotify playlist's largest image", async () => {
    const { fetch } = fakeFetch([
      ["https://accounts.spotify.com/api/token", () => token()],
      [
        "https://api.spotify.com/v1/playlists/PL9",
        () => ({
          images: [
            { url: "https://i.scdn.co/s", width: 60 },
            { url: "https://i.scdn.co/l", width: 640 },
          ],
        }),
      ],
    ]);
    const spotify = createSpotify({ clientId: "id", clientSecret: "secret", fetch });
    expect(await spotify.playlistImage("https://open.spotify.com/playlist/PL9?si=x")).toBe("https://i.scdn.co/l");
    expect(await spotify.playlistImage("https://music.youtube.com/playlist?list=PL")).toBeNull();
  });
});
