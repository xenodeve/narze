import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SUPABASE } from "../tokens";

/** Who is calling, as established by the Backend — never read from the request body or query. */
export interface Identity {
  authUserId: string;
  discordId: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The Discord identity of a Supabase user. Only `identities` is trusted: it is written by Supabase
 * Auth from the provider, while `user_metadata` can be changed by the user (ADR-0005).
 */
export function discordIdentity(user: User): Identity | null {
  const identities = user.identities ?? [];
  // Discord is the only sign-in method: an account that also holds another identity (say an email
  // signup Supabase later linked by address) may not belong to this Discord user, so it gets none.
  if (identities.length !== 1) return null;
  const [discord] = identities;
  if (discord?.provider !== "discord" || !/^\d+$/.test(discord.id)) return null;
  const data = (discord.identity_data ?? {}) as Record<string, unknown>;
  const claims = (data.custom_claims ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  return {
    authUserId: user.id,
    discordId: discord.id,
    name: text(claims.global_name) ?? text(data.full_name) ?? discord.id,
    avatarUrl: text(data.avatar_url),
  };
}

@Injectable()
export class Authenticator {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  /**
   * Asks Supabase Auth on every call instead of only checking the JWT signature, so a token whose
   * session was signed out is refused immediately rather than at expiry (ADR-0005).
   */
  async verify(token: string | null | undefined): Promise<Identity | null> {
    if (!token) return null;
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return discordIdentity(data.user);
  }

  async require(authorization: string | undefined): Promise<Identity> {
    const token = authorization?.match(/^Bearer (.+)$/)?.[1];
    const identity = await this.verify(token);
    if (!identity) throw new UnauthorizedException();
    return identity;
  }
}
