import type { Like, NewPlaylist, Playlist, PlaylistChange, PlaylistSummary, PlaylistTrack } from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE } from "../tokens";

interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  source_platform: string | null;
  source_url: string | null;
  updated_at: string;
}
interface TrackRow {
  title: string;
  artist: string;
  duration_ms: number;
  thumbnail: string | null;
  uri: string;
  album: string | null;
  added_at: string | null;
}

const COLUMNS = "id, name, description, thumbnail, source_platform, source_url, updated_at";
const toTrack = (row: TrackRow): PlaylistTrack => ({
  title: row.title,
  artist: row.artist,
  duration: Number(row.duration_ms),
  thumbnail: row.thumbnail,
  uri: row.uri,
  album: row.album,
  addedAt: row.added_at,
});
const fromPlaylist = (row: PlaylistRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  thumbnail: row.thumbnail,
  sourcePlatform: row.source_platform,
  sourceUrl: row.source_url,
  updatedAt: row.updated_at,
});
const check = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/**
 * The Library in Supabase (#107). Every read and write names the owner, so another user's
 * playlist is simply not found (a 404, never a 403 that would confirm it exists).
 */
@Injectable()
export class LibraryStore {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  async list(ownerId: string): Promise<PlaylistSummary[]> {
    const { data, error } = await this.db
      .from("playlists")
      .select(`${COLUMNS}, playlist_tracks(count)`)
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });
    check("list playlists", error);
    return ((data ?? []) as Array<PlaylistRow & { playlist_tracks: Array<{ count: number }> }>).map((row) => ({
      ...fromPlaylist(row),
      trackCount: row.playlist_tracks[0]?.count ?? 0,
    }));
  }

  async get(ownerId: string, id: string): Promise<Playlist | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await this.db
      .from("playlists")
      .select(COLUMNS)
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    check("read playlist", error);
    if (!data) return null;
    const tracks = await this.db
      .from("playlist_tracks")
      .select("title, artist, duration_ms, thumbnail, uri, album, added_at")
      .eq("playlist_id", id)
      .order("position");
    check("read tracks", tracks.error);
    return { ...fromPlaylist(data as PlaylistRow), tracks: ((tracks.data ?? []) as TrackRow[]).map(toTrack) };
  }

  async create(ownerId: string, playlist: NewPlaylist): Promise<Playlist> {
    const { data, error } = await this.db
      .from("playlists")
      .insert({
        owner_id: ownerId,
        name: playlist.name,
        description: playlist.description ?? null,
        thumbnail: playlist.tracks[0]?.thumbnail ?? null,
        source_platform: playlist.sourcePlatform ?? null,
        source_url: playlist.sourceUrl ?? null,
      })
      .select("id")
      .single();
    check("create playlist", error);
    const id = (data as { id: string }).id;
    if (playlist.tracks.length > 0) await this.replaceTracks(id, playlist.tracks);
    return (await this.get(ownerId, id)) as Playlist;
  }

  /** Only name, description and tracks change; null when the owner has no such playlist. */
  async change(ownerId: string, id: string, change: PlaylistChange): Promise<Playlist | null> {
    if (!(await this.get(ownerId, id))) return null;
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (change.name !== undefined) fields.name = change.name;
    if (change.description !== undefined) fields.description = change.description;
    const { error } = await this.db.from("playlists").update(fields).eq("id", id).eq("owner_id", ownerId);
    check("change playlist", error);
    if (change.tracks) await this.replaceTracks(id, change.tracks);
    return this.get(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<boolean> {
    if (!(await this.get(ownerId, id))) return false;
    const { error } = await this.db.from("playlists").delete().eq("id", id).eq("owner_id", ownerId);
    check("delete playlist", error);
    return true;
  }

  private async replaceTracks(id: string, tracks: PlaylistTrack[]): Promise<void> {
    const { error } = await this.db.rpc("replace_playlist_tracks", { p_playlist: id, p_tracks: tracks });
    check("replace tracks", error);
  }

  async likes(discordId: string): Promise<Like[]> {
    const { data, error } = await this.db
      .from("likes")
      .select("title, artist, duration_ms, thumbnail, uri, liked_at")
      .eq("discord_id", discordId)
      .order("liked_at", { ascending: false });
    check("list likes", error);
    return ((data ?? []) as Array<TrackRow & { liked_at: string }>).map((row) => ({
      ...toTrack({ ...row, album: null, added_at: null }),
      likedAt: row.liked_at,
    }));
  }

  async like(discordId: string, track: PlaylistTrack): Promise<void> {
    const { error } = await this.db.from("likes").upsert({
      discord_id: discordId,
      uri: track.uri,
      title: track.title,
      artist: track.artist,
      duration_ms: Math.round(track.duration),
      thumbnail: track.thumbnail ?? null,
    });
    check("like", error);
  }

  async unlike(discordId: string, uri: string): Promise<void> {
    const { error } = await this.db.from("likes").delete().eq("discord_id", discordId).eq("uri", uri);
    check("unlike", error);
  }
}
