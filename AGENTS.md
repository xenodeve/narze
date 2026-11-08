# Narze v7 — Agent Operating Manual

Narze v7 is a Discord music bot with a realtime web dashboard, rewritten from scratch on branch
`v7` (`v6` is reference only; `v5.0.2` is the feature-parity target). The coding agent is the
primary developer here — this file and the docs it points at are the agent's working memory.

**North star:** reach feature parity with v5.0.2 on a codebase where the bot works fully on its own
(ADR-0003), the dashboard stays in realtime sync (ADR-0001, ADR-0002), and every change arrives
through an issue, a test, and a green gate.

## Standing default: `using-t4`

**`using-t4` is the standing default for every task in this repo — not a pointer read once.** Invoke
it at task start, and **re-route through it at every phase boundary**:

- after writing code → `/simplify`
- before merge → `/code-review` + `/scrutinize`
- touched auth / secrets / tokens / any trust boundary → `/security-review`
- done → `/verify`

**A check at task start does not discharge a later trigger.** Each boundary is its own trigger.

The `.claude/` hooks inject a directive at session start and a per-turn reminder, and gate
`gh pr create` / `gh pr merge` / dangerous git — see "Enforcement" below.

## Session-start read protocol

In order, and stop pulling detail once you have enough for the task (`t4-agent-memory`):

1. **`Obsidian-Narze/Home.md`** — team memory index; open only the linked notes the task touches.
2. **`docs/OPEN-WORK-LEDGER.md`** — open work; the 🔴 UNTRACKED rows are the highest miss-risk.
3. **The relevant GitHub issue(s)** — `gh issue view <n> --comments`.
4. `DONE.md` / `docs/reports/survey-manifest/` — only when the task needs history or prior-scan provenance.

After shipping a unit: add a dated entry on top of `DONE.md`, update the ledger row and the issue.

## Repo layout

```
apps/bot          Bot — discord.js + lavalink-client music engine
apps/backend      Backend — NestJS + Socket.io
apps/dashboard    Dashboard — Next.js
packages/shared   shared types / contracts                   (planned)
docs/adr/         architecture decisions (index: README.md)
docs/agents/      workflow, tracker, labels, domain-doc rules
docs/reports/     post-mortems, impact register, bug catalog, survey manifest
docs/research/    research + specs (v5 feature inventory, Strata-xeno brief)
docs/superpowers/ plans/ and specs/
Obsidian-Narze/   team memory vault
CONTEXT.md · PRODUCT.md · DESIGN.md   glossary · product brief · Strata-xeno design system
```

Infra: Supabase (Postgres + Auth) is the source of truth; Redis is cache + pub/sub IPC between Bot and Backend (see CONTEXT.md).

## Commands

Bun workspaces (`apps/*`, `packages/*`). **`bun` and `gh` are not on PATH** on the developer's machine —
use the quoted absolute paths `"C:\Users\xenod\.bun\bin\bun.exe"` and `"C:\Program Files\GitHub CLI\gh.exe"`.
"Not on PATH" is not "not installed".

| Command | What |
|---|---|
| `bun install` | install (commit `bun.lock`; use `bunx`, not `npx`) |
| `bun run verify` | fast gate: lint + typecheck + test + build (the local ship gate runs this, plus `e2e` in no-CI mode) |
| `bun run lint` / `typecheck` / `test` / `build` | the four CI required checks |
| `bun run e2e` | Playwright end-to-end (in CI normally; run by the T4 gate during no-CI mode, #116) |
| `git config core.hooksPath .githooks` | enable the pre-push guards — once per clone |

Infra for local work: `docker compose up -d --wait redis` (tests and e2e), `docker compose --profile audio up -d lavalink` (real audio), `bunx supabase@3 start` (Supabase local, config in `supabase/`).

## Coding guidelines

Derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

1. **Think Before Coding** — State assumptions explicitly. If uncertain, ask. Surface tradeoffs.
2. **Simplicity First** — Minimum code that solves the problem. No speculative features or abstractions.
3. **Surgical Changes** — Touch only what's needed. Don't refactor adjacent code. Match existing style.
4. **Goal-Driven Execution** — Define verifiable success criteria before starting. Loop until verified.

Plus the team rules: **TDD is mandatory** for features and bugfixes; **root cause before fix**
(`/debug-mantra`); **non-standard framework version → read the vendored docs** (`node_modules/<pkg>/…`)
before prior knowledge; **verify every frontend change end-to-end**.

## Development workflow

Full pipeline, auto-triggered skills, gate trailer and verification mandate: **`docs/agents/workflow.md`**.
Summary: `/grill-me` → `/grill-with-docs` → survey the change sites → `/to-prd` → `/to-issues` → `/tdd`.
**PRD → issues → PR** — never a PR without a referenced issue.

`/grill-me`, `/grill-with-docs`, `/to-prd`, `/to-issues`, `/triage` are user-invocation-only: ask the
developer to run them; do not improvise their output.

## Writing conventions

- **Chat, reports, status updates:** Thai, `t4-bro` register (plain working-developer Thai; English only for identifiers and precision).
- **GitHub tracker (issue / PRD / PR bodies):** bilingual — English, then a **full Thai mirror** (same depth, not a summary). Titles English, conventional-commit style. Identifiers stay English. Review replies may be English-only. Details: `docs/agents/issue-tracker.md`.
- **Governed agent docs** (`CONTEXT.md`, `PRODUCT.md`, `DESIGN.md`, `docs/agents/*`): bilingual sections use `<!-- lang:en -->` / `<!-- lang:th -->` … `<!-- lang:end -->` markers, full mirror.
- **Code, commit messages, inline comments:** English.

## Dev notifications

On a long or AFK run, notify the developer when a TDD cycle / long task completes, when a confirm is
needed (before closing issues or merging), or when an AFK batch is done — not for routine progress.

## Enforcement (what actually blocks)

- **`.claude/` hooks** (marker `.claude/t4.json`): `t4-gate` **denies** `gh pr create` with no issue
  reference and dangerous git (`reset --hard`, force-push, `clean -f`, `branch -D`); before
  `gh pr merge` it **runs `.claude/t4.json` `verify`** (the full suite in no-CI mode) and denies on failure, then asks you to confirm
  `/code-review` + `/scrutinize` ran. The GitHub MCP tools meet the same gate.
- **`.githooks/pre-push`** (opt-in per clone): issue reference, tree budget / no build artifacts,
  and a `T4-Gates:` trailer stating every judgment gate.
- **CI** (`.github/workflows/`): `t4-verify` (lint · typecheck · test · build · guards), `t4-e2e`
  (advisory), `t4-codeql`. **Not yet required checks** — the ruleset is pending the first push of `v7`
  (`docs/agents/workflow.md` → "Pending"). **Currently none of them can run — see No-CI mode below.**

### No-CI mode (active since 2026-11-08 — #116)

GitHub Actions cannot start any job (account billing lock), so **no check ever reports**. Until #116 is closed:

- **A merged PR means "the author ran verify", not "CI passed".** Nothing in the merge distinguishes the two.
- The T4 gate's `verify` (`.claude/t4.json`) is the **full** suite — `bun install --frozen-lockfile`,
  `bun run verify`, `bun run e2e` — and the gate already runs it in a fresh `git worktree` of the PR head
  (`.claude/hooks/t4-gate:173`), which stands in for CI's clean machine.
- `code-review` and `scrutinize` run on every PR before merge and are recorded in `T4-Gates:`. This is
  discipline, not a mechanical block: `check-gate-ledger` refuses silence but accepts `not-run`.
- **Unverified while this lasts:** `t4-codeql` (CodeQL has no local equivalent here).
- The gate's `e2e` needs the local Redis (`docker compose up -d --wait redis`); with Docker stopped the
  gate denies the merge (fails closed). Playwright never reuses a running server, so a stale dev server
  cannot make old code pass.
- `requireGreenCI` stays `false` (with no checks it would deny every merge).
- **Ceiling:** none of this binds a human merging on the GitHub web UI.

## Delegation and companion skills

- **clink: not used — developer decision 2026-11-08.** No `clink-subagents` / `clink-masteragent`
  delegation default. Native subagents may take mechanical, low-blast-radius work; verify everything
  one returns and never delegate final verification or a security-boundary change.
- **superpowers** and **9arm** (`debug-mantra`, `scrutinize`, `post-mortem`) are available in session.
- **matt pocock** skills (`setup-matt-pocock-skills`, `to-prd`, `to-issues`, `triage`, …) are installed
  at `~/.agents/skills/` — **outside `~/.claude/skills`, so Claude Code does not list them.** Read their
  `SKILL.md` directly when a step names one.

## Skill libraries

| Library | Install | Skills หลัก |
|---|---|---|
| **[mattpocock/skills](https://github.com/mattpocock/skills)** | `npx skills@latest add mattpocock/skills` (installed at `~/.agents/skills/`) | grill-me, grill-with-docs, tdd, to-prd, to-issues, triage, diagnose, improve-codebase-architecture, zoom-out, prototype |
| **[thananon/9arm-skills](https://github.com/thananon/9arm-skills)** | `npx skills add thananon/9arm-skills` | debug-mantra, post-mortem, scrutinize, management-talk |
| **[pbakaus/impeccable](https://github.com/pbakaus/impeccable)** ([docs](https://impeccable.style/docs/)) | `npx impeccable skills install` | 23 commands — below |

### impeccable — 23 commands

All commands via `/impeccable <command>`. Use `/impeccable pin <command>` to create standalone shortcuts.
UI work follows `DESIGN.md` (Strata-xeno; brief at `docs/research/strata-xeno-brief.md`).

**Build**

| Command | What it does |
|---|---|
| `craft` | Full shape-then-build flow with visual iteration |
| `init` | One-time setup: PRODUCT.md, DESIGN.md, live mode |
| `document` | Generate DESIGN.md from existing project code |
| `extract` | Pull reusable components and tokens into design system |
| `shape` | Plan UX/UI before writing code |

**Evaluate**

| Command | What it does |
|---|---|
| `critique` | UX design review: hierarchy, clarity, emotional resonance |
| `audit` | Technical quality checks (a11y, performance, responsive) |

**Refine**

| Command | What it does |
|---|---|
| `polish` | Final pass, design system alignment, shipping readiness |
| `bolder` | Amplify boring designs |
| `quieter` | Tone down overly bold designs |
| `distill` | Strip to essence |
| `harden` | Error handling, i18n, text overflow, edge cases |
| `onboard` | First-run flows, empty states, activation paths |
| `animate` | Add purposeful motion |
| `colorize` | Introduce strategic color |
| `typeset` | Fix font choices, hierarchy, sizing |
| `layout` | Fix layout, spacing, visual rhythm |
| `delight` | Add moments of joy |
| `overdrive` | Add technically extraordinary effects |
| `clarify` | Improve unclear UX copy |
| `adapt` | Adapt for different devices |
| `optimize` | Performance improvements |
| `live` | Visual variant mode: iterate on elements in the browser |

**7 domain references** loaded on every command: `typography`, `color-and-contrast`, `spatial-design`, `motion-design`, `interaction-design`, `responsive-design`, `ux-writing`

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `github.com/xenodeve/narze`, managed with the `gh` CLI (quoted absolute path; authenticated as `xenodeve`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix) plus the T4 Component / Type / Severity groups. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

## Session end

Report every `xeno-skills` rule that did not hold as a `skill-feedback` issue on
`xenodeve/xeno-skills` — one issue per rule, a comment per session, `--repo` always (`t4-agent-memory`).
If none failed, say so in one line. Reaching `/handoff` does not discharge this.
