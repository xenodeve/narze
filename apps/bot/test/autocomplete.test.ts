import { describe, expect, mock, test } from "bun:test";
import { createSuggester, type Loaded } from "../src/music/autocomplete";
import { createTtlCache } from "../src/music/ttl-cache";

const song = (title: string, author = "YOASOBI", uri = `https://music.youtube.com/watch?v=${title}`) => ({
  info: { title, author, uri },
});
const suggester = (load: (query: string) => Promise<Loaded>) =>
  createSuggester({ load, cache: createTtlCache({ ttlMs: 30 * 60_000, max: 1000 }), sources: ["youtube"] });

describe("play autocomplete (#104, spec #2, #69)", () => {
  test("a text query offers up to 7 tracks as `(author) title`, each choosing its uri", async () => {
    const tracks = Array.from({ length: 9 }, (_, i) => song(`Idol ${i}`));
    const choices = await suggester(async () => ({ loadType: "search", tracks })).suggest("idol");
    expect(choices).toHaveLength(7);
    expect(choices[0]).toEqual({ name: "(YOASOBI) Idol 0", value: "https://music.youtube.com/watch?v=Idol 0" });
  });

  test("names are cut to 100 characters", async () => {
    const [choice] = await suggester(async () => ({ loadType: "search", tracks: [song("x".repeat(150))] })).suggest(
      "x",
    );
    expect(choice?.name).toHaveLength(100);
  });

  test("a playlist URL is one choice, `(n เพลง) name`; a Mix is a radio station", async () => {
    const tracks = [song("a"), song("b"), song("c")];
    const list = "https://www.youtube.com/watch?v=a&list=PL1";
    expect(
      await suggester(async () => ({ loadType: "playlist", tracks, playlistName: "Anime Hits" })).suggest(list),
    ).toEqual([{ name: "(3 เพลง) Anime Hits", value: "https://music.youtube.com/playlist?list=PL1" }]);
    const mix = "https://www.youtube.com/watch?v=a&list=RDa";
    expect(
      await suggester(async () => ({ loadType: "playlist", tracks, playlistName: "Mix - Lemon" })).suggest(mix),
    ).toEqual([{ name: "(3 เพลง) สถานีวิทยุLemon", value: mix }]);
  });

  test("Deezer and Apple Music are refused; an empty query and nothing found say so", async () => {
    const s = suggester(async () => ({ loadType: "empty", tracks: [] }));
    expect(await s.suggest("https://www.deezer.com/track/1")).toEqual([{ name: "ไม่รองรับ Platform นี้", value: "error" }]);
    expect(await s.suggest("https://music.apple.com/x")).toEqual([{ name: "ไม่รองรับ Platform นี้", value: "error" }]);
    expect(await s.suggest("  ")).toEqual([{ name: "กรุณาระบุเพลง", value: "no_song" }]);
    expect(await s.suggest("nothing")).toEqual([{ name: "ไม่พบเพลงที่ค้นหา", value: "error" }]);
    expect(await s.suggest("https://www.youtube.com/watch?v=zz")).toEqual([
      { name: "(ข้อผิดพลาด) กรุณาใส่ URL ที่ถูกต้อง", value: "error" },
    ]);
  });

  test("a failing search says so; a repeated query is answered from the cache, errors are not cached", async () => {
    const load = mock(async (): Promise<Loaded> => ({ loadType: "search", tracks: [song("Idol")] }));
    const s = suggester(load);
    await s.suggest("idol");
    await s.suggest("idol");
    expect(load).toHaveBeenCalledTimes(1);
    const broken = suggester(async () => {
      throw new Error("node down");
    });
    expect(await broken.suggest("x")).toEqual([{ name: "เกิดข้อผิดพลาดในการค้นหา", value: "error" }]);
    const empty = mock(async (): Promise<Loaded> => ({ loadType: "empty", tracks: [] }));
    const e = suggester(empty);
    await e.suggest("none");
    await e.suggest("none");
    expect(empty).toHaveBeenCalledTimes(2);
  });
});
