import { describe, expect, test } from "bun:test";
import type { Track } from "@narze/shared";
import { createArtwork, iconModesFrom } from "../src/music/artwork";
import { DEFAULT_ICON } from "../src/music/format";

const image = { ok: true, contentType: "image/jpeg", contentLength: 50_000 };
const okFor = (urls: string[]) => async (url: string) =>
  urls.includes(url) ? image : { ok: false, contentType: "", contentLength: 0 };
const lavalinkTrack = (info: Record<string, unknown>) => ({ info: { title: "t", author: "a", ...info } }) as never;
const requester = { id: "1", name: "Dee", avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png" };
const track = (over: Partial<Track> = {}): Track => ({
  uri: "https://music.youtube.com/watch?v=abc",
  source: "youtubemusic",
  title: "Idol",
  author: "YOASOBI",
  durationMs: 1,
  artworkUrl: null,
  requester,
  ...over,
});

describe("track artwork (#104, spec #62, #63)", () => {
  test("every YouTube track, music or video, gets a 16:9 picture: maxres, else mq (#181)", async () => {
    const artwork = createArtwork({
      head: okFor([
        "https://img.youtube.com/vi/vid/maxresdefault.jpg",
        "https://img.youtube.com/vi/song/mqdefault.jpg",
        "https://img.youtube.com/vi/song/hqdefault.jpg",
      ]),
    });
    const video = lavalinkTrack({
      sourceName: "youtube",
      identifier: "vid",
      uri: "https://www.youtube.com/watch?v=vid",
    });
    const song = lavalinkTrack({
      sourceName: "youtube",
      identifier: "song",
      uri: "https://www.youtube.com/watch?v=song",
    });
    expect(await artwork.trackArt(video)).toBe("https://img.youtube.com/vi/vid/maxresdefault.jpg");
    expect(await artwork.trackArt(song)).toBe("https://img.youtube.com/vi/song/mqdefault.jpg");
  });

  test("any other source keeps Lavalink's picture only if it is a real image", async () => {
    const art = "https://i.scdn.co/image/x";
    const artwork = createArtwork({ head: okFor([art]) });
    expect(await artwork.trackArt(lavalinkTrack({ sourceName: "spotify", artworkUrl: art, uri: "u" }))).toBe(art);
    expect(
      await artwork.trackArt(lavalinkTrack({ sourceName: "http", artworkUrl: "https://x.test/a", uri: "u" })),
    ).toBeNull();
  });
});

describe("embed author icon (#104, spec #67)", () => {
  test("v5's defaults: artist image for tracks, the bot avatar for a playlist display", () => {
    expect(iconModesFrom({})).toEqual({
      normalTrack: "artistImage",
      playlistDisplay: "botavatar",
      playlistTrack: "artistImage",
    });
    expect(iconModesFrom({ ICON_NORMAL_TRACK: "userimage", ICON_PLAYLIST_TRACK: "nonsense" })).toMatchObject({
      normalTrack: "userimage",
      playlistTrack: "artistImage",
    });
  });

  test("artist image, falling back to the requester, then the bot, then Discord's default", async () => {
    const withArtist = createArtwork({
      spotify: { artistImage: async () => "https://i.scdn.co/artist" },
      botIcon: "https://bot",
    });
    expect(await withArtist.icon(track())).toBe("https://i.scdn.co/artist");
    const none = createArtwork({ spotify: { artistImage: async () => null }, botIcon: "https://bot" });
    expect(await none.icon(track())).toBe(requester.avatarUrl);
    expect(await none.icon(track({ requester: { ...requester, avatarUrl: null } }))).toBe("https://bot");
    const bare = createArtwork({
      modes: { normalTrack: "botavatar", playlistDisplay: "botavatar", playlistTrack: "botavatar" },
    });
    expect(await bare.icon(track())).toBe(DEFAULT_ICON);
  });

  test("a playlist track uses its mode; playlist_thumbnail shows the playlist's picture", async () => {
    const artwork = createArtwork({
      modes: { normalTrack: "botavatar", playlistDisplay: "botavatar", playlistTrack: "playlist_thumbnail" },
      botIcon: "https://bot",
    });
    const fromList = track({ playlist: { name: "p", url: "https://x.test/p", index: 1, total: 2 } });
    expect(await artwork.icon(fromList, "https://i.test/list.jpg")).toBe("https://i.test/list.jpg");
    expect(await artwork.icon(track())).toBe("https://bot");
  });
});

describe("playlist picture (#104, spec #64)", () => {
  test("Spotify's playlist image, else the YouTube page image, else the first track's", async () => {
    const own = "https://i.scdn.co/list";
    const page = "https://i.ytimg.com/vi/x/hqdefault.jpg";
    const artwork = createArtwork({
      head: okFor([own, page]),
      spotify: { playlistImage: async (u) => (u.includes("spotify") ? own : null) },
      youtube: { pageImage: async (u) => (u.includes("youtube") ? page : null) },
    });
    expect(await artwork.playlistArt("https://open.spotify.com/playlist/1", "first")).toBe(own);
    // The page image is 4:3 (hqdefault); with no larger size answering, its 16:9 mqdefault is used (#181).
    expect(await artwork.playlistArt("https://www.youtube.com/playlist?list=1", "first")).toBe(
      "https://i.ytimg.com/vi/x/mqdefault.jpg",
    );
    expect(await artwork.playlistArt("https://soundcloud.com/x/sets/y", "first")).toBe("first");
  });
});
