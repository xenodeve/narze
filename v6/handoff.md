# Narze V6 — Handoff Document
**Date**: 2026-06-02  
**Branch**: `v6-webapp`  
**Next focus**: #70 accent contrast decision → remaining HITL issues (#71-#74)

---

## Project Summary

Narze V6 — Web dashboard สำหรับควบคุม Discord Music Bot (self-hosted)

| App | Dir | Stack |
|-----|-----|-------|
| Bot (akkanop-x) | `discordjs/` | Discord.js + Lavalink — **อย่าแตะ** |
| Backend | `nestjs/` | NestJS, Socket.io, ioredis, Supabase Admin SDK |
| Dashboard | `nextjs/` | Next.js 15, App Router, Tailwind v4, Supabase SSR |

**Key docs** (repo root):
- `PRD.md` — full product requirements
- `DESIGN.md` — design system "The Live Desk" palette + components
- `CONTEXT.md` — domain glossary
- `PRODUCT.md` — brand + product context
- `AGENTS.md` — dev workflow + **Claude+Gemini delegation rules**
- `docs/adr/` — ADR-0001 (Socket.io), ADR-0002 (Redis IPC), ADR-0003 (Bot 2-mode)

---

## What Was Completed This Session

### Session 1 (previous)
- ✅ NestJS startup crash fix, Discord OAuth redirect, login flow
- ✅ UI polish: Lucide icons, custom slider, album art crossfade, empty states
- ✅ A11y/Perf: muted color WCAG AA, ProgressBar memoized, aria-labels, image domains
- ✅ `scripts/ask-gemini.ps1` + `AGENTS.md` delegation rules
- ✅ `.impeccable/design.json` sidecar generated

### Session 2 (this session)
- ✅ **#67** `search:query` NestJS gateway bridge — stateless relay via Redis IPC (2 tests)
- ✅ **#68** Auth data persistence — `upsertUser` + `syncGuildMemberships` in GuildService + `guilds:sync` socket event (6 tests)
- ✅ **#69** Queue drag-to-reorder — `motion/react` Reorder + keyboard fallback (▲▼) + optimistic update
- ✅ Fix pre-existing `$1` prop bug in `search-panel.tsx`
- ✅ Fix `ask-gemini.ps1` `-Prompt` parameter (no more interactive prompt)
- ✅ GitHub Issues #67-#74 created + #67/#68/#69 closed
- ✅ NestJS: 9/9 tests pass

### Gemini Workflow Fix
- `ask-gemini.ps1` now uses positional `-Prompt` parameter — no more interactive `PromptParts[0]:` prompt
- For prompts with backticks/special chars: write to temp file, pass via `Get-Content ... -Raw`

---

## Current State

- **TypeScript**: ผ่าน (Next.js + NestJS compile clean)
- **Tests**: 9/9 pass (`nestjs/`)
- **Git**: commit `307098b` pushed to `v6-webapp`
- **Login flow**: ✅
- **Search**: ✅ backend bridge พร้อม (ต้องรอ bot implement search handler)
- **Queue**: ✅ drag-to-reorder พร้อม

---

## Open GitHub Issues

| # | Title | Status | Blocked by |
|---|-------|--------|-----------|
| #70 | Fix accent contrast (~3.4:1) | ⏸ HITL decision | - |
| #71 | Guild settings panel | open | #68 ✅ |
| #72 | Playback history tracking | open | #68 ✅ |
| #73 | Discord chat history | open | #71 |
| #74 | Admin & Developer panels | open | #68, #72, #73 |

---

## Immediate Next Steps

### 1. #70 Accent contrast — ต้องตัดสินใจก่อน
ปัจจุบัน `oklch(0.66 0.180 195)` (accent bg) + `text-ink` (oklch(0.95)) = ~3.4:1
WCAG AA text ต้องการ 4.5:1

**ตัวเลือก:**
- **Darken accent** → `oklch(0.50 0.180 195)` (darker teal — brand color เข้มขึ้น)
- **ยอมรับ 3.4:1** — WCAG AA pass สำหรับ non-text UI components (3:1) แต่ 11px text (filter tabs) ยังต่ำกว่า spec

### 2. #71 Guild Settings Panel (AFK หลัง decide #70)
Backend (`settings:get`/`settings:update`) มีแล้วใน gateway — เหลือแค่ frontend UI

### 3. #72 Playback History (AFK)
เพิ่ม `playback_history` table + backend logging + frontend list

---

## Known Issues / Decisions

- `search:query` backend bridge พร้อม แต่ bot ยังไม่มี search handler (akkanop-x's scope)
- `guild_members` sync ทำผ่าน `guilds:sync` socket event — frontend ต้อง emit guild list หลัง login
- Bot (`discordjs/`) handle โดย **akkanop-x** — อย่าแตะ
- Accent color `oklch(0.66 0.180 195)` contrast ~3.4:1 — ยังไม่แก้ (#70)

---

## Design Constraints (enforce strictly)

- Accent `oklch(0.66 0.180 195)` บน ≤10% of screen, interactive/live state เท่านั้น
- Text on accent: **always `text-ink`** (near-white)
- Active sidebar guild: `bg-card` (not `bg-elevated`)
- No `backdrop-filter: blur`
- No gradient text fills
- 4 tonal steps only: `bg(0.08) → panel(0.13) → card(0.18) → elevated(0.24)`
- Muted: `oklch(0.72)` (WCAG AA)
- Play/Pause: 48px circle, `bg-accent text-ink`
- All animations need `prefers-reduced-motion` fallback

---

## Claude+Gemini Workflow

```powershell
# สำหรับ prompt ปกติ (ไม่มี backtick/special chars)
pwsh scripts/ask-gemini.ps1 "prompt here"

# สำหรับ prompt ที่มี special chars
$prompt = Get-Content scripts/gemini-prompt-issues.txt -Raw
pwsh scripts/ask-gemini.ps1 $prompt
```

- **Claude's opinion is final** — Gemini มักมั่ว verify ทุกครั้ง
- Delegation rules อยู่ใน `AGENTS.md`
