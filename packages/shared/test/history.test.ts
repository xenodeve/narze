import { describe, expect, test } from "bun:test";
import { ListeningSessionSchema, sessionSummary, TopPlayedSchema, trackKey } from "../src/history";

const requester = { id: "100000000000000001", name: "Uma", avatarUrl: null };

describe("Play History track id (#108, spec #116)", () => {
  test("v5's key: base64 of `title-author`, with / + = made safe", () => {
    // base64("Idol-YOASOBI") = "SWRvbC1ZT0FTT0JJ" (no padding to replace)
    expect(trackKey("Idol", "YOASOBI")).toBe("SWRvbC1ZT0FTT0JJ");
    // base64("a-b") = "YS1i"; base64("ab-c") = "YWItYw==" → "YWItYw__"
    expect(trackKey("ab", "c")).toBe("YWItYw__");
    // "?>?-" encodes to "Pz4/LQ==": the slash and the padding both become "_".
    expect(trackKey("?>?", "")).toBe("Pz4_LQ__");
  });

  test("the same song from two sources is one id; case and spelling still matter", () => {
    expect(trackKey("Lemon", "Kenshi Yonezu")).toBe(trackKey("Lemon", "Kenshi Yonezu"));
    expect(trackKey("lemon", "Kenshi Yonezu")).not.toBe(trackKey("Lemon", "Kenshi Yonezu"));
  });

  test("Thai and other non-Latin titles encode as UTF-8 (v5 used Buffer.from(string))", () => {
    // base64(UTF-8 "ลา-ก") = "4Lil4LiyLeC4gQ=="
    expect(trackKey("ลา", "ก")).toBe("4Lil4LiyLeC4gQ__");
  });
});

describe("Listening Session contract (#108, spec #31)", () => {
  const session = {
    id: "939000000000000001-1700000000000",
    guildId: "939000000000000001",
    guildName: "Club",
    channelId: "939000000000000093",
    startTime: 1_700_000_000_000,
    endTime: null,
    isActive: true,
    tracks: [
      {
        title: "Idol",
        author: "YOASOBI",
        uri: "https://x.test/idol",
        thumbnail: null,
        durationMs: 213_000,
        playedAt: 1_700_000_000_000,
        requester,
      },
    ],
    participants: [{ ...requester, joinedAt: 1_700_000_000_000 }],
  };

  test("a session parses; the summary drops the tracks and keeps their count", () => {
    const parsed = ListeningSessionSchema.parse(session);
    expect(sessionSummary(parsed)).toMatchObject({ id: session.id, trackCount: 1, participants: session.participants });
    expect("tracks" in sessionSummary(parsed)).toBe(false);
  });

  test("every track keeps its requester (v5 dropped the requester id)", () => {
    const { requester: _, ...noRequester } = session.tracks[0] as (typeof session.tracks)[number];
    expect(ListeningSessionSchema.safeParse({ ...session, tracks: [noRequester] }).success).toBe(false);
  });

  test("a top-played row carries the play count and the music/video flags", () => {
    expect(
      TopPlayedSchema.parse({
        trackId: trackKey("Idol", "YOASOBI"),
        title: "Idol",
        artist: "YOASOBI",
        uri: "https://x.test/idol",
        thumbnail: null,
        durationMs: 213_000,
        source: "youtube",
        isMusic: true,
        isVideo: false,
        playCount: 3,
        lastPlayedAt: "2026-11-08T10:00:00+00:00",
      }).playCount,
    ).toBe(3);
  });
});

describe("session events stay small (#108 review)", () => {
  test("an event carries the summary and only the newest track, however long the session", async () => {
    const { sessionEvent, SessionEventSchema } = await import("../src/history");
    const track = (title: string, playedAt: number) => ({
      title,
      author: "YOASOBI",
      uri: `https://x.test/${title}`,
      thumbnail: null,
      durationMs: 1,
      playedAt,
      requester,
    });
    const session = {
      id: "s",
      guildId: "939000000000000001",
      guildName: "Club",
      channelId: null,
      startTime: 1,
      endTime: null,
      isActive: true,
      tracks: [track("a", 1), track("b", 2), track("c", 3)],
      participants: [{ ...requester, joinedAt: 1 }],
    };
    const event = SessionEventSchema.parse(sessionEvent(session));
    expect(event).toMatchObject({ id: "s", trackCount: 3, track: { title: "c" } });
    expect("tracks" in event).toBe(false);
  });
});
