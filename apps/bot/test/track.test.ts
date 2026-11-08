import { describe, expect, test } from "bun:test";
import { TrackSchema } from "@narze/shared";
import { toTrack } from "../src/music/track";

const requester = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const lavalinkTrack = (info: Record<string, unknown>) =>
  ({
    encoded: "x",
    info: { title: "Lemon", author: "Kenshi Yonezu", duration: 255_000, artworkUrl: null, ...info },
    requester,
  }) as never;

describe("a Lavalink track as a Player State track (spec #3, #5)", () => {
  test("YouTube links are rewritten to YouTube Music and marked as such", () => {
    const track = toTrack(lavalinkTrack({ uri: "https://www.youtube.com/watch?v=x", sourceName: "youtube" }));
    expect(track).toMatchObject({ uri: "https://music.youtube.com/watch?v=x", source: "youtubemusic" });
    expect(TrackSchema.safeParse(track).success).toBe(true);
  });

  test("every track carries its requester", () => {
    expect(
      toTrack(lavalinkTrack({ uri: "https://open.spotify.com/track/a", sourceName: "spotify" }))?.requester,
    ).toEqual(requester);
  });

  test("a track without a uri or requester has no identity", () => {
    expect(toTrack(lavalinkTrack({ uri: "", sourceName: "youtube" }))).toBeNull();
    expect(toTrack({ encoded: "x", info: { uri: "https://x.test/a", sourceName: "http" } } as never)).toBeNull();
  });
});
