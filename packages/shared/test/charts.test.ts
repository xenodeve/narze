import { describe, expect, test } from "bun:test";
import { ChartSchema, rankMovement } from "../src/charts";

const entry = (rank: number, title: string) => ({ rank, title, artist: "A" });

describe("Chart rank movement (#109, spec #117)", () => {
  test("compares with the previous update of the same chart, by song", () => {
    const previous = [entry(1, "x"), entry(2, "y"), entry(3, "z")];
    const now = [entry(1, "y"), entry(2, "x"), entry(3, "z"), entry(4, "new one")];
    expect(rankMovement(now, previous)).toEqual([
      { movement: "up", previousRank: 2 },
      { movement: "down", previousRank: 1 },
      { movement: "same", previousRank: 3 },
      { movement: "new", previousRank: null },
    ]);
  });

  test("with nothing to compare against, nothing is claimed", () => {
    expect(rankMovement([entry(1, "x")], null)).toEqual([{ movement: null, previousRank: null }]);
  });
});

describe("Chart contract (#109)", () => {
  test("a chart says where it came from, when, and whether it is the last good copy", () => {
    const chart = ChartSchema.parse({
      region: "th",
      title: "Top Songs",
      sourceUpdatedAt: "Sun, 8 Nov 2026 11:28:29 +0000",
      fetchedAt: 1,
      stale: false,
      entries: [
        {
          rank: 1,
          title: "รอ SIS (TER)",
          artist: "DICEBLUE & DICE",
          artwork: "https://is1-ssl.mzstatic.com/x.jpg",
          appleUrl: "https://music.apple.com/th/album/x",
          spotifyUrl: null,
          artistImage: null,
          movement: null,
          previousRank: null,
        },
      ],
    });
    expect(chart.entries[0]?.rank).toBe(1);
    expect(ChartSchema.safeParse({ ...chart, region: "global" }).success).toBe(false);
  });
});

test("a song listed twice keeps its higher rank as the previous one (#109 review)", () => {
  const previous = [entry(1, "x"), entry(2, "y"), entry(3, "x")];
  expect(rankMovement([entry(1, "x")], previous)).toEqual([{ movement: "same", previousRank: 1 }]);
});
