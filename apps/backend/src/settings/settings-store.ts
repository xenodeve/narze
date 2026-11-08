import {
  type AvatarOutfit,
  AvatarOutfitSchema,
  DEFAULT_OUTFIT,
  type GuildSettings,
  type SettingsUpdate,
} from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE } from "../tokens";

interface Row {
  guild_id: string;
  guild_name: string;
  owner_id: string;
  music_channel_id: string | null;
  avatar: unknown;
}

const COLUMNS = "guild_id, guild_name, owner_id, music_channel_id, avatar";
const fromRow = (row: Row): GuildSettings => ({
  guildId: row.guild_id,
  guildName: row.guild_name,
  ownerId: row.owner_id,
  musicChannelId: row.music_channel_id,
  avatar: AvatarOutfitSchema.catch(DEFAULT_OUTFIT).parse(row.avatar ?? {}),
});

/**
 * Guild Settings in Supabase (migration 20261108070000_guild_settings, spec #121). The Bot creates
 * a row when it joins (it knows the inviter); the Dashboard changes the Music Channel and outfit here.
 */
@Injectable()
export class SettingsStore {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

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
    return fromRow(data as Row);
  }
}
