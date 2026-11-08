# Triage Labels

The skills speak in terms of five canonical triage roles (from `setup-matt-pocock-skills`). This file
maps those roles to the actual label strings used in `xenodeve/narze`.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

---

## T4 delta — groups pocock does not carry

All labels below exist on `xenodeve/narze` (created 2026-11-08 with `gh label create`; existing
spellings were adopted rather than duplicated — GitHub label names are case-insensitive).

### Component — exactly one per issue

| Label | Owns |
|---|---|
| `bot` | `apps/bot` — discord.js + Lavalink music engine |
| `api` | `apps/backend` — NestJS + Socket.io backend |
| `web` | `apps/dashboard` — Next.js realtime dashboard |
| `shared` | `packages/shared` — shared types / contracts |
| `infra` | CI, Redis, Supabase, deploy, tooling |
| `design` | Strata-xeno design system, `DESIGN.md` |

Legacy v6 labels `backend`, `frontend`, `auth` still exist on the tracker; do not apply them to v7 issues
(use `api` / `web`, and `security` for auth-boundary work).

### Type — one or more

`bug` · `feature` · `tech-debt` · `security` · `Optimization` · `Cleanup` · `Test`
(`bug` and `feature` are the pre-existing lowercase labels; T4 docs elsewhere write them `Bug` / `Feature`.)

### Severity — one per `bug` / `security` issue

`critical` · `Major` · `Minor`

### Lifecycle

`Latent` (exists in code, not yet manifested) · `Dormant` (real but deprioritised)

## Conventions

- Every issue has ≥1 triage-state label and exactly one component label.
- **A `security` issue must carry `critical` or `Major`** — a `Minor` security label is not valid.
- A `Latent` bug that activates is upgraded to a full `bug` issue with a severity.
- Dependabot PRs carry `dependencies` (pre-existing label) and need no issue — an exception by nature, not precedent.
