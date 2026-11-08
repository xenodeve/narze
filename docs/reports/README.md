# docs/reports — index & status

Engineering records for Narze v7: post-mortems, the system-impact register, the bug-case catalog,
and the survey-provenance cache. Status: `LIVING` = keep current · `SNAPSHOT` = point-in-time (don't
edit, add new) · `ARCHIVED` = superseded · `TEMPLATE`.

> **Start here:** `../OPEN-WORK-LEDGER.md` for open work; `system-impact-report.md` for what changed.

| File | Status | What it is |
|------|--------|-----------|
| `system-impact-report.md` | LIVING | Register of system-affecting changes + tech-debt (append a dated entry per change) |
| `bug-case-catalog.md` | LIVING | Notable bugs: symptom → root cause → fix → lesson |
| `post-mortem-template.md` | TEMPLATE | Skeleton for `YYYY-MM-DD-<slug>.md` post-mortems (fixed + validated bugs only) |
| `survey-manifest/README.md` | LIVING | Provenance cache — what a prior scan read, at which commit |

Which record to write (from `t4-engineering-records`):

| What happened | Record |
|---|---|
| Bug fixed **and validated** (repro + root cause + validated fix) | post-mortem `YYYY-MM-DD-<slug>.md` + pointer in `system-impact-report.md` |
| Hard-to-reverse decision | ADR in `../adr/` + row in `../adr/README.md` |
| System-affecting change shipped | entry in `system-impact-report.md` |
| Bug with a transferable lesson | entry in `bug-case-catalog.md` |
