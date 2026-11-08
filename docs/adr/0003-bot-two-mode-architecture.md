# ADR-0003: Bot 2-Mode Architecture (Connected / Standalone)

## Status
Accepted

## Context
V6 Dashboard เป็น optional layer บน Bot — Bot ควรทำงานได้สมบูรณ์โดยไม่ต้องมี Backend หรือ Dashboard (บทเรียนจาก v5.0.2 ที่ทุกอย่างผูกกันทำให้ debug ยาก). ในขณะเดียวกัน เมื่อ Backend พร้อม Bot ควร sync state ให้ Dashboard แบบ real-time

## Decision
Bot detect mode อัตโนมัติตอน startup โดยลอง connect Redis:

- **Connected Mode** (Redis reachable): Bot รับ settings จาก Backend ผ่าน Redis, publish player events ให้ Dashboard sync
- **Standalone Mode** (Redis unreachable): Bot ดึง settings จาก Supabase โดยตรง, ทำงานปกติไม่มี Dashboard

Supabase เป็น source of truth ทั้งสอง mode — ไม่มี data inconsistency ระหว่าง mode switching

## Alternatives Considered
- **Environment variable `BACKEND_MODE`**: user กำหนดเองว่าจะรัน mode ไหน — แต่เพิ่ม config burden และเกิด human error ได้
- **Bot ต้องมี Backend เสมอ**: simple กว่า แต่ Dashboard กลายเป็น single point of failure สำหรับ music playback

## Rationale
- **Self-hosted resilience**: ผู้ใช้ที่รัน Bot อยู่ไม่ควรมีเพลงหยุดเพราะ Dashboard/Backend ล่ม
- **Low barrier to entry**: รัน Bot อย่างเดียวก่อนได้ เพิ่ม Dashboard ทีหลัง
- **Auto-detect ลด config**: Bot ตัดสินใจเองจาก environment — ไม่ต้องจำ flag เพิ่ม
- **Supabase ทั้งสอง mode**: Bot มี Supabase credentials เสมอ — Connected mode แค่ delegate ให้ Backend แทนที่จะอ่านตรง ไม่มี data layer แยก

## Consequences
- Bot มี code path สองแบบสำหรับ settings fetch — ต้องทดสอบทั้งสอง mode
- Bot ต้องมี Supabase credentials เสมอ (ไม่ใช่แค่ Standalone mode)
- Settings ที่ Backend push ผ่าน Redis ควร mirror Supabase เสมอ — ห้าม Backend เก็บ settings ที่ไม่ sync กับ Supabase

## Implementation notes

- **2026-11-08 (#103):** Standalone Mode plays, keeps Queue Snapshots and runs Queue Recovery without Redis (local files, CONTEXT.md). No Bot setting lives in Supabase yet, so the direct Supabase read in Standalone is not built; it lands with #106 (`/setchannel`, guild settings). Until then the Decision's settings path describes intent, not code.
- **2026-11-08 (#106):** Guild Settings now live in Supabase (`guild_settings`). The Bot reads and writes them directly in both modes (`apps/bot/src/settings/guild-settings.ts`); in Connected Mode a Dashboard change also reaches the Bot's copy through the `settings:update` guild event on Redis (`apps/bot/src/main.ts`). The Decision's settings path is now code.
