import { describe, expect, test } from "bun:test";
import {
  ImportPreviewSchema,
  importLink,
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
    const platform = (link: string) => importLink(link)?.platform ?? null;
    expect(platform("https://open.spotify.com/playlist/abc")).toBe("spotify");
    expect(platform("https://open.spotify.com/intl-th/playlist/abc")).toBe("spotify");
    expect(platform("https://www.youtube.com/playlist?list=PL1")).toBe("youtube");
    expect(platform("https://music.youtube.com/playlist?list=PL1")).toBe("youtube");
    expect(platform("https://youtu.be/x?list=PL1")).toBe("youtube");
    expect(platform("http://169.254.169.254/playlist")).toBeNull();
    expect(platform("https://soundcloud.com/a/sets/b")).toBeNull();
    expect(platform("https://open.spotify.com.evil.test/playlist/abc")).toBeNull();
    // Spec #89: playlists only; an album is not a playlist.
    expect(platform("https://open.spotify.com/album/abc")).toBeNull();
  });

  test("the link that is loaded is the link that was checked (normalised once)", () => {
    expect(importLink("  https://OPEN.spotify.com/playlist/abc ")?.href).toBe("https://open.spotify.com/playlist/abc");
  });

  test("a new playlist needs a name; a change can only touch name, description and tracks", () => {
    expect(NewPlaylistSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(NewPlaylistSchema.parse({ name: "Mine", tracks: [track] }).tracks).toHaveLength(1);
    // v5's PUT took any field, including the owner (mass assignment).
    expect(PlaylistChangeSchema.parse({ name: "New", ownerId: "evil" })).toEqual({ name: "New" });
    expect(PlaylistChangeSchema.safeParse({}).success).toBe(false);
  });

  test("a track must have a uri to play, a whole-ms duration and a real added-at time", () => {
    expect(PlaylistTrackSchema.safeParse({ ...track, uri: "" }).success).toBe(false);
    expect(PlaylistTrackSchema.safeParse({ ...track, duration: 1.5 }).success).toBe(false);
    expect(PlaylistTrackSchema.safeParse({ ...track, addedAt: "x" }).success).toBe(false);
    expect(PlaylistTrackSchema.safeParse({ ...track, addedAt: "2026-01-02T03:04:05Z" }).success).toBe(true);
  });
});
