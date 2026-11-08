import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Track, trackKey } from "@narze/shared";
import { createHistory, createSessionFile, playFlags } from "../src/history/history";

const G = "939000000000000001";
const uma = { id: "100000000000000001", name: "Uma", avatarUrl: null };
const track = (over: Partial<Track> = {}): Track => ({
  uri: "https://www.youtube.com/watch?v=abcdefghijk",
  source: "youtube",
  title: "Idol",
  author: "YOASOBI",
  durationMs: 213_000,
  artworkUrl: null,
  requester: uma,
  ...over,
});

describe("isMusic / isVideo (#108, spec #33, #115)", () => {
  test("Spotify and YouTube Music are music; a YouTube upload asks the category", async () => {
    expect(await playFlags(track({ source: "spotify", uri: "https://open.spotify.com/track/x" }))).toEqual({
      isMusic: true,
      isVideo: false,
    });
    expect(await playFlags(track({ uri: "https://music.youtube.com/watch?v=abcdefghijk" }))).toEqual({
      isMusic: true,
      isVideo: false,
    });
    const facts = async (id: string) =>
      id === "abcdefghijk" ? { categoryId: "10", topics: [], description: "" } : null;
    expect(await playFlags(track(), facts)).toEqual({ isMusic: true, isVideo: false });
    expect(await playFlags(track(), async () => ({ categoryId: "24", topics: [], description: "" }))).toEqual({
      isMusic: false,
      isVideo: true,
    });
    // "- Topic" channels are music even without the YouTube Data API.
    expect(await playFlags(track({ author: "YOASOBI - Topic" }))).toEqual({ isMusic: true, isVideo: false });
  });
});

describe("the local sessions file (#108)", () => {
  test("round-trips, and a damaged file reads as nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sessions-"));
    try {
      const file = createSessionFile(join(dir, "listening-sessions.json"));
      expect(await file.read()).toEqual([]);
      const session = {
        id: `${G}-1`,
        guildId: G,
        guildName: "Club",
        channelId: null,
        startTime: 1,
        endTime: null,
        isActive: true,
        tracks: [],
        participants: [],
      };
      await file.write([session]);
      expect(await file.read()).toEqual([session]);
      expect((await readdir(dir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
      await writeFile(join(dir, "listening-sessions.json"), "{not json");
      expect(await file.read()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("a track start (#108)", () => {
  test("joins the session with the room's members and records one play for the requester", async () => {
    const plays: unknown[] = [];
    const saves: Array<{ participants: Array<{ id: string }> }> = [];
    const history = createHistory({
      store: {
        save: async (s) => void saves.push(structuredClone(s)),
        closeActive: async () => {},
        recordPlay: async (guildId, discordId, play) => void plays.push({ guildId, discordId, play }),
      },
      file: { read: async () => [], write: async () => {} },
      publish: () => {},
      guildName: () => "Club",
      members: () => [{ id: "100000000000000002", name: "Val", avatarUrl: null }],
    });
    history.hook.trackStarted(G, track({ source: "spotify", uri: "https://open.spotify.com/track/x" }), "93");
    await Bun.sleep(5);
    expect(saves[0]?.participants.map((p) => p.id)).toEqual(["100000000000000002", uma.id]);
    expect(plays).toEqual([
      {
        guildId: G,
        discordId: uma.id,
        play: {
          trackId: trackKey("Idol", "YOASOBI"),
          title: "Idol",
          artist: "YOASOBI",
          uri: "https://open.spotify.com/track/x",
          thumbnail: null,
          durationMs: 213_000,
          source: "spotify",
          isMusic: true,
          isVideo: false,
        },
      },
    ]);
  });
});
