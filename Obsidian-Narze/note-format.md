---
name: note-format
description: The format every memory note in this vault follows — read before writing a new note
type: reference
---

One note = one memory. The filename is a hyphen-kebab slug equal to the note's `name:` so
`[[wikilinks]]` resolve. Add a one-line entry to [[Home]] under its `type` when you create one.

```markdown
---
name: <short-kebab-slug>            # must match the filename
description: <one-line summary — what a future agent skims in Home.md to decide relevance>
type: feedback | project | reference | user | concept   # concept = a hub linking existing records, not a new fact
---

<The fact. For feedback/project, follow with:>
**Why:** <the reason it matters>
**How to apply:** <the concrete action it changes>

<Link related memories with [[other-slug]]. Convert relative dates to absolute.>
```

**Threshold (strict):** persist only stable, non-obvious conventions / decisions / feedback that save a
future agent costly rediscovery. Not quick-read facts, generic framework knowledge, one-off task notes,
or volatile line-level detail. Update an existing note rather than writing a second one; delete a note
that turns out wrong. The full rules live in the `t4-agent-memory` skill.
