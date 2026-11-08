# Agent Workflow

How agents plan and implement in this repo, and which skills to invoke automatically.
The full discipline lives in the `t4-dev-workflow` skill; this file is the repo-specific wiring.

## Development workflow

When planning or implementing a feature, follow this order:

1. **`/grill-me`** — stress-test the concept first (interview-style)
2. **`/grill-with-docs`** — challenge the plan against `CONTEXT.md` and the ADRs in `docs/adr/`
3. **Survey the change sites** — enumerate every place the change touches (every occurrence, both sides of every mirror, callers, tests, docs, CI), before the plan exists
4. **`/to-prd`** — create a PRD from the grilled plan (one PRD per epic), carrying the survey as its change inventory
5. **`/to-issues`** — break the PRD into GitHub issues on `xenodeve/narze` with triage labels (one issue per deliverable, linked as native sub-issues)
6. **`/tdd`** — implement test-first (red → green → refactor); a red must fail for the reason the test names

Hard ordering: **PRD → issues → PR**. Never open a PR without a referenced issue (the `t4-gate` hook denies it).

`/grill-me`, `/grill-with-docs`, `/to-prd`, `/to-issues` and `/triage` are **user-invocation-only**
(`disable-model-invocation: true`). An agent cannot call them through the `Skill` tool and will not
see them in its skill list — that is not absence. Ask the developer to run the exact command; do not
improvise the output. The matt pocock skills live in `~/.agents/skills/` (outside `~/.claude/skills`),
so read their `SKILL.md` directly when you need the procedure.

## Auto-triggered skills

| Trigger | Skill | Condition |
|---|---|---|
| New directive from the developer | intake (`t4-dev-workflow`) | Before the first committing action; at most two questions, one batch |
| About to write down what you will change | change-site survey | Every time; check adjacent issues for an existing inventory |
| Bug / error / stack trace | `/debug-mantra` | Start a debug session every time; root cause before fix |
| Complex debug / perf regression | `/diagnose` | reproduce → minimise → hypothesise → fix |
| After fixing a bug | `/post-mortem` | Record root cause + fix + validation (`docs/reports/`) |
| After writing or changing code | `/simplify` | Before committing — check over-engineering |
| Editing UI / frontend (`apps/dashboard`) | `/impeccable` | Every time a component or CSS is touched; follow `DESIGN.md` (Strata-xeno) |
| New UI needs a design brief | `/impeccable shape` | Plan the UX before implementing |
| UI ready to ship | `/impeccable audit` + `/impeccable harden` | a11y / perf / responsive + edge cases |
| Before merge / ship | `/code-review` + `/scrutinize` | Correctness + outsider perspective |
| Touching a security boundary | `/security-review` | Discord OAuth, Supabase Auth/RLS, tokens, secrets, Socket.io auth, Redis channel trust |
| After implementation | `/verify` | Confirm the feature works in the running app |
| Exploring unfamiliar code | `/zoom-out` | High-level context before editing |
| Codebase complexity growing | `/improve-codebase-architecture` | Every few days, or after a major feature |

Every push states each judgment gate in a commit trailer (`check-gate-ledger` refuses silence):

```
T4-Gates: simplify=ran code-review=ran scrutinize=not-run security-review=n-a verify=ran
```

`not-run` is legal for the guard; for the rule it needs a checkable reason stated in the PR body.

## Verification mandate

- **Fast gate (local + CI):** `bun run verify` = `lint && typecheck && test && build`. This is
  `.claude/t4.json` `"verify"`; `t4-gate` runs it itself before `gh pr merge` and denies on failure.
  It must stay a literal prefix of the CI jobs in `.github/workflows/t4-verify.yml`.
- **E2E:** `bun run e2e` (Playwright, `apps/dashboard`) — runs in `.github/workflows/t4-e2e.yml`, never in
  `"verify"`. Every frontend change is verified end-to-end; add a case for each new page or
  interactive UI. Unit tests cannot see real layout, hydration, or Socket.io sync.
- Bot behaviour that needs Discord / Lavalink is verified against a real test guild and stated
  honestly ("not run: <X>") when it could not be.

Both scripts currently echo "no workspace yet" — the workspaces are not scaffolded. Replace them
when `apps/*` / `packages/*` land.

## Tooling

- **Package manager / runtime:** Bun workspaces (`apps/*`, `packages/*`); commit `bun.lock`; use `bunx`.
- `bun` and `gh` are **not on PATH** on the developer's machine. Use
  `"C:\Users\xenod\.bun\bin\bun.exe"` and `"C:\Program Files\GitHub CLI\gh.exe"` (quoted).
- Guards: run `git config core.hooksPath .githooks` once per clone.

## Branch & CI state

- Active line: **`v7`** (fresh rewrite). `v6` is the repo default and reference only; `v5.0.2` is the
  feature-parity reference.
- Workflows (`t4-verify`, `t4-e2e`, `t4-codeql`) trigger on `v7`; Dependabot targets `v7`. When v7
  becomes the default / merges to `main`, update `branches:` and `target-branch:`.
- CodeQL is free (public repo). Its findings land in the Security tab and are **not** a gate unless
  `analyze (javascript-typescript)` is added to the required checks.

### Pending: apply after first push of `v7`

GitHub only lets you require a check it has already seen, so these wait until `v7` is pushed and
`T4 verify` has run once. Then, from the repo:

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"

# 1. Required checks + no direct pushes on v7 (targeted explicitly: the default branch is still v6).
#    If v7 is made the default branch first, "refs/heads/v7" can be "~DEFAULT_BRANCH" instead.
"$GH" api --method POST repos/xenodeve/narze/rulesets --input - <<'JSON'
{
  "name": "T4 v7 gate",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/v7"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      } },
    { "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "lint" },
          { "context": "typecheck" },
          { "context": "test" },
          { "context": "build" },
          { "context": "guards" }
        ]
      } }
  ]
}
JSON

# 2. Verify it took.
"$GH" api repos/xenodeve/narze/rulesets

# 3. Secret scanning / push protection / Dependabot alerts — verify, don't assume (public repos
#    get secret scanning by default; the rest may still be off).
"$GH" api repos/xenodeve/narze --jq .security_and_analysis
"$GH" api --method PUT repos/xenodeve/narze/vulnerability-alerts
"$GH" api --method PUT repos/xenodeve/narze/automated-security-fixes
```

Read the actual check names off the first run (`gh pr checks <pr>`) before applying — a ruleset
requiring a name that never reports deadlocks every merge. **Promote e2e** by adding
`{ "context": "e2e" }` once `t4-e2e.yml` has been green on `v7` for a week with no re-runs
(advisory since 2026-11-08).

Until the ruleset is active, the only gates are the local `t4-gate` (Claude-run commands) and the
opt-in `.githooks/pre-push`. Do **not** set `.claude/t4.json` `"requireGreenCI": true` as a stand-in
before CI has run once — with no checks reporting, `gh pr checks` fails and every merge is denied.
