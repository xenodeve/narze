import { describe, expect, test } from "bun:test";
import { diceSimilarity, SearchResponseSchema, topResult } from "../src/search";

const track = (title: string, artist = "YOASOBI") => ({
  id: title,
  title,
  artist,
  duration: 1000,
  uri: `https://x.test/${title}`,
});
const artist = (name: string) => ({ id: name, name });
const album = (name: string) => ({ id: name, name, artistName: "A" });

describe("Dice similarity (v5's string-similarity)", () => {
  test("identical strings are 1, spaces ignored; too short or disjoint is 0", () => {
    expect(diceSimilarity("idol", "idol")).toBe(1);
    expect(diceSimilarity("i dol", "idol")).toBe(1);
    expect(diceSimilarity("a", "ab")).toBe(0);
    expect(diceSimilarity("abc", "xyz")).toBe(0);
    expect(diceSimilarity("night", "nacht")).toBeCloseTo(0.25);
  });
});

describe("top result (#105, spec #58, v5 §7.2)", () => {
  test("an exact match scores 1.1 and the type priority picks track over artist over album", () => {
    const found = { tracks: [track("Idol")], artists: [artist("Idol")], albums: [album("Idol")] };
    expect(topResult("  IDOL ", found)).toEqual({ type: "track", data: track("Idol"), score: 1.1 });
    expect(topResult("yoasobi", { tracks: [track("Idol")], artists: [artist("YOASOBI")], albums: [] })).toMatchObject({
      type: "artist",
      score: 1.1,
    });
  });

  test("a track matches by its title or by `title artist`", () => {
    expect(topResult("idol yoasobi", { tracks: [track("Idol")], artists: [], albums: [] })).toMatchObject({
      type: "track",
      score: 1.1,
    });
  });

  test("otherwise the best fuzzy candidates within 0.1 are ranked by type", () => {
    const found = { tracks: [track("Gurenge", "LiSA")], artists: [artist("YOASOBI")], albums: [album("YOASOBI Best")] };
    const result = topResult("yoasob", found);
    expect(result?.type).toBe("artist");
    expect(result?.score).toBeGreaterThan(0.6);
  });

  test("an artist below 0.6 does not win: the first track does, with score 0; nothing at all is null", () => {
    const found = { tracks: [track("Zzz", "Q")], artists: [artist("Elisabeth")], albums: [] };
    expect(topResult("lisa", found)).toEqual({ type: "track", data: track("Zzz", "Q"), score: 0 });
    expect(topResult("lisa", { tracks: [], artists: [], albums: [] })).toBeNull();
  });
});

describe("search response schema (#105, spec #58)", () => {
  test("the v5 shape parses; an unknown source is refused", () => {
    const response = {
      query: "idol",
      source: "spotify-api",
      topResult: { type: "track", data: track("Idol"), score: 1.1 },
      tracks: [track("Idol")],
      artists: [artist("YOASOBI")],
      albums: [album("THE BOOK")],
      fromCache: false,
    };
    expect(SearchResponseSchema.parse(response).tracks).toHaveLength(1);
    expect(SearchResponseSchema.safeParse({ ...response, source: "deezer" }).success).toBe(false);
  });
});
