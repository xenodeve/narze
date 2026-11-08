---
name: bun-tsconfig-follows-cwd
description: Bun reads tsconfig.json from the working directory, so the NestJS Backend only gets legacy decorators when started from apps/backend
type: reference
---

Bun picks `tsconfig.json` from the **current working directory**, not from the file being run. The
Backend's `experimentalDecorators`/`emitDecoratorMetadata` live in `apps/backend/tsconfig.json`, so
`bun apps/backend/src/main.ts` from the repo root (or from `apps/dashboard`) runs Nest with TC39
decorators and crashes with `Reflect.set requires the first argument be an object`
(`@WebSocketServer`). From `apps/backend` it boots. Reproduced from two working directories on
2026-11-08 (#98).

**Why:** any launcher that does not own the cwd — Playwright `webServer`, a Dockerfile, a root-level
script — silently gets the wrong decorator semantics, and the error points at Nest, not at the cwd.

**How to apply:** start the Backend from its own folder (`cwd: "../backend"` in
`apps/dashboard/playwright.config.ts`, or `bun run --filter @narze/backend start`). Do not "fix" it
by moving decorator flags to a root tsconfig — that changes semantics for every package run from root.

Related: [[windows-toolchain-gotchas]]
