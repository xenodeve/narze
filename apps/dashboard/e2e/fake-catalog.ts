/**
 * The catalog's outside world for the Dashboard e2e (#105): Fake Lavalink for the Lavalink modes
 * and a fake Spotify Web API (token, search, artist, top tracks, albums, album). Run by Playwright
 * as a web server; the Backend is pointed here through its environment.
 */
import { startFakeLavalink } from "@narze/fake-lavalink";

export const FAKE_LAVALINK_PORT = 4610;
export const FAKE_SPOTIFY_PORT = 4611;

const idol = {
  id: "t1",
  name: "Idol",
  duration_ms: 213_000,
  artists: [{ id: "a1", name: "YOASOBI" }],
  album: { id: "al1", name: "Idol", images: [] },
  external_urls: { spotify: "https://open.spotify.com/track/t1" },
};
const yoasobi = {
  id: "a1",
  name: "YOASOBI",
  images: [],
  followers: { total: 9000 },
  genres: ["j-pop"],
  external_urls: { spotify: "https://open.spotify.com/artist/a1" },
};
const book = {
  id: "al2",
  name: "THE BOOK",
  artists: [{ id: "a1", name: "YOASOBI" }],
  images: [],
  release_date: "2021-01-06",
  total_tracks: 10,
  album_type: "album",
  external_urls: { spotify: "https://open.spotify.com/album/al2" },
};

await startFakeLavalink({
  password: "e2e",
  port: FAKE_LAVALINK_PORT,
  catalog: [
    { title: "Lemon", author: "Kenshi Yonezu", uri: "https://music.youtube.com/watch?v=lemon", lengthMs: 255_000 },
  ],
  // The Library import (#107).
  playlists: [
    {
      name: "E2E Mix",
      url: "https://www.youtube.com/playlist?list=PLE2E",
      tracks: [
        { title: "Lemon", author: "Kenshi Yonezu", uri: "https://music.youtube.com/watch?v=lemon", lengthMs: 255_000 },
        { title: "Idol", author: "YOASOBI", uri: "https://music.youtube.com/watch?v=idol", lengthMs: 213_000 },
      ],
    },
  ],
});

Bun.serve({
  port: FAKE_SPOTIFY_PORT,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/api/token") return Response.json({ access_token: "e2e", expires_in: 3600 });
    if (path === "/v1/search") {
      return Response.json(
        url.searchParams.get("type") === "track"
          ? { tracks: { items: [idol] } }
          : { artists: { items: [yoasobi] }, albums: { items: [book] } },
      );
    }
    if (path === "/v1/artists/a1") return Response.json(yoasobi);
    if (path === "/v1/artists/a1/top-tracks") return Response.json({ tracks: [idol] });
    if (path === "/v1/artists/a1/albums") return Response.json({ items: [book] });
    if (path === "/v1/albums/al2") return Response.json({ ...book, tracks: { items: [idol] } });
    return new Response("not found", { status: 404 });
  },
});
console.log(`[fake-catalog] lavalink :${FAKE_LAVALINK_PORT}, spotify :${FAKE_SPOTIFY_PORT}`);
