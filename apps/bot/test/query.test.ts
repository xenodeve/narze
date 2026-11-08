import { describe, expect, test } from "bun:test";
import { resolveQuery } from "../src/music/query";

describe("what the Bot asks Lavalink for (spec #3, #55)", () => {
  test("free text searches Spotify first when the node has it, else YouTube Music", () => {
    expect(resolveQuery("lemon", ["spotify", "youtube"])).toEqual({ ok: true, query: "lemon", source: "spsearch" });
    expect(resolveQuery("  lemon ", ["youtube"])).toEqual({ ok: true, query: "lemon", source: "ytmsearch" });
  });

  test("a URL goes to Lavalink as it is", () => {
    const url = "https://open.spotify.com/track/abc";
    expect(resolveQuery(url, ["youtube"])).toEqual({ ok: true, query: url });
  });

  test("a YouTube Mix (list=RD…) keeps its link: radio playlists do not load as YouTube Music playlists (spec #65)", () => {
    const mix = "https://www.youtube.com/watch?v=lemon&list=RDlemon";
    expect(resolveQuery(mix, [])).toEqual({ ok: true, query: mix });
  });

  test("a YouTube playlist link becomes the YouTube Music playlist, keeping everything after list=", () => {
    expect(resolveQuery("https://www.youtube.com/watch?v=x&list=PL123&index=4", [])).toEqual({
      ok: true,
      query: "https://music.youtube.com/playlist?list=PL123&index=4",
    });
  });

  test("URLs that point inside the network are refused (Lavalink would fetch them)", () => {
    for (const url of [
      "http://localhost:6379/",
      "http://127.0.0.1/a.mp3",
      "http://10.0.0.5/x",
      "http://192.168.1.21:4599/",
      "http://172.20.0.3/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://redis/",
    ]) {
      expect(resolveQuery(url, [])).toEqual({ ok: false, reason: "unsupported" });
    }
    expect(resolveQuery("https://cdn.example.com/song.mp3", [])).toEqual({
      ok: true,
      query: "https://cdn.example.com/song.mp3",
    });
  });

  test("Deezer and Apple Music are refused, and an empty query is an error", () => {
    expect(resolveQuery("https://www.deezer.com/track/1", [])).toEqual({ ok: false, reason: "unsupported" });
    expect(resolveQuery("https://music.apple.com/th/album/x", [])).toEqual({ ok: false, reason: "unsupported" });
    expect(resolveQuery("   ", [])).toEqual({ ok: false, reason: "empty" });
  });
});
