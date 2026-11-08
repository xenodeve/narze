# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

---

## #98 walking skeleton (2026-11-08, PR #115 → `v7` 9bf09367)

**Goal:** prove the whole Bot → Redis → Backend → Socket.io → Dashboard path once, on the v7 monorepo.

**Shipped:** Bun workspaces (`apps/bot`, `apps/backend`, `apps/dashboard`, `packages/shared`,
`packages/fake-lavalink`); Runtime Mode detection; heartbeat (2 s, TTL 4 s, expiry on the Backend's
clock); `StatusGateway` + `CorsIoAdapter`; Strata-xeno landing with `BotAvatar`; ADR-0004, ADR-0007;
`infra/lavalink/application.yml`; `supabase/config.toml`; repo-wide LF.

**Validation:** `bun run verify` exit 0 (36 unit/contract tests); `bun run e2e` 2 passed ×3 with the
real Bot process; T4 gate full suite in a fresh worktree before merge; Lavalink 4.2.2 booted with
both plugins. **Not run:** CI (billing lock, #116), `supabase start`.

**Lessons recorded:** [[bun-tsconfig-follows-cwd]], [[windows-toolchain-gotchas]], ADR-0004 (closeOnError on Bun).

**Next:** #99 (Discord login, server list, presence; ADR-0005).

---

## No-CI mode (2026-11-08, PR #117 → `v7` 46b8f37e, issue #116 open)

**Goal:** keep merges verifiable while GitHub Actions cannot start jobs (billing lock).

**Shipped:** gate `verify` = install + verify + e2e; `pre-push` message corrected; AGENTS.md / workflow.md
no-CI rules; impact-register entry. **Validation:** gate simulated in a fresh worktree without Bun on
PATH, exit 0. **Next:** developer fixes billing → restore per #116.

---

## T4 bootstrap of the v7 rewrite (2026-11-08, /t4-project-bootstrap, branch `v7`)

**Goal:** install the T4 operating layer (memory, workflow, hooks, CI, guards, records) on the fresh
`v7` branch before any v7 code exists, so every later session starts on the rails.

**Shipped:**
- `.claude/` — `t4.json` marker (`"verify": "bun run verify"`), `settings.json` hook wiring, `hooks/` scripts, `using-t4.snapshot.md`
- `.githooks/` — `pre-push` + `check-issue-ref` / `check-tree-budget` / `check-gate-ledger`
- `.github/` — `workflows/t4-verify.yml`, `t4-e2e.yml`, `t4-codeql.yml`, `dependabot.yml` (all on `v7`)
- `docs/agents/*`, `docs/adr/README.md`, `docs/reports/*`, `docs/superpowers/*`, `docs/OPEN-WORK-LEDGER.md`, `Obsidian-Narze/`
- root `package.json` (placeholder scripts), `.gitignore`, `.gitattributes`, `AGENTS.md` rewiring, `CLAUDE.md` (`@AGENTS.md`)

**Validation:** `bun run verify` exits 0 (placeholder scripts only — no workspace code yet). Hook
files byte-compared against the skill references. CI not run (branch not pushed).

**Next:** ruleset after first push (ledger Track 2); parity spec (ledger Track 1).

---
