import type { ListeningSession, SessionSummary, TopPlayed } from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
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

const check = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/**
 * Listening Sessions and Play History (#108), read for the Dashboard. A session is only ever read
 * for one of its participants: everyone else is told it does not exist.
 */
@Injectable()
export class HistoryStore {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  async sessionsOf(discordId: string, limit = 50): Promise<SessionSummary[]> {
    const { data, error } = await this.db
      .from("listening_sessions")
      .select(SUMMARY)
      .contains("participant_ids", [discordId])
      .order("start_time", { ascending: false })
      .limit(limit);
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
    const { trackCount: _count, ...rest } = summaryOf(row);
    return { ...rest, tracks: row.tracks ?? [] };
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
