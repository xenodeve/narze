import { AvatarOutfitSchema, DEFAULT_OUTFIT, type GuildSettings } from "@narze/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Where Guild Settings live (Supabase, the source of truth in both Runtime Modes, ADR-0003). */
export interface SettingsStore {
  get(guildId: string): Promise<GuildSettings | null>;
  /** On join: records the Bot Owner; a re-invite keeps the Music Channel and the outfit (v5). */
  ensure(row: { guildId: string; guildName: string; ownerId: string }): Promise<void>;
  setMusicChannel(guildId: string, channelId: string | null): Promise<void>;
}

interface Row {
  guild_id: string;
  guild_name: string;
  owner_id: string;
  music_channel_id: string | null;
  avatar: unknown;
}

export function createSupabaseSettingsStore(db: SupabaseClient): SettingsStore {
  return {
    async get(guildId) {
      const { data, error } = await db
        .from("guild_settings")
        .select("guild_id, guild_name, owner_id, music_channel_id, avatar")
        .eq("guild_id", guildId)
        .maybeSingle();
      if (error) throw new Error(`read guild settings: ${error.message}`);
      const row = data as Row | null;
      return row
        ? {
            guildId: row.guild_id,
            guildName: row.guild_name,
            ownerId: row.owner_id,
            musicChannelId: row.music_channel_id,
            avatar: AvatarOutfitSchema.catch(DEFAULT_OUTFIT).parse(row.avatar ?? {}),
          }
        : null;
    },
    async ensure({ guildId, guildName, ownerId }) {
      // Only these columns: an existing Music Channel and outfit stay as they are.
      const { error } = await db
        .from("guild_settings")
        .upsert({ guild_id: guildId, guild_name: guildName, owner_id: ownerId, updated_at: new Date().toISOString() });
      if (error) throw new Error(`write guild settings: ${error.message}`);
    },
    async setMusicChannel(guildId, channelId) {
      const { error } = await db
        .from("guild_settings")
        .update({ music_channel_id: channelId, updated_at: new Date().toISOString() })
        .eq("guild_id", guildId);
      if (error) throw new Error(`write guild settings: ${error.message}`);
    },
  };
}

/** Spec #22: v5's welcome (its `/help` line dropped: there is no /help command). */
export const WELCOME =
  "👋 **สวัสดี!** ขอบคุณที่เชิญฉันเข้ามา!\n\n🎵 ใช้คำสั่ง `/play <เพลง>` เพื่อเล่นเพลง\n⚙️ ใช้คำสั่ง `/setchannel` เพื่อตั้งค่า Music Channel";

/**
 * Spec #22: the Bot Owner is whoever added this Bot, from the audit log's BotAdd entries; null when
 * the log cannot be read (no View Audit Log) or holds no such entry.
 */
export async function inviterOf(
  botAdds: () => Promise<Array<{ targetId: string | null; executorId: string | null }>>,
  botId: string,
): Promise<string | null> {
  const entries = await botAdds().catch(() => []);
  return entries.find((e) => e.targetId === botId)?.executorId ?? null;
}

/**
 * The Bot's view of Guild Settings: a copy per Guild for synchronous reads (where a notice goes),
 * loaded on demand and kept fresh by `settings:update` (Connected) or by its own writes.
 */
export function createGuildSettings(store: SettingsStore) {
  const known = new Map<string, GuildSettings>();
  return {
    async load(guildId: string): Promise<GuildSettings | null> {
      const settings = await store.get(guildId);
      if (settings) known.set(guildId, settings);
      return settings;
    },
    apply(settings: GuildSettings): void {
      known.set(settings.guildId, settings);
    },
    /** Spec #12: where notices go; null = the channel where the command was used. */
    musicChannel(guildId: string): string | null {
      return known.get(guildId)?.musicChannelId ?? null;
    },
    /** Spec #22, #121: on join (and on ready), the inviter — else the Server Owner — is the Bot Owner. */
    async join(guild: { id: string; name: string; ownerId: string }, inviterId: string | null): Promise<void> {
      await store.ensure({ guildId: guild.id, guildName: guild.name, ownerId: inviterId ?? guild.ownerId });
      await this.load(guild.id);
    },
    async setMusicChannel(guildId: string, channelId: string | null): Promise<void> {
      await store.setMusicChannel(guildId, channelId);
      const settings = known.get(guildId);
      if (settings) known.set(guildId, { ...settings, musicChannelId: channelId });
      else await this.load(guildId);
    },
  };
}

export type GuildSettingsCache = ReturnType<typeof createGuildSettings>;
