# Supabase local

`bun run infra:up` starts Redis and Supabase local (Auth, REST, Postgres only) and applies
`migrations/`. `bun run verify` and `bun run e2e` need both running.

## Discord sign-in without Discord

Supabase Auth's Discord provider reads its client id, secret and **base URL** from the environment
(`config.toml` → `[auth.external.discord]`, ADR-0005). Unless all three are set in your shell,
`infra:up` points the provider at the fake Discord in `packages/fake-discord` on port 4599:

| Variable | Fake value |
|---|---|
| `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` | `narze-fake-client` |
| `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` | `narze-fake-secret` |
| `SUPABASE_AUTH_EXTERNAL_DISCORD_URL` | `http://host.docker.internal:4599` |

Supabase Auth runs in Docker and reaches the fake as `host.docker.internal`. The browser cannot
always reach that name from the host (the firewall on the developer's Windows machine blocks it), so
the Playwright config maps it to `127.0.0.1` in Chromium.

**Switching between fake and real Discord** needs a restart, because the provider is read at start:
`bunx supabase@3 stop`, set (or unset) the three variables, `bun run infra:up`. For real Discord, add
`http://127.0.0.1:54321/auth/v1/callback` as a redirect in the Discord developer portal.

## Keys

Tests and the Playwright config read the local URL and keys from `bunx supabase@3 status -o json`
(`packages/fake-discord/src/supabase-local.ts`); no key is written into the repo.
