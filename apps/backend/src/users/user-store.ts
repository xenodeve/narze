import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Identity } from "../auth/authenticator";
import { SUPABASE } from "../tokens";

/** One guild from the user's Discord guild list, as stored at their last sign-in. */
export interface StoredGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  isOwner: boolean;
}

const assertOk = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/** Dashboard users and their guild snapshot in Supabase (migration 20261108050000_users). */
@Injectable()
export class UserStore {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  async upsertUser(identity: Identity): Promise<void> {
    const { error } = await this.db.from("users").upsert({
      discord_id: identity.discordId,
      auth_user_id: identity.authUserId,
      name: identity.name,
      avatar_url: identity.avatarUrl,
      updated_at: new Date().toISOString(),
    });
    assertOk("upsert user", error);
  }

  /**
   * Replaces the whole snapshot in one transaction (`replace_user_guilds`): a guild the user left
   * disappears at their next sign-in, and no reader sees a half-written list.
   */
  async replaceGuilds(discordId: string, guilds: StoredGuild[]): Promise<void> {
    const { error } = await this.db.rpc("replace_user_guilds", { p_discord_id: discordId, p_guilds: guilds });
    assertOk("store guilds", error);
  }

  async guildsOf(discordId: string): Promise<StoredGuild[]> {
    const { data, error } = await this.db
      .from("user_guilds")
      .select("guild_id, name, icon_url, is_owner")
      .eq("discord_id", discordId)
      .order("name");
    assertOk("read guilds", error);
    return (data ?? []).map((row) => ({
      id: row.guild_id,
      name: row.name,
      iconUrl: row.icon_url,
      isOwner: row.is_owner,
    }));
  }

  async setActive(discordId: string, active: boolean): Promise<void> {
    const { error } = await this.db
      .from("users")
      .update({ active, last_seen_at: new Date().toISOString() })
      .eq("discord_id", discordId);
    assertOk("set presence", error);
  }

  /** On Backend start no tab can still be connected, so nobody is active. */
  async deactivateAll(): Promise<void> {
    const { error } = await this.db.from("users").update({ active: false }).eq("active", true);
    assertOk("reset presence", error);
  }
}
