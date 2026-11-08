import {
  type AvatarOutfit,
  GUILD_SETTINGS_COLUMNS as COLUMNS,
  settingsFromRow as fromRow,
  type GuildSettings,
  type GuildSettingsRow as Row,
  type SettingsUpdate,
} from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE } from "../tokens";

/**
 * Guild Settings in Supabase (migration 20261108070000_guild_settings, spec #121). The Bot creates
 * a row when it joins (it knows the inviter); the Dashboard changes the Music Channel and outfit here.
 */
@Injectable()
export class SettingsStore {
  /** Settings change rarely and are read on every control command: kept a few seconds. */
  private readonly recent = new Map<string, { at: number; value: GuildSettings | null }>();
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  /**
   * For hot paths (permissions, summaries): a cached read that degrades to "no settings" when
   * Supabase is unreachable, so a settings outage never fails playback control or the server list.
   */
  async cached(guildId: string): Promise<GuildSettings | null> {
    const hit = this.recent.get(guildId);
    if (hit && Date.now() - hit.at < 10_000) return hit.value;
    const value = await this.get(guildId).catch(() => hit?.value ?? null);
    this.recent.set(guildId, { at: Date.now(), value });
    return value;
  }

  /** Many Guilds for the server list; an outage reads as none. */
  async cachedMany(guildIds: string[]): Promise<Map<string, GuildSettings>> {
    return this.many(guildIds).catch(() => new Map());
  }

  async get(guildId: string): Promise<GuildSettings | null> {
    const { data, error } = await this.db.from("guild_settings").select(COLUMNS).eq("guild_id", guildId).maybeSingle();
    if (error) throw new Error(`read guild settings: ${error.message}`);
    return data ? fromRow(data as Row) : null;
  }

  /** Many Guilds in one query (the server list and the sidebar). */
  async many(guildIds: string[]): Promise<Map<string, GuildSettings>> {
    if (guildIds.length === 0) return new Map();
    const { data, error } = await this.db.from("guild_settings").select(COLUMNS).in("guild_id", guildIds);
    if (error) throw new Error(`read guild settings: ${error.message}`);
    return new Map(((data ?? []) as Row[]).map((row) => [row.guild_id, fromRow(row)]));
  }

  /** Applies a change to a stored row; an outfit change keeps the fields it does not name. */
  async update(current: GuildSettings, change: SettingsUpdate): Promise<GuildSettings> {
    const avatar: AvatarOutfit = { ...current.avatar, ...(change.avatar ?? {}) };
    const musicChannelId = change.musicChannelId === undefined ? current.musicChannelId : change.musicChannelId;
    const { data, error } = await this.db
      .from("guild_settings")
      .update({ music_channel_id: musicChannelId, avatar, updated_at: new Date().toISOString() })
      .eq("guild_id", current.guildId)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`update guild settings: ${error.message}`);
    const updated = fromRow(data as Row);
    this.recent.set(updated.guildId, { at: Date.now(), value: updated });
    return updated;
  }
}
