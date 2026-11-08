# ADR-0008: Dashboard control — the Backend decides, then relays to the Bot over Redis

- **Status:** Accepted — 2026-11-08 (implemented in #101)
- **Area:** shared · bot · backend · dashboard
- **Builds on:** ADR-0002 (Redis IPC), ADR-0005 (identity), ADR-0007 (event contract)

<!-- lang:en -->
## Context

v5's Dashboard called the Bot's HTTP API directly. The API took the caller's identity from the request body, skipped the permission check when it was missing, and allowed the request when the check threw (spec §0 item 3). #101 requires the Control Permission ladder enforced server-side, "even when calling the socket directly", with the reason shown, and with controls that follow a user joining or leaving the Bot's voice channel within 2 s.

## Decision

1. **One path for every playback action:** Dashboard → Backend socket event `player:command` (with ack, one socket per tab, ADR-0001) → Redis `bot:commands` → Bot → Redis `bot:command-results` → ack. Results are paired with commands by id; a Bot that does not answer in 5 s yields `timeout` (`apps/backend/src/control/command-relay.ts:14`).
2. **The Backend decides, and fails closed** (`apps/backend/src/realtime/user.gateway.ts:212` `control`). It takes identity from the handshake, re-verifies the token with Supabase Auth on every command (ADR-0005: a signed-out token cannot act), and requires a Mutual Guild. It then evaluates the ladder (`packages/shared/src/guilds.ts:66`) from what the Bot publishes (voice states, Player summary) and the stored owner flag. Any parse failure, missing data or exception refuses. A refusal carries the ladder reason, with v5's exact texts in `CONTROL_REASON_TEXT` (`:48`).
3. **Only an owner may send the Bot to a channel they are not in.** Others start playback in their own channel. v5 let anyone pick any channel (spec 10.3 #11).
4. **The acting user travels with the command** (`actor`) and becomes the requester of web-added tracks (spec #108).
5. **The Bot only executes** (`apps/bot/src/command-bus.ts:22`): it checks that the Player can do what was asked (`no-player`, `voice-channel-required`, …) and never re-decides permission.
6. **Permission is pushed, not polled:** after every voice change (`voice:update`, debounced to 1 s per Guild in the Bot) or Player change (`player:summary`), every tab in the Guild gets `permission:update` (`user.gateway.ts:184`). The Player read carries the initial value.

## Alternatives considered

- **The Bot checks permission** — the Bot would need identity and guild snapshots, and would duplicate the ladder the Backend already evaluates for badges.
- **REST endpoints per action** — a second auth path beside the socket, plus an HTTP round trip per volume step; the socket is already authenticated and multiplexed.
- **Poll permission every 60 s (v5)** — misses the 2 s requirement; pushes come from events the Bot already publishes.

## Consequences

- A command needs the Bot in Connected Mode; in Standalone Mode the Dashboard has no path to the Bot and commands time out.
- Each command costs one Supabase Auth round trip (the token re-check). Volume is debounced in the Dashboard to bound it.
- Bot Owner (guild settings, #106) is not yet a ladder input.
<!-- lang:end -->

<!-- lang:th -->
## บริบท

Dashboard ของ v5 เรียก HTTP API ของ Bot ตรง ๆ API อ่านตัวตนของผู้เรียกจาก body ข้ามการตรวจสิทธิ์ถ้าไม่มีข้อมูลนั้น และปล่อยผ่านเมื่อการตรวจโยน error (สเปกหมวด 0 ข้อ 3) #101 ต้องการสามอย่าง:
- ลำดับ Control Permission บังคับที่ฝั่ง server "แม้เรียก socket ตรง ๆ"
- แสดงเหตุผลให้ผู้ใช้เห็น
- ปุ่มควบคุมเปลี่ยนตามภายใน 2 วินาทีเมื่อผู้ใช้เข้าหรือออกห้องเสียงของ Bot

## การตัดสินใจ

1. **ทุกคำสั่งควบคุมการเล่นวิ่งเส้นทางเดียว:** Dashboard → socket event `player:command` ของ Backend (มี ack และใช้ socket เดียวต่อแท็บ ตาม ADR-0001) → Redis `bot:commands` → Bot → Redis `bot:command-results` → ack ผลลัพธ์จับคู่กับคำสั่งด้วย id ถ้า Bot ไม่ตอบภายใน 5 วินาทีจะได้ `timeout` (`apps/backend/src/control/command-relay.ts:14`)
2. **Backend เป็นผู้ตัดสิน และเมื่อไม่แน่ใจจะปฏิเสธ** (`apps/backend/src/realtime/user.gateway.ts:212` `control`) ขั้นตอนเป็นดังนี้:
   - เอาตัวตนจาก handshake แล้วตรวจ token กับ Supabase Auth ใหม่ทุกคำสั่ง (ADR-0005: token ที่ sign out แล้วสั่งอะไรไม่ได้) และต้องเป็น Mutual Guild
   - คำนวณลำดับสิทธิ์ (`packages/shared/src/guilds.ts:66`) จากข้อมูลที่ Bot publish (สถานะห้องเสียง, Player summary) และ flag เจ้าของที่เก็บไว้
   - ถ้า parse ไม่ผ่าน ข้อมูลขาด หรือเกิด exception จะปฏิเสธทั้งหมด
   - การปฏิเสธแนบเหตุผลตามลำดับสิทธิ์ไปด้วย ข้อความตรงตาม v5 อยู่ใน `CONTROL_REASON_TEXT` (`:48`)
3. **มีแค่เจ้าของเท่านั้นที่ส่ง Bot ไปห้องที่ตัวเองไม่ได้อยู่ได้** คนอื่นเริ่มเล่นได้ในห้องของตัวเองเท่านั้น ส่วน v5 ให้ใครก็เลือกห้องไหนก็ได้ (สเปก 10.3 ข้อ #11)
4. **ผู้สั่งติดไปกับคำสั่ง** (`actor`) และกลายเป็นผู้ขอเพลงของเพลงที่เพิ่มจากเว็บ (สเปก #108)
5. **Bot มีหน้าที่แค่ทำตาม** (`apps/bot/src/command-bus.ts:22`) Bot ตรวจแค่ว่า Player ทำสิ่งที่ขอได้หรือไม่ (`no-player`, `voice-channel-required` ฯลฯ) และไม่ตัดสินสิทธิ์ซ้ำ
6. **ส่ง permission ไปหา ไม่ใช่ให้ client ถามซ้ำ:**
   - ทุกครั้งที่ห้องเสียงเปลี่ยน (`voice:update` ซึ่ง Bot debounce ไว้ไม่เกินครั้งละ 1 วินาทีต่อ Guild) หรือ Player เปลี่ยน (`player:summary`) ทุกแท็บใน Guild จะได้ `permission:update` (`user.gateway.ts:184`)
   - การอ่าน Player ครั้งแรกมีค่าตั้งต้นแนบมาด้วย

## ทางเลือกที่พิจารณา

- **ให้ Bot ตรวจสิทธิ์เอง** — Bot ต้องรู้ตัวตนและ snapshot ของ guild และต้องคำนวณลำดับสิทธิ์ซ้ำกับที่ Backend ทำอยู่แล้วสำหรับป้ายสิทธิ์
- **REST endpoint แยกต่อคำสั่ง** — เกิดเส้นทางยืนยันตัวตนอีกเส้นข้าง socket และต้องเสีย HTTP round trip ทุกครั้งที่ปรับเสียง ในขณะที่ socket ยืนยันตัวตนแล้วและใช้ร่วมกันได้อยู่แล้ว
- **ถาม permission ทุก 60 วินาที (แบบ v5)** — ไม่ทันเกณฑ์ 2 วินาที ส่วนการส่งไปหามาจาก event ที่ Bot publish อยู่แล้ว

## ผลที่ตามมา

- คำสั่งต้องการ Bot ที่อยู่ใน Connected Mode ถ้าเป็น Standalone Mode Dashboard ไม่มีทางไปถึง Bot และคำสั่งจะ timeout
- ทุกคำสั่งเสียหนึ่ง round trip ไปที่ Supabase Auth (การตรวจ token ซ้ำ) Dashboard จึง debounce การปรับเสียงเพื่อจำกัดจำนวนครั้ง
- Bot Owner (ตั้งค่า guild ใน #106) ยังไม่ได้เป็นส่วนหนึ่งของลำดับสิทธิ์
<!-- lang:end -->
