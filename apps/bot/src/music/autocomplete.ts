import type { TtlCache } from "@narze/shared/ttl-cache";
import { playlistDisplayName, type ResolvedQuery, resolveQuery } from "./query";

export interface Choice {
  name: string;
  value: string;
}

/** What a Lavalink load answered, reduced to what the suggestions show. */
export interface Loaded {
  loadType: string;
  tracks: Array<{ info: { title?: string; author?: string; uri?: string | null } }>;
  playlistName?: string;
}

/** Spec #2/#69: up to 7 suggestions per query. */
export const SUGGESTION_LIMIT = 7;
/** Discord caps a choice's name and value at 100 characters. */
const MAX = 100;
const ERROR = (name: string): Choice[] => [{ name, value: "error" }];

/**
 * The /play family's autocomplete (v5 §3): text searches the default platform and offers
 * `(author) title`; a URL is previewed (a playlist as `(n เพลง) name`); Deezer and Apple Music are
 * refused. Good answers are cached per platform and query (spec #69: 30 min, ≤ 1000 entries).
 */
export function createSuggester({
  load,
  cache,
  sources,
}: {
  load: (query: string, source?: "spsearch" | "ytmsearch") => Promise<Loaded>;
  cache: TtlCache<string, Choice[]>;
  /** The node's source managers, which pick the default search platform. */
  sources: readonly string[] | (() => readonly string[]);
}) {
  const sourceList = () => (typeof sources === "function" ? sources() : sources);

  async function compute(resolved: ResolvedQuery): Promise<{ choices: Choice[]; ok: boolean }> {
    if (!resolved.ok) {
      // #157: the same words the reply uses after submit.
      const text = resolved.reason === "coming-soon" ? "ยังไม่รองรับแหล่งเพลงนี้ จะรองรับเร็ว ๆ นี้" : "ไม่รองรับ Platform นี้";
      return { choices: ERROR(text), ok: false };
    }
    const found = await load(resolved.query, resolved.source);
    const isUrl = !resolved.source;
    if (found.tracks.length === 0 || found.loadType === "error" || found.loadType === "empty") {
      return { choices: ERROR(isUrl ? "(ข้อผิดพลาด) กรุณาใส่ URL ที่ถูกต้อง" : "ไม่พบเพลงที่ค้นหา"), ok: false };
    }
    if (found.loadType === "playlist") {
      const name = playlistDisplayName(found.playlistName ?? "Playlist");
      // Discord refuses a choice value over 100 characters, and with it every other choice.
      if (resolved.query.length > MAX) return { choices: [], ok: false };
      return {
        choices: [{ name: `(${found.tracks.length} เพลง) ${name}`.slice(0, MAX), value: resolved.query }],
        ok: true,
      };
    }
    const label = (t: Loaded["tracks"][number]) => `(${t.info.author ?? ""}) ${t.info.title ?? ""}`.slice(0, MAX);
    const choices = found.tracks.slice(0, isUrl ? 1 : SUGGESTION_LIMIT).map((t) => {
      const uri = t.info.uri ?? "";
      // The value is what /play gets back: the track itself, when its link fits in a choice.
      return { name: label(t), value: uri && uri.length <= MAX ? uri : label(t) };
    });
    return { choices, ok: true };
  }

  return {
    async suggest(query: string): Promise<Choice[]> {
      const text = query.trim();
      if (!text) return [{ name: "กรุณาระบุเพลง", value: "no_song" }];
      // Keyed by platform and query (spec #69): the same words on another platform are another answer.
      const resolved = resolveQuery(text, sourceList());
      const key = `${resolved.ok ? (resolved.source ?? "url") : "refused"}:${text}`;
      const cached = cache.get(key);
      if (cached) return cached;
      try {
        const { choices, ok } = await compute(resolved);
        if (ok) cache.set(key, choices);
        return choices;
      } catch {
        return ERROR("เกิดข้อผิดพลาดในการค้นหา");
      }
    },
  };
}

export type Suggester = ReturnType<typeof createSuggester>;
