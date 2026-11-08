const registry = new Map<string, { stats(): { entries: number; bytes: number } }>();

/** Spec #73: the 7-day TTL of YouTube categories and Spotify artist lookups. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * An in-process cache with a TTL and an LRU cap. The Bot's lookups (autocomplete, YouTube
 * categories, Spotify artists) use it in both Runtime Modes; the TTLs come from spec #73.
 */
export function createTtlCache<K, V>({
  ttlMs,
  max,
  now = Date.now,
  name,
}: {
  ttlMs: number;
  max: number;
  now?: () => number;
  /** Named caches are listed in the admin stats (#110, spec #74); the latest one per name. */
  name?: string;
}) {
  // A Map keeps insertion order: re-inserting on read makes the first key the least recently used.
  const entries = new Map<K, { value: V; at: number }>();
  const cache = {
    get(key: K): V | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() - entry.at >= ttlMs) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key: K, value: V): void {
      entries.delete(key);
      entries.set(key, { value, at: now() });
      while (entries.size > max) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    clear(): void {
      entries.clear();
    },
    /** For /cache stats: entry count, a JSON size estimate, and when the oldest entry was stored. */
    stats(): { entries: number; bytes: number; oldestAt: number | null } {
      let bytes = 0;
      let oldestAt: number | null = null;
      for (const [key, entry] of entries) {
        bytes += JSON.stringify([key, entry.value]).length;
        if (oldestAt === null || entry.at < oldestAt) oldestAt = entry.at;
      }
      return { entries: entries.size, bytes, oldestAt };
    },
  };
  if (name) registry.set(name, cache);
  return cache;
}

/** Every named cache's size, for the admin stats (#110). */
export function cacheStats(): Array<{ name: string; items: number; bytes: number }> {
  return [...registry].map(([name, cache]) => {
    const { entries, bytes } = cache.stats();
    return { name, items: entries, bytes };
  });
}

export type TtlCache<K, V> = ReturnType<typeof createTtlCache<K, V>>;
