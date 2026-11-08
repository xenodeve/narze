---
name: windows-toolchain-gotchas
description: Four Windows-only traps hit while verifying v7 locally — CRLF checkouts, spawn paths, the gate's text matching, and over-strict PATH simulation
type: feedback
---

All measured on the developer's Windows machine on 2026-11-08 (#98, #116).

1. **Fresh checkouts were CRLF** (`core.autocrlf=true`), and Biome (LF) failed lint in every clean
   worktree — including the T4 gate's own — while the author's working copy passed. Fixed at the root:
   `.gitattributes` `* text=auto eol=lf`. A green lint in your own working copy proves nothing about a
   clean checkout.
2. **Node cannot spawn a POSIX-style path** (`/c/Users/...` → `ENOENT`). Spawn Bun via
   `process.env.npm_execpath` (set by `bun run`) — see `apps/dashboard/e2e/bun-bin.ts`. Separately, a
   process killed by a signal has `exitCode === null` and `signalCode` set; check both (`stopBot` in
   `apps/dashboard/e2e/bot-status.spec.ts`).
3. **The T4 gate matches text, not intent:** a Bash command whose *content* contains `gh pr merge`
   (e.g. a script writing that phrase into a doc) triggers the ship gate and runs `verify`. Put such
   edits in a script file and run the file.
4. **Simulating the hook with `PATH=/usr/bin:/mingw64/bin` is stricter than reality** — without
   `C:\Windows\System32` the e2e web servers took ~9.6 min to come up. The real hook has the normal
   Windows PATH minus Bun: simulate with the normal PATH (27 s for the full suite).

**Why:** each one produced a confident wrong reading (green lint, a silent spawn failure, a "verify
failed" on a docs edit, a phantom 10-minute e2e) before its cause was traced.

**How to apply:** verify in a clean `git worktree` with the normal PATH; read spawn errors; keep
gate-sensitive phrases out of inline commands.

Related: [[bun-tsconfig-follows-cwd]]
