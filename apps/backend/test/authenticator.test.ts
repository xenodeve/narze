import { describe, expect, test } from "bun:test";
import type { User } from "@supabase/supabase-js";
import { discordIdentity } from "../src/auth/authenticator";

const identity = (provider: string, id: string) => ({
  id,
  identity_id: `${provider}-row`,
  user_id: "u1",
  provider,
  identity_data: { full_name: "dee", custom_claims: { global_name: "Dee" } },
});
const user = (...identities: ReturnType<typeof identity>[]) =>
  ({ id: "u1", identities, user_metadata: { provider_id: "999999999999999999" } }) as unknown as User;

describe("Discord identity of a Supabase user (ADR-0005)", () => {
  test("comes from the Discord identity, never from user_metadata", () => {
    expect(discordIdentity(user(identity("discord", "500000000000000002")))).toMatchObject({
      discordId: "500000000000000002",
      name: "Dee",
    });
  });

  test("a user without a Discord identity has none", () => {
    expect(discordIdentity(user(identity("email", "u1")))).toBeNull();
  });

  // Discord is the only sign-in method. An account that also has another identity could have been
  // created by someone else (e.g. an email signup that Supabase later linked to this Discord user).
  test("an account that also holds a non-Discord identity is refused", () => {
    expect(discordIdentity(user(identity("email", "u1"), identity("discord", "500000000000000002")))).toBeNull();
  });
});
