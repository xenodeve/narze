import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class GuildService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  async getSettings(guildId: string) {
    const { data, error } = await this.supabase
      .from('guilds')
      .select('*')
      .eq('id', guildId)
      .single();
    if (error) throw error;
    return data;
  }

  async updateSettings(guildId: string, settings: { music_channel_id?: string; volume_limit?: number }) {
    const { data, error } = await this.supabase
      .from('guilds')
      .upsert({ id: guildId, ...settings, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getUserGuilds(userId: string) {
    const { data, error } = await this.supabase
      .from('guild_members')
      .select('guild_id, guild_role, guilds(id, name)')
      .eq('user_id', userId);
    if (error) throw error;
    return data ?? [];
  }

  async isMember(guildId: string, userId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('guild_members')
      .select('guild_id')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .single();
    return !!data;
  }

  async upsertUser(userId: string, metadata: { full_name?: string; name?: string; avatar_url?: string }) {
    const { error } = await this.supabase
      .from('users')
      .upsert({
        id: userId,
        username: metadata.full_name ?? metadata.name ?? userId,
        avatar_url: metadata.avatar_url ?? null,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
  }

  async syncGuildMemberships(userId: string, guilds: { id: string; name: string }[]) {
    if (!guilds.length) return;
    const rows = guilds.map((g) => ({ user_id: userId, guild_id: g.id }));
    const { error } = await this.supabase
      .from('guild_members')
      .upsert(rows, { onConflict: 'user_id,guild_id', ignoreDuplicates: true });
    if (error) throw error;
  }
}
