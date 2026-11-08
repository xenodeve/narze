<!-- lang:en -->
# Narze v7 — System Context

Glossary for the whole repo (single-context). When a term appears in **bold**, use it exactly — in identifiers, issue titles, test names and PRs. The full behavioural spec inherited from v5 is `docs/research/v5-feature-inventory.md`; ADRs live in `docs/adr/`.

## Processes

**Bot** — `apps/bot`. The discord.js + `lavalink-client` process. Pure music engine: slash commands, voice, the **Player**, now-playing messages, **Queue Snapshot**. Works with or without the **Backend** (ADR-0003). _Avoid_: server, worker.

**Backend** — `apps/backend`. The NestJS process. Verifies identity, enforces **Control Permission** and admin roles, serves REST for reads, relays commands to the **Bot** over Redis and fans **Player State** out to the **Dashboard** over Socket.io (ADR-0001, ADR-0002). Owns the **Hot Cache**. Optional for playback. _Avoid_: API server, gateway (gateway is a NestJS class, not a process).

**Dashboard** — `apps/dashboard`. The Next.js web app. Talks only to the **Backend** (REST + Socket.io) and to Supabase Auth. Never calls the **Bot** directly. _Avoid_: frontend, web panel.

**Connected Mode / Standalone Mode** — how the **Bot** runs depending on whether Redis is reachable at startup (ADR-0003). Playback works in both; only Connected Mode syncs the **Dashboard**.

## Music

**Guild** — a Discord server. Every piece of state (player, queue, settings, sessions) is scoped by `guildId`.

**Player** — the **Bot**'s audio session in one **Guild**; at most one per Guild. **Active Player** has a current track or queued tracks; **Idle Player** holds the voice connection with nothing playing because **24/7** is on.

**24/7** — guild flag that keeps the **Bot** in voice after the queue ends. Without it the Bot leaves on queue end.

**Queue** — the ordered list of upcoming tracks owned by the **Player**. Source of truth for order. Every mutation increments the **Queue Revision**.

**Queue Revision** — monotonic integer per **Guild**, bumped by every queue mutation and carried on every queue event so clients can drop stale or out-of-order updates and refetch on a gap.

**Queue Snapshot** — local JSON file the **Bot** writes on every track change (queue, current track, position, **24/7**). Restored ~5 s after ready (**Queue Recovery**), cleared on queue end. Not stored in Redis or Supabase, so it works in both modes.

**Player State** — the published snapshot: current track, position + sync time, paused, volume, loop mode, **24/7**, queue, **Queue Revision**, voice channel. **Invalid Player State** = a snapshot with malformed track identity (missing uri, source or requester); it is never published.

**Requester** — the Discord user who added a track (from Discord or the Dashboard). Required on every track.

**Track Resolution** — turning a query or URL into playable tracks: Spotify search by default (market TH, mirrored to YouTube by ISRC then title), YouTube / YouTube Music, playlist URLs, Spotify oEmbed fallback.

**Music Channel** — optional text channel per **Guild** where now-playing and recovery notices go.

**Now-Playing Notice** — the embed the **Bot** posts when a track starts; suppressed for the cases listed in the spec (first `/play` track, skipplay, play-next immediate, loop repeats, terminal playback).

## People and permission

**View Permission** — any member of the **Guild** may view its **Player State**.

**Control Permission** — the right to change playback, evaluated server-side in this order: **Server Owner** → **Bot Owner** → (no Player: member in any voice channel) → (Player exists: member in the Bot's voice channel). The reason string is shown to the user.

**Server Owner** — the Discord guild owner. **Bot Owner** — the user who invited the Bot (audit log), stored in guild settings; falls back to the Server Owner.

**Admin / Developer** — dashboard roles from the **Admin Whitelist** (Supabase, keyed by Discord ID), enforced by the **Backend**. Both reach the Admin area; only Developer manages the whitelist.

## History

**Listening Session** — one per **Guild**, from the first track until the Bot leaves voice. Records every started track and every participant. Session events reach only participants.

**Play History** — per-play aggregates keyed by a normalised `title+author` id: per guild-user, per user, per guild. Feeds top-played lists.

**Like** — a user marking a track; liked tracks form the user's Liked playlist.

## Cross-cutting

**Hot Cache** — the two-tier read cache: an in-process LRU in the **Backend** in front of Redis. Holds **Player State** snapshots, search results and metadata with the TTLs from the spec. Never authoritative.

**Bot Avatar** — the per-Guild plush character (`bot-avatars`) whose state mirrors the **Player** (`working` playing · `default` idle · `sleeping` offline). Its outfit is a guild setting.

**Voice Command** — a spoken instruction captured in the **Dashboard** (Web Speech API, `th-TH`/`en-US`) and mapped to the same player actions as buttons. Not a Discord voice feature.

**Mood** — colour sampled from the current artwork; drives the Aurora glow and the Bot Avatar tint only.

## Relationships

```
Dashboard ──REST/Socket.io──▶ Backend ──Redis pub/sub──▶ Bot ──▶ Lavalink
                                 │                        │
                                 └──── Supabase ◀─────────┘ (source of truth)
```
<!-- lang:end -->

<!-- lang:th -->
# Narze v7 — System Context

อภิธานศัพท์ของทั้ง repo (แบบ single-context) คำที่เป็น **ตัวหนา** ต้องใช้ตามนี้ทุกตัวอักษร ทั้งใน identifier, ชื่อ issue, ชื่อ test และ PR สเปกพฤติกรรมฉบับเต็มที่รับมาจาก v5 อยู่ที่ `docs/research/v5-feature-inventory.md` ส่วน ADR อยู่ใน `docs/adr/`

## Process

**Bot** — `apps/bot` คือ process ของ discord.js + `lavalink-client` เป็นเครื่องเล่นเพลงล้วน ๆ ดูแล slash command, เสียง, **Player**, ข้อความเพลงที่กำลังเล่น และ **Queue Snapshot** ทำงานได้ทั้งมีและไม่มี **Backend** (ADR-0003) _เลี่ยงคำว่า_: server, worker

**Backend** — `apps/backend` คือ process ของ NestJS ทำหน้าที่ยืนยันตัวตน, บังคับ **Control Permission** และสิทธิ์ admin, ให้บริการ REST สำหรับอ่านข้อมูล, ส่งต่อคำสั่งไป **Bot** ผ่าน Redis และกระจาย **Player State** ไป **Dashboard** ผ่าน Socket.io (ADR-0001, ADR-0002) เป็นเจ้าของ **Hot Cache** ส่วนการเล่นเพลงไม่ต้องพึ่ง Backend _เลี่ยงคำว่า_: API server, gateway (gateway เป็นคลาสของ NestJS ไม่ใช่ process)

**Dashboard** — `apps/dashboard` คือเว็บแอป Next.js คุยกับ **Backend** (REST + Socket.io) และ Supabase Auth เท่านั้น ไม่เรียก **Bot** ตรง ๆ _เลี่ยงคำว่า_: frontend, web panel

**Connected Mode / Standalone Mode** — โหมดการทำงานของ **Bot** ตามว่าตอนเริ่มต่อ Redis ได้หรือไม่ (ADR-0003) เล่นเพลงได้ทั้งสองโหมด แต่มีแค่ Connected Mode ที่ซิงก์กับ **Dashboard**

## เพลง

**Guild** — เซิร์ฟเวอร์ Discord หนึ่งตัว state ทุกชิ้น (player, คิว, การตั้งค่า, session) แยกกันด้วย `guildId`

**Player** — session เสียงของ **Bot** ในหนึ่ง **Guild** มีได้มากสุดหนึ่งตัวต่อ Guild **Active Player** คือมีเพลงที่กำลังเล่นหรือเพลงในคิว **Idle Player** คือยังค้างอยู่ในห้องเสียงโดยไม่มีอะไรเล่น เพราะเปิด **24/7** ไว้

**24/7** — ค่าตั้งของ guild ที่ให้ **Bot** อยู่ในห้องเสียงต่อหลังคิวหมด ถ้าไม่เปิด Bot จะออกจากห้องทันทีที่คิวหมด

**Queue** — รายการเพลงถัดไปตามลำดับที่ **Player** เป็นเจ้าของ ลำดับยึดตามนี้ การแก้คิวทุกครั้งจะเพิ่ม **Queue Revision**

**Queue Revision** — ตัวเลขที่เพิ่มขึ้นอย่างเดียวต่อ **Guild** เพิ่มทุกครั้งที่แก้คิว และแนบไปกับทุก event ของคิว ให้ฝั่ง client ทิ้งข้อมูลเก่าหรือที่มาผิดลำดับได้ และดึงใหม่ทั้งชุดเมื่อเลขกระโดด

**Queue Snapshot** — ไฟล์ JSON ในเครื่องที่ **Bot** เขียนทุกครั้งที่เปลี่ยนเพลง (คิว, เพลงปัจจุบัน, ตำแหน่ง, **24/7**) กู้คืนประมาณ 5 วินาทีหลังพร้อม (**Queue Recovery**) และลบทิ้งตอนคิวหมด ไม่เก็บใน Redis หรือ Supabase จึงใช้ได้ทั้งสองโหมด

**Player State** — snapshot ที่ประกาศออกไป ได้แก่ เพลงปัจจุบัน, ตำแหน่งพร้อมเวลาที่ซิงก์, หยุดอยู่หรือไม่, ระดับเสียง, โหมดวน, **24/7**, คิว, **Queue Revision** และห้องเสียง **Invalid Player State** คือ snapshot ที่ข้อมูลระบุตัวเพลงเสีย (ไม่มี uri, source หรือ requester) จะไม่ถูกประกาศเด็ดขาด

**Requester** — ผู้ใช้ Discord ที่เพิ่มเพลงนั้น (จาก Discord หรือ Dashboard) ทุกเพลงต้องมี

**Track Resolution** — การแปลงคำค้นหรือ URL เป็นเพลงที่เล่นได้ ค่าเริ่มต้นค้นใน Spotify (ตลาด TH แล้วหาคู่ใน YouTube ด้วย ISRC ก่อน ตามด้วยชื่อเพลง) รองรับ YouTube / YouTube Music, URL ของ playlist และถ้า Spotify แปลงไม่ได้จะถอยไปใช้ oEmbed

**Music Channel** — ช่องข้อความที่เลือกได้ต่อ **Guild** สำหรับประกาศเพลงที่เล่นและแจ้งการกู้คิว

**Now-Playing Notice** — embed ที่ **Bot** โพสต์ตอนเพลงเริ่ม และจะไม่โพสต์ในกรณีที่สเปกระบุ (เพลงแรกของ `/play`, skipplay, play-next ที่เล่นทันที, เพลงวนซ้ำ, เพลงที่สั่งจาก terminal)

## คนและสิทธิ์

**View Permission** — สมาชิกทุกคนใน **Guild** ดู **Player State** ของ guild นั้นได้

**Control Permission** — สิทธิ์เปลี่ยนการเล่น ตรวจที่ฝั่ง server ตามลำดับนี้ **Server Owner** → **Bot Owner** → (ไม่มี Player: สมาชิกที่อยู่ห้องเสียงใดก็ได้) → (มี Player แล้ว: สมาชิกที่อยู่ห้องเสียงเดียวกับ Bot) และแสดงข้อความเหตุผลให้ผู้ใช้เห็น

**Server Owner** — เจ้าของ guild ใน Discord **Bot Owner** — คนที่เชิญ Bot เข้ามา (ดูจาก audit log) เก็บไว้ในค่าตั้งของ guild ถ้าหาไม่เจอใช้ Server Owner แทน

**Admin / Developer** — บทบาทใน dashboard ที่มาจาก **Admin Whitelist** (อยู่ใน Supabase ใช้ Discord ID เป็นคีย์) และ **Backend** เป็นตัวบังคับ ทั้งสองบทบาทเข้าส่วน Admin ได้ แต่มีแค่ Developer ที่จัดการ whitelist ได้

## ประวัติ

**Listening Session** — มีหนึ่งตัวต่อ **Guild** เริ่มที่เพลงแรกและจบเมื่อ Bot ออกจากห้องเสียง เก็บทุกเพลงที่เริ่มเล่นและผู้ร่วมฟังทุกคน event ของ session ส่งถึงเฉพาะคนที่ร่วมฟัง

**Play History** — ยอดรวมการเล่นที่ใช้ id จาก `title+author` ที่ normalise แล้ว แยกเป็นราย guild-user, รายผู้ใช้ และราย guild ใช้ทำรายการเพลงที่เล่นบ่อย

**Like** — การที่ผู้ใช้กดถูกใจเพลง เพลงที่ถูกใจรวมเป็น playlist Liked ของผู้ใช้คนนั้น

## ใช้ข้ามส่วน

**Hot Cache** — cache สำหรับอ่านสองชั้น ชั้นแรกเป็น LRU ใน process ของ **Backend** ชั้นถัดไปเป็น Redis เก็บ snapshot ของ **Player State**, ผลค้นหา และ metadata ตาม TTL ในสเปก ไม่ใช่แหล่งข้อมูลจริง

**Bot Avatar** — ตัวละครขนนุ่มประจำแต่ละ Guild (`bot-avatars`) สถานะของมันตามสถานะ **Player** (`working` กำลังเล่น · `default` ว่าง · `sleeping` ออฟไลน์) ชุดที่ใส่เป็นค่าตั้งของ guild

**Voice Command** — คำสั่งพูดที่ **Dashboard** รับมา (Web Speech API, `th-TH`/`en-US`) แล้ว map ไปเป็นคำสั่ง player ชุดเดียวกับปุ่ม ไม่ใช่ฟีเจอร์เสียงของ Discord

**Mood** — สีที่ดูดมาจากปกเพลงปัจจุบัน ใช้กับแสง Aurora และสีของ Bot Avatar เท่านั้น

## ความสัมพันธ์

ดูแผนภาพในฝั่งภาษาอังกฤษ: Dashboard คุยกับ Backend ผ่าน REST/Socket.io, Backend คุยกับ Bot ผ่าน Redis pub/sub, Bot คุยกับ Lavalink และทั้ง Backend กับ Bot ใช้ Supabase เป็นแหล่งข้อมูลจริง
<!-- lang:end -->
