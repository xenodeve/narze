import { describe, expect, test } from "bun:test";
import { createTtlCache } from "../src/ttl-cache";

describe("TTL cache (#104, spec #69, #73)", () => {
  test("an entry lives until its TTL, then reads as missing", () => {
    let clock = 0;
    const cache = createTtlCache<string, number>({ ttlMs: 1000, max: 10, now: () => clock });
    cache.set("a", 1);
    clock = 999;
    expect(cache.get("a")).toBe(1);
    clock = 1000;
    expect(cache.get("a")).toBeUndefined();
  });

  test("past max, the least recently used entry goes first", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 1000, max: 2, now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect([cache.get("a"), cache.get("b"), cache.get("c")]).toEqual([1, undefined, 3]);
  });

  test("stats report entries, approximate bytes and the oldest entry; clear empties it", () => {
    let clock = 5;
    const cache = createTtlCache<string, string>({ ttlMs: 1000, max: 10, now: () => clock });
    cache.set("a", "xx");
    clock = 9;
    cache.set("bb", "y");
    expect(cache.stats()).toEqual({
      entries: 2,
      bytes: JSON.stringify(["a", "xx"]).length + JSON.stringify(["bb", "y"]).length,
      oldestAt: 5,
    });
    cache.clear();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, oldestAt: null });
  });
});
