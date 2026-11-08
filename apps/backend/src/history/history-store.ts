import type { ListeningSession, SessionSummary, TopPlayed } from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "../supabase-check";
import { SUPABASE } from "../tokens";

interface SessionRow {
  id: string;
  guild_id: string;
  guild_name: string;
  channel_id: string | null;
  start_time: number;
  end_time: number | null;
  is_active: boolean;
  participants: ListeningSession["participants"];
  track_count: number;
  tracks?: ListeningSession["tracks"];
}
interface TopRow {
  track_id: string;
  title: string;
  artist: string;
  uri: string;
  thumbnail: string | null;
  duration_ms: number;
  source: string;
  is_music: boolean;
  is_video: boolean;
  play_count: number;
  last_played_at: string;
}
const SUMMARY = "id, guild_id, guild_name, channel_id, start_time, end_time, is_active, participants, track_count";

const summaryOf = (row: SessionRow): SessionSummary => ({
  id: row.id,
  guildId: row.guild_id,
  guildName: row.guild_name,
  channelId: row.channel_id,
  startTime: Number(row.start_time),
  endTime: row.end_time === null ? null : Number(row.end_time),
  isActive: row.is_active,
  participants: row.participants,
  trackCount: row.track_count,
});

/**
 * Listening Sessions and Play History (#108), read for the Dashboard. A session is only ever read
 * for one of its participants: everyone else is told it does not exist.
 */
@Injectable()
export class HistoryStore {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  /** `q` searches the server name, the people and the tracks (case-insensitive). */
  async sessionsOf(discordId: string, q = "", limit = 50): Promise<SessionSummary[]> {
    let query = this.db.from("listening_sessions").select(SUMMARY).contains("participant_ids", [discordId]);
    const words = q.trim().toLowerCase();
    // % _ (LIKE) and * (PostgREST) are wildcards; a search for them means the characters themselves.
    if (words) query = query.ilike("search_text", `%${words.replace(/[\\%_*]/g, (c) => `\\${c}`)}%`);
    const { data, error } = await query.order("start_time", { ascending: false }).limit(limit);
    check("list sessions", error);
    return ((data ?? []) as SessionRow[]).map(summaryOf);
  }

  async session(discordId: string, id: string): Promise<ListeningSession | null> {
    const { data, error } = await this.db
      .from("listening_sessions")
      .select(`${SUMMARY}, tracks`)
      .eq("id", id)
      .contains("participant_ids", [discordId])
      .maybeSingle();
    check("read session", error);
    if (!data) return null;
    const row = data as SessionRow;
    const { trackCount: _, ...session } = summaryOf(row);
    return { ...session, tracks: row.tracks ?? [] };
  }

  /** Spec #84: most played first. `guildId` "" means across every Guild, `discordId` "" every user. */
  async top(guildId: string, discordId: string, limit = 20): Promise<TopPlayed[]> {
    const { data, error } = await this.db
      .from("play_history")
      .select(
        "track_id, title, artist, uri, thumbnail, duration_ms, source, is_music, is_video, play_count, last_played_at",
      )
      .eq("guild_id", guildId)
      .eq("discord_id", discordId)
      .order("play_count", { ascending: false })
      .order("last_played_at", { ascending: false })
      .limit(limit);
    check("top played", error);
    return ((data ?? []) as TopRow[]).map((r) => ({
      trackId: r.track_id,
      title: r.title,
      artist: r.artist,
      uri: r.uri,
      thumbnail: r.thumbnail,
      durationMs: Number(r.duration_ms),
      source: r.source,
      isMusic: r.is_music,
      isVideo: r.is_video,
      playCount: r.play_count,
      lastPlayedAt: r.last_played_at,
    }));
  }
}
