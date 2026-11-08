# Domain Docs

Where this repo's domain language and decisions live, and how agents consume them when exploring.

## Layout: Single-context

One `CONTEXT.md` at the root covers the whole codebase.

```
/
├── CONTEXT.md          ← domain glossary for the whole codebase
├── PRODUCT.md          ← product brief (the "why")
├── DESIGN.md           ← Strata-xeno visual design system (the "how")
├── docs/adr/           ← architectural decision records (index: docs/adr/README.md)
├── apps/               ← bot · api · web
└── packages/           ← shared
```

(Revisit as multi-context — a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per
context, plus context-scoped `docs/adr/` — only if a second bounded context appears. Separate
workspaces in one product are not separate contexts.)

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the system context **and the canonical term glossary**. If a
  root `UBIQUITOUS_LANGUAGE.md` is added later, it becomes the canonical glossary and `CONTEXT.md`
  defers to it on any conflict.
- **`docs/adr/`** — read ADRs touching the area you're about to work in before proposing alternatives.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't
suggest creating them upfront. The producer skill (`/grill-with-docs` → `/domain-modeling`)
creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

The glossary is load-bearing. When your output names a domain concept (issue title, refactor
proposal, hypothesis, test name, PR), use the term exactly as defined in `CONTEXT.md`. Don't drift
to synonyms the glossary avoids. If a concept isn't in the glossary yet, that's a signal — either
you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly instead of silently overriding:

> _Contradicts ADR-0002 (Redis IPC between bot and backend) — but worth reopening because…_

---

_This file is the T4 `docs/agents/domain.md` (glossary pointer + layout). It shares a path with
`setup-matt-pocock-skills`' `domain.md` (consumer rules only); the consumer rules are folded into the
sections above, so there is no second copy elsewhere._
