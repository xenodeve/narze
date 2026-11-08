# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

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
