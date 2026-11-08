import { describe, expect, test } from "bun:test";
import { GuildEventSchema, PlayerStateSchema } from "../src/player";

const track = {
  uri: "https://open.spotify.com/track/abc",
  source: "spotify",
  title: "รสชาติชีวิต",
  author: "Artist",
  durationMs: 215_000,
  artworkUrl: null,
  requester: { id: "42", name: "listener", avatarUrl: null },
};

const state = {
  guildId: "111",
  current: track,
  positionMs: 1000,
  syncedAt: 1_700_000_000_000,
  paused: false,
  volume: 15,
  loop: "off",
  twentyFourSeven: false,
  queue: [track],
  revision: 3,
  epoch: "boot-1",
  lastSeekAt: null,
  voiceChannelId: "222",
};

describe("Player State", () => {
  test("a well-formed state parses", () => {
    expect(PlayerStateSchema.parse(state).revision).toBe(3);
  });

  test("an Idle Player has no current track and an empty queue", () => {
    expect(PlayerStateSchema.parse({ ...state, current: null, queue: [] }).current).toBeNull();
  });

  for (const field of ["uri", "source", "requester"] as const) {
    test(`a queued track without ${field} is an Invalid Player State`, () => {
      const { [field]: _dropped, ...broken } = track;
      expect(PlayerStateSchema.safeParse({ ...state, queue: [broken] }).success).toBe(false);
    });
  }

  test("loop accepts only off, track and queue", () => {
    expect(PlayerStateSchema.safeParse({ ...state, loop: "all" }).success).toBe(false);
  });

  test("a state carries the Bot process epoch and when it last seeked (ADR-0007, spec #103)", () => {
    expect(PlayerStateSchema.parse({ ...state, lastSeekAt: 5 }).lastSeekAt).toBe(5);
    const { epoch: _e, ...noEpoch } = state;
    expect(PlayerStateSchema.safeParse(noEpoch).success).toBe(false);
  });

  test("a queued track may say which playlist it came from (spec #66); index is 1-based", () => {
    const from = { name: "Anime Hits", url: "https://x.test/p", index: 2, total: 3 };
    expect(PlayerStateSchema.parse({ ...state, queue: [{ ...track, playlist: from }] }).queue[0]?.playlist).toEqual(
      from,
    );
    expect(
      PlayerStateSchema.safeParse({ ...state, queue: [{ ...track, playlist: { ...from, index: 0 } }] }).success,
    ).toBe(false);
  });

  test("a state may say it is being recovered after a restart (#103); older states still parse", () => {
    expect(PlayerStateSchema.parse({ ...state, recovering: true }).recovering).toBe(true);
    expect(PlayerStateSchema.parse(state).recovering).toBeUndefined();
  });
});

describe("Guild event envelope", () => {
  const envelope = { type: "playerState", guildId: "111", revision: 3, sequence: 9, ts: 1, data: state };

  test("an envelope carries revision, sequence and ts", () => {
    const parsed = GuildEventSchema.parse(envelope);
    expect([parsed.revision, parsed.sequence]).toEqual([3, 9]);
  });

  test("an envelope without a revision is rejected", () => {
    const { revision: _r, ...noRevision } = envelope;
    expect(GuildEventSchema.safeParse(noRevision).success).toBe(false);
  });

  test("a negative sequence is rejected", () => {
    expect(GuildEventSchema.safeParse({ ...envelope, sequence: -1 }).success).toBe(false);
  });
});
