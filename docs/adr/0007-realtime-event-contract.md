# ADR-0007: Realtime event contract — revision, sequence and one socket per tab

- **Status:** Accepted — 2026-11-08 (schemas implemented in #98; client reconciliation lands in #102)
- **Area:** shared · backend · dashboard
- **Builds on:** ADR-0001 (Socket.io), ADR-0002 (Redis IPC)

<!-- lang:en -->
## Context

v5 sent queue events with a per-message `sequence` and a per-mutation `revision`, but the Dashboard never read `revision` (its recheck manager was a no-op — spec §8, §11 #37). Two tabs could therefore show different queues after a burst of edits, and a late subscriber could apply an old event over a newer snapshot.

## Decision

1. **Every Guild event uses one envelope**, defined once in `packages/shared` (`GuildEventSchema`): `{ type, guildId, revision, sequence, ts, data }`. `revision` is the Guild's **Queue Revision** (bumped by every queue mutation); `sequence` orders messages; `ts` is the server time.
2. **Clients reconcile by revision:** drop any event whose `revision` is lower than the local one; when an event's `revision` is more than one ahead, refetch the snapshot from the Hot Cache instead of applying it.
3. **`jumpToTrack` is emitted before the queue update** it causes (v5 contract, spec #39), so the Dashboard can animate the jump before the list changes.
4. **One Socket.io connection per tab**, shared by every component (`apps/dashboard/src/lib/socket.ts`), multiplexing Guild and user rooms.
5. **Revisions belong to one Bot process.** Every Player State carries the Bot's `epoch` (a new id per process start, #100); a state from a new epoch is applied even with a lower revision, because revisions start over when the Bot restarts (`apps/backend/src/player/player-cache.ts` `apply`, `packages/shared/src/reconcile.ts`). On ready the Bot also removes the states its previous process left (`sweep`).
6. **Bot status is not a Guild event**: it travels as `bot:status` with `BotStatusPayloadSchema` and has no revision, because it is derived from heartbeats, not mutations.

## Alternatives considered

- **Sequence only** — orders messages on one connection but cannot detect that a reconnecting client missed mutations.
- **Full state on every event** — simplest reconciliation, but the queue can hold hundreds of tracks; sending it on every progress-free change wastes bandwidth on phones.

## Consequences

- Any new Guild event type must be added to the shared package first; the Bot, Backend and Dashboard all fail typecheck or contract tests until they agree.
- The Backend's Hot Cache must store the revision with each snapshot so a refetch is consistent.
<!-- lang:end -->

<!-- lang:th -->
## บริบท

v5 ส่ง event ของคิวพร้อม `sequence` ต่อข้อความ และ `revision` ต่อการแก้คิว แต่ Dashboard ไม่เคยอ่าน `revision` เลย (ตัว recheck manager ไม่ได้ทำอะไร — สเปกหมวด 8 และหมวด 11 ข้อ #37) ผลคือสองแท็บอาจแสดงคิวไม่ตรงกันหลังมีการแก้ติด ๆ กัน และ client ที่ต่อเข้ามาช้าอาจเอา event เก่าไปทับ snapshot ที่ใหม่กว่า

## การตัดสินใจ

1. **ทุก Guild event ใช้ซองเดียวกัน** ซึ่งกำหนดไว้ที่เดียวใน `packages/shared` (`GuildEventSchema`): `{ type, guildId, revision, sequence, ts, data }` โดย `revision` คือ **Queue Revision** ของ Guild (เพิ่มทุกครั้งที่แก้คิว) `sequence` ใช้เรียงข้อความ และ `ts` คือเวลาของ server
2. **client reconcile ด้วย revision:** ทิ้ง event ที่ `revision` ต่ำกว่าของในเครื่อง และถ้า `revision` ของ event นำหน้าเกินหนึ่ง ให้ดึง snapshot ใหม่จาก Hot Cache แทนการเอา event นั้นมาใช้
3. **`jumpToTrack` ถูกส่งก่อนการอัปเดตคิว** ที่มันทำให้เกิด (สัญญาเดิมของ v5 สเปกข้อ #39) เพื่อให้ Dashboard ทำ animation การกระโดดได้ก่อนรายการจะเปลี่ยน
4. **หนึ่งแท็บมีการเชื่อมต่อ Socket.io เดียว** ใช้ร่วมกันทุก component (`apps/dashboard/src/lib/socket.ts`) และรวม room ของ Guild กับของผู้ใช้ไว้ในการเชื่อมต่อเดียว
5. **revision ผูกกับ Bot หนึ่ง process** ทุก Player State มี `epoch` ของ Bot (id ใหม่ทุกครั้งที่ process เริ่ม, #100) state ที่มาจาก epoch ใหม่จะถูกใช้แม้ revision จะต่ำกว่า เพราะ revision เริ่มนับใหม่เมื่อ Bot รีสตาร์ต (`apps/backend/src/player/player-cache.ts` `apply`, `packages/shared/src/reconcile.ts`) และตอน ready Bot จะลบ state ที่ process ก่อนหน้าทิ้งไว้ (`sweep`)
6. **สถานะบอทไม่ใช่ Guild event:** ส่งในชื่อ `bot:status` ด้วย `BotStatusPayloadSchema` และไม่มี revision เพราะคำนวณมาจาก heartbeat ไม่ได้มาจากการแก้ข้อมูล

## ทางเลือกที่พิจารณา

- **ใช้ sequence อย่างเดียว** — เรียงข้อความบนการเชื่อมต่อเดียวได้ แต่ตรวจไม่ได้ว่า client ที่ต่อใหม่พลาดการแก้คิวไปบ้าง
- **ส่ง state เต็มทุก event** — reconcile ง่ายที่สุด แต่คิวมีได้หลายร้อยเพลง การส่งทั้งก้อนทุกครั้งที่มีการเปลี่ยนเล็ก ๆ เปลือง bandwidth บนมือถือ

## ผลที่ตามมา

- ชนิด Guild event ใหม่ทุกตัวต้องเพิ่มใน shared package ก่อน Bot, Backend และ Dashboard จะ typecheck หรือ contract test ไม่ผ่านจนกว่าจะตรงกันหมด
- Hot Cache ของ Backend ต้องเก็บ revision คู่กับทุก snapshot เพื่อให้การดึงใหม่สอดคล้องกัน
<!-- lang:end -->
