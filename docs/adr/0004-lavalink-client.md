# ADR-0004: `lavalink-client` as the Bot's Lavalink client

- **Status:** Accepted — 2026-11-08 (developer decision; implemented in #98)
- **Area:** bot

<!-- lang:en -->
## Context

v5 used the npm package `riffy`; its vendored `sinsacord` fork was never imported (spec `docs/research/v5-feature-inventory.md` §0.1). v7's Bot runs on Bun and needs a maintained Lavalink v4 client with typed events, resumable sessions and node failover hooks.

## Decision

Use `lavalink-client` 2.11.0, pinned exactly. Every node is created with `closeOnError: false`.

**Why the option is mandatory on Bun:** with the default, the client's websocket error handler calls `socket.close(500, …)` (`lavalink-client/dist/index.mjs:2987`). Bun's WebSocket rejects 500 as an invalid close code and throws `InvalidAccessError`, unhandled. Reproduced in `packages/fake-lavalink/test/connect.test.ts` (a client with a wrong password); with `closeOnError: false` the client takes its `reconnect()` path instead and the error is reported through `nodeManager` `error` events.

## Alternatives considered

- **riffy** — what v5 used; smaller API, weaker typing, and v5's own code shows the dead `sinsacord` fork as an attempt to escape it.
- **Shoukaku** — solid, but its player model is lower-level; the queue, autoplay and filters helpers in `lavalink-client` match the v5 feature set more closely.

## Consequences

- Bot code wraps `LavalinkManager`; nothing outside `apps/bot` imports the library.
- `packages/fake-lavalink` implements the subset of the v4 protocol `lavalink-client` uses on connect (`/v4/websocket`, `GET /v4/info`, `op: ready`) and grows with later slices.
- Upgrading the library requires re-running the Fake Lavalink suite, and re-checking the close-code path above.
<!-- lang:end -->

<!-- lang:th -->
## บริบท

v5 ใช้แพ็กเกจ npm `riffy` ส่วน fork `sinsacord` ที่ฝังไว้ในโปรเจกต์ไม่เคยถูก import ใช้จริง (สเปก `docs/research/v5-feature-inventory.md` หมวด 0.1) Bot ของ v7 รันบน Bun และต้องการ client ของ Lavalink v4 ที่ยังมีคนดูแล มี event แบบมี type, session ที่ resume ได้ และจุดต่อสำหรับย้าย node

## การตัดสินใจ

ใช้ `lavalink-client` 2.11.0 แบบล็อกเวอร์ชันตายตัว ทุก node สร้างด้วย `closeOnError: false`

**ทำไมค่านี้จำเป็นบน Bun:** ถ้าใช้ค่าเริ่มต้น ตัวจัดการ error ของ websocket จะเรียก `socket.close(500, …)` (`lavalink-client/dist/index.mjs:2987`) แต่ WebSocket ของ Bun ไม่ยอมรับ 500 เป็น close code และโยน `InvalidAccessError` ออกมาโดยไม่มีใครดัก ทำซ้ำได้ใน `packages/fake-lavalink/test/connect.test.ts` (client ที่ใช้รหัสผ่านผิด) พอตั้ง `closeOnError: false` client จะไปทาง `reconnect()` แทน และรายงาน error ผ่าน event `error` ของ `nodeManager`

## ทางเลือกที่พิจารณา

- **riffy** — ตัวที่ v5 ใช้ API เล็กกว่าและ type อ่อนกว่า และโค้ดของ v5 เองก็มี fork `sinsacord` ที่ตายแล้วเป็นหลักฐานว่าเคยพยายามหนีออกมา
- **Shoukaku** — มั่นคง แต่โมเดล player อยู่ระดับต่ำกว่า ตัวช่วยเรื่องคิว, autoplay และ filter ของ `lavalink-client` ตรงกับฟีเจอร์ของ v5 มากกว่า

## ผลที่ตามมา

- โค้ดของ Bot ครอบ `LavalinkManager` ไว้ นอก `apps/bot` ไม่มีใคร import ไลบรารีนี้
- `packages/fake-lavalink` ทำโปรโตคอล v4 เฉพาะส่วนที่ `lavalink-client` ใช้ตอนต่อ (`/v4/websocket`, `GET /v4/info`, `op: ready`) และจะขยายตามชิ้นงานถัดไป
- อัปเกรดไลบรารีเมื่อไหร่ ต้องรันชุด test ของ Fake Lavalink ใหม่ และตรวจเส้นทาง close code ข้างบนอีกครั้ง
<!-- lang:end -->
