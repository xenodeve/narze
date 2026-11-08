---
name: v7-bootstrap-decisions
description: Developer decisions fixed at the v7 bootstrap (2026-11-08) — tier, stack, tooling, clink, language, design system
type: project
---

Decided by the developer on 2026-11-08 when `v7` was bootstrapped as a fresh rewrite:

- **Branch:** `v7` is the active line; `v6` (repo default) is reference only. Feature-parity target is
  v5.0.2 (spec: `docs/research/v5-feature-inventory.md`).
- **Tier:** Active (T4).
- **Stack (planned):** Bun workspaces — `apps/bot` (discord.js + Lavalink), `apps/api` (NestJS +
  Socket.io), `apps/web` (Next.js), `packages/shared`; Supabase (Postgres/Auth) + Redis (cache +
  pub/sub IPC, see ADR-0002).
- **Tooling:** `bun` and `gh` are installed but not on PATH — use
  `C:\Users\xenod\.bun\bin\bun.exe` and `C:\Program Files\GitHub CLI\gh.exe` (quoted).
- **clink:** not used — no delegation default through PAL clink.
- **Language:** chat/reports in Thai (t4-bro register); GitHub tracker bodies bilingual EN + full TH
  mirror; code and commits English.
- **Design system:** Strata-xeno (brief: `docs/research/strata-xeno-brief.md`, canonical: `DESIGN.md`).
- **Tracker:** GitHub Issues on `xenodeve/narze`, five default triage labels + T4 Type/Component/Severity.

**Why:** these were chosen once, by the developer; re-asking them wastes a turn and re-deciding them
silently (e.g. reaching for npm, wiring clink, or writing English-only issues) contradicts the owner.
**How to apply:** treat each as settled; change one only on a new explicit developer instruction, and
then update this note and `AGENTS.md` together.

Related: [[note-format]]
