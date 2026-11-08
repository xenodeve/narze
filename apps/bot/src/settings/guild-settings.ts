import { GUILD_SETTINGS_COLUMNS, type GuildSettings, type GuildSettingsRow, settingsFromRow } from "@narze/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Where Guild Settings live (Supabase, the source of truth in both Runtime Modes, ADR-0003). */
export interface SettingsStore {
  get(guildId: string): Promise<GuildSettings | null>;
  /** On join: records the Bot Owner; a re-invite keeps the Music Channel and the outfit (v5). */
  ensure(row: { guildId: string; guildName: string; ownerId: string }): Promise<void>;
  setMusicChannel(guildId: string, channelId: string | null): Promise<void>;
}

export function createSupabaseSettingsStore(db: SupabaseClient): SettingsStore {
  return {
    async get(guildId) {
      const { data, error } = await db
        .from("guild_settings")
        .select(GUILD_SETTINGS_COLUMNS)
        .eq("guild_id", guildId)
        .maybeSingle();
      if (error) throw new Error(`read guild settings: ${error.message}`);
      return data ? settingsFromRow(data as GuildSettingsRow) : null;
    },
    async ensure({ guildId, guildName, ownerId }) {
      // The owner is written only when the row is created: otherwise anyone who can kick and re-add
      // the Bot would become its owner (#106 review). A re-invite refreshes the name only.
      const created = await db
        .from("guild_settings")
        .upsert({ guild_id: guildId, guild_name: guildName, owner_id: ownerId }, { ignoreDuplicates: true });
      if (created.error) throw new Error(`write guild settings: ${created.error.message}`);
      const renamed = await db
        .from("guild_settings")
        .update({ guild_name: guildName, updated_at: new Date().toISOString() })
        .eq("guild_id", guildId);
      if (renamed.error) throw new Error(`write guild settings: ${renamed.error.message}`);
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
    /** Spec #22, #121: on the first join, the inviter — else the Server Owner — is the Bot Owner. */
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
