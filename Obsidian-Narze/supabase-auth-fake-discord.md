---
name: supabase-auth-fake-discord
description: How the e2e suite signs in through the real Supabase Auth with a fake Discord, and the four traps that took a spike to find
type: reference
---

The test stack runs the **real** GoTrue (Supabase local) and points its Discord provider at
`packages/fake-discord` through `[auth.external.discord] url` (ADR-0005). Measured 2026-11-08 (#99):

1. **GoTrue parses Discord's `discriminator` as an integer.** A profile without it fails sign-in with
   "Error getting user profile from external provider" (`strconv.Atoi: parsing ""` in
   `docker logs supabase_auth_Narze`). The fake sends `"0"`.
2. **Supabase Auth runs in Docker and reaches the fake as `host.docker.internal`** (the LAN IP here),
   so the fake binds `0.0.0.0`. The **host's browser cannot reach that name/IP** on this machine
   (firewall), so Playwright launches Chromium with
   `--host-resolver-rules=MAP host.docker.internal 127.0.0.1`.
3. **The provider config is read at `supabase start`.** Switching between fake and real Discord means
   `bunx supabase@3 stop` first; `infra:up` on a running stack keeps the old provider.
4. **A forged OAuth `state` redirects to `site_url`, not to the app** (`303 …?error_code=bad_oauth_state`),
   so that case is asserted on the HTTP response, not in the page.

**Why:** each one presented as a generic auth failure; together they cost the #99 spike.

**How to apply:** start the stack with `bun run infra:up`; read keys with `localSupabase()`
(`packages/fake-discord/src/supabase-local.ts`), never hard-code them; drive sign-in with
`signInWithFakeDiscord()` in Bun tests.

Related: [[windows-toolchain-gotchas]]
