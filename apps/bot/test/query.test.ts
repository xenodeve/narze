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

  test("a YouTube playlist link becomes the YouTube Music playlist, keeping everything after list=", () => {
    expect(resolveQuery("https://www.youtube.com/watch?v=x&list=PL123&index=4", [])).toEqual({
      ok: true,
      query: "https://music.youtube.com/playlist?list=PL123&index=4",
    });
  });

  test("Deezer and Apple Music are refused, and an empty query is an error", () => {
    expect(resolveQuery("https://www.deezer.com/track/1", [])).toEqual({ ok: false, reason: "unsupported" });
    expect(resolveQuery("https://music.apple.com/th/album/x", [])).toEqual({ ok: false, reason: "unsupported" });
    expect(resolveQuery("   ", [])).toEqual({ ok: false, reason: "empty" });
  });
});
