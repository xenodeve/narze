import type { AdminRole, WhitelistEntry } from "@narze/shared";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "../supabase-check";
import { DEVELOPER_IDS, SUPABASE } from "../tokens";

/**
 * The Admin Whitelist (#110, spec #97, #122), enforced by the Backend. NARZE_DEVELOPER_IDS are always
 * Developers (the way in on a fresh database) and cannot be changed from the Dashboard.
 */
@Injectable()
export class AdminRoles {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    @Inject(DEVELOPER_IDS) private readonly developers: readonly string[],
  ) {}

  async roleOf(discordId: string): Promise<AdminRole | null> {
    if (this.developers.includes(discordId)) return "developer";
    const { data, error } = await this.db
      .from("admin_whitelist")
      .select("role")
      .eq("discord_id", discordId)
      .maybeSingle();
    check("read whitelist", error);
    return (data as { role: AdminRole } | null)?.role ?? null;
  }

  async list(): Promise<WhitelistEntry[]> {
    const { data, error } = await this.db
      .from("admin_whitelist")
      .select("discord_id, role, added_by, added_at")
      .order("added_at");
    check("list whitelist", error);
    const rows = (data ?? []) as Array<{
      discord_id: string;
      role: AdminRole;
      added_by: string | null;
      added_at: string;
    }>;
    const fixed: WhitelistEntry[] = this.developers.map((discordId) => ({
      discordId,
      role: "developer",
      fixed: true,
      addedBy: null,
      addedAt: null,
    }));
    return [
      ...fixed,
      ...rows
        .filter((r) => !this.developers.includes(r.discord_id))
        .map((r) => ({
          discordId: r.discord_id,
          role: r.role,
          fixed: false,
          addedBy: r.added_by,
          addedAt: r.added_at,
        })),
    ];
  }

  async set(discordId: string, role: AdminRole, by: string): Promise<void> {
    this.refuseFixed(discordId);
    if (role !== "developer") await this.refuseLastDeveloper(discordId);
    const { error } = await this.db
      .from("admin_whitelist")
      .upsert({ discord_id: discordId, role, added_by: by, added_at: new Date().toISOString() });
    check("write whitelist", error);
  }

  async remove(discordId: string): Promise<void> {
    this.refuseFixed(discordId);
    await this.refuseLastDeveloper(discordId);
    const { error } = await this.db.from("admin_whitelist").delete().eq("discord_id", discordId);
    check("delete whitelist", error);
  }

  /**
   * #133: with NARZE_DEVELOPER_IDS empty, demoting or removing the last whitelisted Developer would
   * lock everyone out of Settings. (Two Developers demoting each other at the same moment can still
   * both pass; the environment list is the way back in.)
   */
  private async refuseLastDeveloper(discordId: string): Promise<void> {
    if (this.developers.length > 0) return;
    const { data, error } = await this.db.from("admin_whitelist").select("discord_id").eq("role", "developer");
    check("count developers", error);
    const developers = ((data ?? []) as Array<{ discord_id: string }>).map((r) => r.discord_id);
    if (developers.includes(discordId) && developers.length === 1) {
      throw new ConflictException("the last Developer cannot be demoted or removed");
    }
  }

  private refuseFixed(discordId: string): void {
    if (this.developers.includes(discordId)) {
      throw new ConflictException("this Developer is set in the environment, not the Dashboard");
    }
  }
}
