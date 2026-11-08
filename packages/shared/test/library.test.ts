import { describe, expect, test } from "bun:test";
import {
  ImportPreviewSchema,
  importPlatform,
  NewPlaylistSchema,
  PlaylistChangeSchema,
  PlaylistTrackSchema,
} from "../src/library";

const track = { title: "Idol", artist: "YOASOBI", duration: 213_000, thumbnail: null, uri: "https://x.test/idol" };

describe("Library contract (#107, spec #50, #71, #89)", () => {
  test("an import preview has spec #71's shape", () => {
    const preview = {
      platform: "spotify",
      playlist: { name: "Anime", thumbnail: null, trackCount: 1, owner: "Dee" },
      tracks: [{ ...track, album: "Idol", addedAt: "2026-01-01T00:00:00Z" }],
    };
    expect(ImportPreviewSchema.parse(preview).tracks[0]?.album).toBe("Idol");
  });

  test("only Spotify and YouTube playlist links can be imported (no other host is ever loaded)", () => {
    expect(importPlatform("https://open.spotify.com/playlist/abc")).toBe("spotify");
    expect(importPlatform("https://www.youtube.com/playlist?list=PL1")).toBe("youtube");
    expect(importPlatform("https://music.youtube.com/playlist?list=PL1")).toBe("youtube");
    expect(importPlatform("https://youtu.be/x?list=PL1")).toBe("youtube");
    expect(importPlatform("http://169.254.169.254/playlist")).toBeNull();
    expect(importPlatform("https://soundcloud.com/a/sets/b")).toBeNull();
    expect(importPlatform("https://open.spotify.com.evil.test/playlist/abc")).toBeNull();
  });

  test("a new playlist needs a name; a change can only touch name, description and tracks", () => {
    expect(NewPlaylistSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(NewPlaylistSchema.parse({ name: "Mine", tracks: [track] }).tracks).toHaveLength(1);
    // v5's PUT took any field, including the owner (mass assignment).
    expect(PlaylistChangeSchema.parse({ name: "New", ownerId: "evil" })).toEqual({ name: "New" });
    expect(PlaylistChangeSchema.safeParse({}).success).toBe(false);
  });

  test("a track must have a uri to play", () => {
    expect(PlaylistTrackSchema.safeParse({ ...track, uri: "" }).success).toBe(false);
  });
});
