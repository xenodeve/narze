# ADR-0006: Two-tier Hot Cache for Player State — in-process LRU in front of Redis

- **Status:** Accepted — 2026-11-08 (Player State tier implemented in #100; search and metadata TTLs follow with #104/#105)
- **Area:** bot · backend · dashboard
- **Builds on:** ADR-0002 (Redis IPC), ADR-0007 (revision contract)

<!-- lang:en -->
## Context

In v5 every Dashboard page load asked the Bot over HTTP for the current track and queue, so a page load cost a Bot round trip and failed outright while the Bot was busy or restarting. #100's acceptance requires the opposite: "page load reads the Hot Cache, not the Bot", and a track start must reach every open tab within 1 s.

## Decision

1. **The Bot writes, the Backend reads.** On every change the Bot SETs `player:state:<guild>` and `player:summary:<guild>`, then publishes `player:state` and `player:summary` Guild events, keys first, so a reader reacting to an event never finds the old value (`apps/bot/src/music/player-state.ts:66` `createPlayerPublisher`). A destroyed Player deletes both keys and publishes `player:gone`.
2. **Tier 1 is an in-process LRU** of up to 500 Guilds in the Backend (`apps/backend/src/player/player-cache.ts:15` `PlayerCache`), kept current by those events: `apply` ignores a revision older than the cached one (`:33`), `player:gone` clears it.
3. **Tier 2 is the Redis key.** A tier-1 miss reads it once (`:21`). The Bot is never asked.
4. **`GET /api/guilds/:id/player`** answers from the cache for members of that Mutual Guild only (View Permission), with the Backend's `now` so the client can place `syncedAt` on its own clock (`apps/backend/src/player/player.controller.ts:20`).
5. **The event itself is relayed** to the Guild's socket room unchanged; the Dashboard reconciles by revision (`apps/dashboard/src/lib/use-player.ts:28`, ADR-0007).

## Alternatives considered

- **Redis only** — one network hop per page load; acceptable today, but every viewer of a busy Guild pays it, and the LRU costs a Map.
- **Ask the Bot (v5)** — couples page loads to the Bot's health; rejected by #100's acceptance.
- **Cache with a TTL instead of events** — stale for up to the TTL; the Bot already publishes every change, so events keep the cache exact without expiry.

## Consequences

- **Never authoritative:** the Bot rebuilds the keys on its next change; a Backend restart starts with an empty LRU and refills from Redis.
- One Backend process holds one LRU; a second instance would hold its own, kept current by the same events.
- Search results and metadata (spec TTLs) are not cached yet; they join this cache when #104/#105 add those reads.
- Measured (#100 e2e): a state published on Redis reaches two open tabs within the 1 s budget, and a page reload renders it after its Redis key is deleted.
<!-- lang:end -->

<!-- lang:th -->
## บริบท

ใน v5 ทุกครั้งที่โหลดหน้า Dashboard จะถาม Bot ผ่าน HTTP เพื่อเอาเพลงปัจจุบันและคิว การโหลดหน้าจึงต้องเสียหนึ่ง round trip ไปที่ Bot และพังไปเลยถ้า Bot ยุ่งหรือกำลังรีสตาร์ต เกณฑ์ของ #100 ต้องการตรงกันข้าม คือ "การโหลดหน้าอ่านจาก Hot Cache ไม่ใช่จาก Bot" และเพลงที่เริ่มเล่นต้องไปถึงทุกแท็บที่เปิดอยู่ภายใน 1 วินาที

## การตัดสินใจ

1. **Bot เป็นคนเขียน Backend เป็นคนอ่าน** ทุกครั้งที่มีการเปลี่ยน Bot จะ SET `player:state:<guild>` และ `player:summary:<guild>` แล้วค่อย publish Guild event `player:state` กับ `player:summary` โดยเขียน key ก่อน ฝั่งที่อ่านตาม event จึงไม่เจอค่าเก่า (`apps/bot/src/music/player-state.ts:66` `createPlayerPublisher`) ถ้า Player ถูกทำลาย Bot จะลบทั้งสอง key และ publish `player:gone`
2. **ชั้นที่ 1 คือ LRU ใน process** ของ Backend เก็บได้สูงสุด 500 Guild (`apps/backend/src/player/player-cache.ts:15` `PlayerCache`) อัปเดตตาม event เหล่านั้น `apply` ทิ้ง revision ที่เก่ากว่าของที่ cache ไว้ (`:33`) และ `player:gone` จะล้างค่า
3. **ชั้นที่ 2 คือ key ใน Redis** ถ้าชั้นที่ 1 ไม่มีจะอ่านจาก Redis หนึ่งครั้ง (`:21`) และไม่ถาม Bot เลย
4. **`GET /api/guilds/:id/player`** ตอบจาก cache ให้เฉพาะสมาชิกของ Mutual Guild นั้น (View Permission) พร้อม `now` ของ Backend เพื่อให้ client เลื่อน `syncedAt` มาเป็นเวลาของเครื่องตัวเองได้ (`apps/backend/src/player/player.controller.ts:20`)
5. **ตัว event ถูกส่งต่อเข้า room ของ Guild ทั้งก้อน** แล้ว Dashboard reconcile ด้วย revision (`apps/dashboard/src/lib/use-player.ts:28`, ADR-0007)

## ทางเลือกที่พิจารณา

- **ใช้ Redis อย่างเดียว** — โหลดหน้าแต่ละครั้งเสียหนึ่ง hop ทาง network ตอนนี้ยังรับได้ แต่ทุกคนที่ดู Guild ที่คนเยอะต้องจ่ายส่วนนี้ ส่วน LRU ใช้แค่ Map ตัวเดียว
- **ถาม Bot (แบบ v5)** — ผูกการโหลดหน้าไว้กับสุขภาพของ Bot ขัดกับเกณฑ์ของ #100
- **cache แบบมี TTL แทนการใช้ event** — ข้อมูลเก่าได้นานเท่า TTL ทั้งที่ Bot publish ทุกการเปลี่ยนอยู่แล้ว ใช้ event จึงทำให้ cache ตรงเสมอโดยไม่ต้องหมดอายุ

## ผลที่ตามมา

- **cache ไม่ใช่แหล่งความจริง** Bot สร้าง key ใหม่ทุกครั้งที่มีการเปลี่ยน Backend ที่รีสตาร์ตจะเริ่มด้วย LRU ว่างแล้วค่อยเติมจาก Redis
- Backend หนึ่ง process มี LRU หนึ่งชุด ถ้ามี instance ที่สองก็จะมีชุดของตัวเอง ซึ่งอัปเดตด้วย event เดียวกัน
- ผลการค้นและ metadata (TTL ตามสเปก) ยังไม่ได้ cache จะเข้ามาใน cache นี้ตอน #104/#105 เพิ่มการอ่านส่วนนั้น
- วัดแล้ว (e2e ของ #100): state ที่ publish ลง Redis ไปถึงสองแท็บที่เปิดอยู่ภายในงบ 1 วินาที และหลังลบ key ใน Redis แล้วรีโหลดหน้า ก็ยังแสดงได้
<!-- lang:end -->
