# Survey manifest — provenance cache

So a later scan (a new report, an ADR, an audit) does **not** re-read files/issues/PRs that haven't changed.

## Fragment index

| Fragment | Scope | Status |
|---|---|---|
| _(none yet)_ | | |

## Scan procedure (for the next agent)

1. Open the fragment covering the area to update (index above).
2. Before re-reading, check whether the recorded source changed:
   - Code/docs: `git log -1 --format=%H -- <path>` vs stored `last_commit` — equal ⇒ **skip**.
   - Issue/PR: `gh issue view <n> --json updatedAt` / `gh pr view <n> --json updatedAt` vs stored `updated_at` — equal ⇒ skip.
3. If changed, read only the diff (`git diff <last_commit>..HEAD -- <path>`), not the whole file.
4. Update only the changed part and bump `last_commit` / `updated_at`.

## Per-entry schema

```markdown
### <file path>                         <!-- code/doc -->
- **last_commit:** <full SHA>
- **lines_covered:** <"1-450 (full)" | "230-310 (partial)">
- **read_date:** <YYYY-MM-DD>
- **findings:** <short bullets with line-number references>

### Issue/PR #<n>                        <!-- github -->
- **state:** open/closed/merged (at read time)
- **updated_at:** <ISO timestamp from gh>
- **read_date:** <YYYY-MM-DD>
- **findings:** <short bullets>
```
