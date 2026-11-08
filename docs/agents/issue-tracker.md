# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `xenodeve/narze`. Use the `gh` CLI for all operations.

> **`gh` path/auth:** `gh` is **not on PATH** on the developer's machine. Use the quoted absolute path
> `"C:\Program Files\GitHub CLI\gh.exe"` (git-bash: `"/c/Program Files/GitHub CLI/gh.exe"`).
> Authenticated as `xenodeve`, owner of `xenodeve/narze`. "Not on PATH" is not "not installed" —
> resolve the path before concluding a tool is missing.

## Language: bilingual bodies (English + Thai)

Every issue body, PRD body, and PR description must be **bilingual**:

- **Title**: English, conventional-commit style (e.g. `fix(bot): ...`, `feat(web): ...`).
- **Body**: each section in English, then a mirrored Thai version — a `## สรุปภาษาไทย` section
  covering the whole body, or `EN / TH` paired paragraphs per section for long docs.
- **Thai must mirror English exactly** — same detail, sentence count, bullets, tables. Never
  summarise or omit. "สรุป" does not mean "shorter".
- Code identifiers, filenames, log excerpts, and acceptance-criteria checkboxes stay English;
  the Thai explains them, never translates identifiers.
- Review-reply comments may be English-only; anything a teammate reads to decide gets both languages.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file>` (or a heredoc for multi-line bodies).
- **Read an issue**: `gh issue view <number> --comments`, also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close (with a REASON)**: `gh issue close <number> --reason completed|"not planned" --comment "<reason + evidence>"`. Never close silently.
- **Sub-issues** (plan → PRD → issues): `POST /repos/xenodeve/narze/issues/{n}/sub_issues` with the child's internal `id` (`gh api repos/xenodeve/narze/issues/<n> --jq .id`), not its number.

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone. The
GitHub MCP tools (`mcp__github__*`) are also available; they meet the same `PreToolUse` gate as `gh`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `xenodeve/narze` (bilingual body, triage label, one component label).

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
