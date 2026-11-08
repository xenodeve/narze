# Narze v7 — System-Impact Change & Tech-Debt Report

> Curated, report-level record of changes that **affect the running system** plus the
> **tech-debt register**. Audience: team / stakeholders / status reports. Append a dated
> section per significant batch (newest on top); keep entries terse + linkable. Write
> "not measured" / "N/A" honestly — never fabricate numbers.
>
> Entry skeleton (`t4-engineering-records` → `references/record-templates.md`):
>
> ```markdown
> ## <YYYY-MM-DD> — <Short change title> (<feature | bugfix/hotfix | refactor | security>) [— #<issue>]
>
> **Scope:** <area(s) + key files> · **Type:** <one line> · **Tests:** <N/N green (+M new); typecheck; E2E status>
> [**Severity:** <low/medium/high — bug/security only>]
>
> **What & where:** … **Why:** … **Before → After:** … **Performance Δ:** <measured, or "N/A">
> **Quality:** … **Validation:** <state "Not run: <X>" honestly> **Risk / rollback:** … **Links:** …
>
> ---
> ```

## 2026-11-08 — No-CI mode: local verification replaces GitHub Actions (refactor) — #116

**Scope:** `.claude/t4.json`, `.githooks/pre-push`, `AGENTS.md`, `docs/agents/workflow.md`, `docs/OPEN-WORK-LEDGER.md` · **Type:** temporary change to how merges are verified · **Tests:** N/A (config + docs)

**What & where:** every Actions job fails at provisioning with "The job was not started because your account is locked due to a billing issue" (check-run annotations on PR #115; runs 42442848200, 42442848196, 42442848328). The T4 gate `verify` now runs `verify` + `e2e`; `pre-push` no longer claims CI re-checks a push; `AGENTS.md` defines the no-CI merge rules. **Why:** with no runner, CI provides none of its four properties (clean machine, unconditional run, CI-only suites, unforgeable result). **Before → After:** merge meant to be gated by required checks (never applied — `v7` was unpushed) → merge gated by the local T4 gate + a clean-worktree run + mandatory review. **Performance Δ:** N/A.
**Quality:** e2e runs before every agent merge instead of nowhere — vacuous until real suites land with PR #115; CodeQL stays unverified. **Validation:** Not run: a merge under the widened gate (the first will be PR #115). **Risk / rollback:** a human merging on the web is unguarded; rollback = restore `verify` to the fast suite once #116 closes. **Links:** #116, `t4-project-bootstrap` → ci-cd-layer.md "When CI cannot run at all".

---

## Tech-debt register

| Item | Area | Introduced | Tracking |
|---|---|---|---|
| _(none yet)_ | | | |
