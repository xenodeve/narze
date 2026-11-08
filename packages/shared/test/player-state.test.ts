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
