# Narze V6 — Handoff Document
**Date**: 2026-06-02  
**Branch**: `v6` (working directory: `C:\Github\narze v5 beta\v6`)  
**Next focus**: First commit → continue feature development

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

### Bug Fixes
- ✅ **NestJS startup crash** — `RedisService.psubscribe` undefined: ย้าย Redis connection init จาก `onModuleInit` → `constructor` (`nestjs/src/redis/redis.service.ts`)
- ✅ **Discord OAuth redirect_uri** — เพิ่ม `https://qkzcrrwgsefhqptcvdts.supabase.co/auth/v1/callback` ใน Discord Developer Portal + `http://localhost:3000/**` ใน Supabase redirect URLs
- ✅ **Login flow** — ผ่านแล้ว end-to-end

### UI/UX Improvements (จาก `/impeccable critique` score 23/40)
- ✅ Lucide icons (`Play`, `Pause`, `SkipForward`, `SkipBack`, `X`) แทน emoji controls
- ✅ Custom range slider CSS — 3px track, 12px accent thumb, fill gradient via `--fill-pct` CSS var
- ✅ Album art crossfade — `AnimatePresence` + `motion.div` keyed by `currentTrack.uri`
- ✅ Brand mark upgrade — "Narze V6" ที่ 16px font-semibold ink (ไม่ uppercase)
- ✅ Empty states — guild list ว่าง, search no results, queue empty (instructive text)
- ✅ Clear queue inline confirmation — "Clear 23 tracks? Confirm / Cancel"
- ✅ Connection dot — `animate-pulse` เมื่อ `connected` (live indicator)

### Performance & A11y Fixes (จาก Gemini audit)
- ✅ `muted` color token: `oklch(0.58→0.72)` — WCAG AA compliance บน card surface; **DESIGN.md อัปเดตแล้ว**
- ✅ `ProgressBar` memoized component — แยก 250ms interval re-render ออกจาก `NowPlayingPanel`; `emit` ใช้ `useCallback`
- ✅ Dynamic `aria-label` บน Add button — `"Added {title}"` เมื่อ state เป็น ✓
- ✅ Remove button `opacity-0` แทน `hidden` — keyboard discoverability
- ✅ Image domain whitelist ใน `next.config.ts` — `i.ytimg.com`, `i.scdn.co`, `i1/i2.sndcdn.com`
- ✅ ลบ `unoptimized` prop ออกจาก Image ทุกตัว
- ✅ Installed: `lucide-react`, `motion` (v11 motion/react)

### Claude+Gemini Sub-Agent Workflow
- ✅ `scripts/ask-gemini.ps1` — wrapper พร้อม `-Skill` parameter + noise filter
- ✅ `AGENTS.md` — delegation rules + skill mapping table ครบ
- ✅ Memory บันทึกแล้ว (`memory/feedback_gemini_delegation.md`)

**Skill mapping สำคัญ:**
| งาน | Skill |
|-----|-------|
| Code review | `-Skill scrutinize` |
| UI/UX | `-Skill impeccable` |
| Debug | `-Skill debug-mantra` |
| Architecture | `-Skill improve-codebase-architecture` |
| QA | `-Skill qa` |

---

## Current State

- **TypeScript**: ผ่าน (Next.js compile clean, NestJS watch mode ไม่มี error)
- **Dev servers**: ทั้งคู่รันอยู่ (NestJS :3001, Next.js :3000)
- **Redis**: container `redis-narze` running
- **Login flow**: ✅ ทำงานได้
- **Git**: **ยังไม่มี commit เลย** — ทุกอย่างยัง untracked/unstaged บน branch `v6`

---

## Immediate Next Steps

### 1. First commit (ทำก่อน)
```powershell
cd "C:\Github\narze v5 beta\v6"
git add nestjs/ nextjs/ scripts/ AGENTS.md DESIGN.md
git commit -m "feat(v6): initial dashboard with auth, UI polish, and Gemini workflow"
```

### 2. Pending features (ยังไม่ implement)
- `search:query` Socket.io handler ใน NestJS gateway — search results ไม่มาจนกว่าจะ implement
- User profile sync เมื่อ login ครั้งแรก (populate `users` table จาก Discord profile)
- Guild auto-join flow (populate `guild_members` เมื่อ login)
- Admin/Developer panels (PRD §4.3.8–4.3.9)
- Drag-to-reorder queue (keyboard-only ยังไม่ได้ implement จริง)

### 3. Remaining audit issues ที่ยังไม่แก้
- **Accent contrast** (~3.4:1 บน accent bg) — ต้องตัดสินใจ design ก่อน: darken accent หรือใช้ black text
- **Mobile layout** — `w-[55%]/w-[45%]` fixed ไม่มี breakpoint (product context = desktop-first, P2 ไม่ urgent)
- **Global state re-subscription** — Sidebar re-renders เมื่อ position เปลี่ยน (optimization ระยะยาว)

---

## Known Issues / Decisions

- `page.tsx` ใช้ `as unknown as GuildInfo[]` cast — Supabase return type mismatch, acceptable for now
- `search:query` Socket.io event ถูก emit จาก frontend แต่ backend ยังไม่มี handler
- Bot (`discordjs/`) handle โดย **akkanop-x** — อย่าแตะ
- Accent color `oklch(0.66 0.180 195)` ใช้เป็น text บน card อาจไม่ผ่าน WCAG AA — ยังไม่ได้แก้

---

## Design Constraints (enforce strictly)

- Accent `oklch(0.66 0.180 195)` บน ≤10% of screen, interactive/live state เท่านั้น
- Text on accent: **always `text-ink`** (near-white)
- Active sidebar guild: `bg-card` (not `bg-elevated`)
- No `backdrop-filter: blur`
- No gradient text fills
- 4 tonal steps only: `bg(0.08) → panel(0.13) → card(0.18) → elevated(0.24)`
- Muted: `oklch(0.72)` (updated for WCAG AA)
- Play/Pause: 48px circle, `bg-accent text-ink`
- All animations need `prefers-reduced-motion` fallback

---

## Claude+Gemini Workflow Rules

Per `AGENTS.md` "Model Delegation":
- **Claude's opinion is final** — Gemini มักมั่ว verify ทุกครั้ง
- **Coding**: Claude ทำ → Gemini review (`-Skill scrutinize`) → Claude ตัดสินใจ
- **ก่อนเรียก Gemini**: สั่งให้อ่าน AGENTS.md, DESIGN.md, CONTEXT.md และ codebase ก่อนเสมอ

```powershell
pwsh scripts/ask-gemini.ps1 -Skill scrutinize "อ่าน AGENTS.md, DESIGN.md, CONTEXT.md และ nextjs/src/ ก่อน จากนั้น..."
```

---

## Suggested Skills

- `/verify` — เปิด browser ทดสอบ login flow + dashboard ก่อน commit
- `/impeccable audit` — technical a11y/perf check หลัง commit
- `/simplify` — ก่อน commit ตรวจ over-engineering
- `/code-review` — ก่อน merge ไป `v4`
- `/security-review` — ถ้าแตะ auth code (Supabase JWT, OAuth callback)
- `/to-issues` — แตก pending features เป็น GitHub Issues
