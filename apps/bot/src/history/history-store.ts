import type { ListeningSession } from "@narze/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/** One track start for Play History (spec #33): what the three rows are keyed and labelled by. */
export interface PlayRecord {
  trackId: string;
  title: string;
  artist: string;
  uri: string;
  thumbnail: string | null;
  durationMs: number;
  source: string;
  isMusic: boolean;
  isVideo: boolean;
}

/** Listening Sessions and Play History in Supabase (#108), written by the Bot in both Runtime Modes. */
export function createSupabaseHistoryStore(db: SupabaseClient) {
  return {
    async save(session: ListeningSession): Promise<void> {
      const { error } = await db.from("listening_sessions").upsert({
        id: session.id,
        guild_id: session.guildId,
        guild_name: session.guildName,
        channel_id: session.channelId,
        start_time: session.startTime,
        end_time: session.endTime,
        is_active: session.isActive,
        tracks: session.tracks,
        participants: session.participants,
        participant_ids: session.participants.map((p) => p.id),
        track_count: session.tracks.length,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`save session: ${error.message}`);
    },

    async closeActive(at: number, guildIds: readonly string[]): Promise<void> {
      if (guildIds.length === 0) return;
      const { error } = await db
        .from("listening_sessions")
        .update({ is_active: false, end_time: at, updated_at: new Date().toISOString() })
        .eq("is_active", true)
        .in("guild_id", [...guildIds]);
      if (error) throw new Error(`close sessions: ${error.message}`);
    },

    async recordPlay(guildId: string, discordId: string, play: PlayRecord): Promise<void> {
      const { error } = await db.rpc("record_play", { p_guild: guildId, p_user: discordId, p_track: play });
      if (error) throw new Error(`record play: ${error.message}`);
    },
  };
}

export type HistoryStore = ReturnType<typeof createSupabaseHistoryStore>;
