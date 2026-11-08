# ADR-0009: Catalog search asks Lavalink's REST API from the Backend

- **Status:** Accepted — 2026-11-08 (implemented in #105)
- **Area:** backend · infra
- **Builds on:** ADR-0002 (Redis IPC), ADR-0003 (Bot two modes), ADR-0006 (Hot Cache)

<!-- lang:en -->
## Context

#105 adds the Dashboard's catalog search (spec #49, #57). Three of its four modes (`spotify`, `youtube`, `youtubemusic`) need Lavalink to resolve the query into tracks. Before this, only the Bot spoke to Lavalink (ADR-0004), and the Backend only reached the Bot through Redis (ADR-0002). A search is a stateless read: no Player, no session, no voice.

## Decision

The Backend calls Lavalink's REST endpoint `GET /v4/loadtracks?identifier=` directly (`apps/backend/src/search/lavalink-rest.ts:16`).
- **Every identifier carries a search prefix** (`apps/backend/src/search/search-service.ts:67`): `spsearch:` then `ytmsearch:` in Spotify mode, `ytsearch:` / `ytmsearch:` for the YouTube modes (`:173`). The node has the HTTP source on, so a bare URL would make it fetch that URL on a user's behalf (SSRF). With a prefix, a pasted link is only search text. Links are played through the Bot, whose `resolveQuery` refuses internal addresses.
- It gets the node's address and password from the environment (`LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`, the same names the Bot uses).
- Without them, searches find no tracks; Spotify Web API results still come back.
- The search service takes `loadTracks` as a dependency (`apps/backend/src/search/search-service.ts`), so the transport can change without touching the catalog (`search-service.ts:166`).

The Bot stays the only owner of Players and sessions (ADR-0003). The Backend never opens Lavalink's websocket and never PATCHes a Player.

## Alternatives considered

- **Ask the Bot over Redis (request/response).** This keeps Lavalink access in one process. But search would stop whenever the Bot is down or restarting, and it needs a correlation channel and timeouts for a read that has no state.
- **Spotify Web API only.** Simpler, but spec #57 requires the YouTube and YouTube Music modes, which only Lavalink resolves.

## Consequences

- The Backend's environment holds the Lavalink password. Treat it like the other server secrets.
- Search keeps working while the Bot restarts, as long as the Lavalink node is up.
- If Lavalink's REST shape changes, both the Bot (through lavalink-client) and `lavalink-rest.ts` must follow.
- Results are cached in the Backend's process with the spec TTLs: Spotify-mode searches 30 min (an empty one never, #59, `search-service.ts:250`), Spotify artist/album pages 7 d, YouTube channel searches 30 min (`:162`) and channel pages 1 h. YouTube track searches are not cached (v5 parity). This covers part of the "search results and metadata" slot ADR-0006 left open; the Redis tier is not used.
<!-- lang:th -->
## บริบท

#105 เพิ่มการค้นหาใน catalog ของ Dashboard (สเปกข้อ #49, #57) สามในสี่โหมด (`spotify`, `youtube`, `youtubemusic`) ต้องใช้ Lavalink แปลงคำค้นเป็นเพลง ก่อนหน้านี้มีแค่ Bot ที่คุยกับ Lavalink (ADR-0004) และ Backend ติดต่อ Bot ได้ทาง Redis อย่างเดียว (ADR-0002) การค้นหาเป็นการอ่านที่ไม่มีสถานะ ไม่มี Player ไม่มี session และไม่มีเสียง

## การตัดสินใจ

Backend เรียก REST endpoint `GET /v4/loadtracks?identifier=` ของ Lavalink เองโดยตรง (`apps/backend/src/search/lavalink-rest.ts:16`)
- **ทุก identifier มีคำนำหน้าการค้นหาเสมอ** (`apps/backend/src/search/search-service.ts:67`): โหมด Spotify ใช้ `spsearch:` ถ้าไม่เจอค่อยใช้ `ytmsearch:` ส่วนโหมด YouTube ใช้ `ytsearch:` / `ytmsearch:` (`:173`) node ของ Lavalink เปิด HTTP source ไว้ ถ้าส่ง URL ไปตรง ๆ node จะไปดึง URL นั้นให้ผู้ใช้ (SSRF) พอมีคำนำหน้า ลิงก์ที่วางมาก็เป็นแค่ข้อความค้นหา การเล่นลิงก์ต้องผ่าน Bot ซึ่ง `resolveQuery` ปฏิเสธที่อยู่ภายในอยู่แล้ว
- ที่อยู่และรหัสผ่านของ node อ่านจาก env (`LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD` ซึ่งเป็นชื่อเดียวกับที่ Bot ใช้)
- ถ้าไม่มีค่าเหล่านี้ การค้นหาจะไม่เจอเพลง แต่ผลจาก Spotify Web API ยังได้ตามปกติ
- search service รับ `loadTracks` เป็น dependency (`apps/backend/src/search/search-service.ts`) จึงเปลี่ยนวิธีส่งได้โดยไม่ต้องแตะตัว catalog (`search-service.ts:166`)

Bot ยังเป็นเจ้าของ Player และ session แต่เพียงผู้เดียว (ADR-0003) Backend ไม่เปิด websocket ของ Lavalink และไม่เคย PATCH Player

## ทางเลือกที่พิจารณา

- **ถาม Bot ผ่าน Redis (ส่งคำขอแล้วรอคำตอบ):** ให้การเข้าถึง Lavalink อยู่ใน process เดียว แต่การค้นหาจะหยุดทุกครั้งที่ Bot ล่มหรือกำลังรีสตาร์ท และต้องมีช่องทางจับคู่คำขอกับคำตอบพร้อม timeout สำหรับการอ่านที่ไม่มีสถานะ
- **ใช้แค่ Spotify Web API:** ง่ายกว่า แต่สเปกข้อ #57 ต้องการโหมด YouTube และ YouTube Music ซึ่งมีแค่ Lavalink ที่แปลงได้

## ผลที่ตามมา

- env ของ Backend เก็บรหัสผ่านของ Lavalink ต้องดูแลเหมือน secret ฝั่ง server ตัวอื่น
- การค้นหายังใช้ได้ระหว่างที่ Bot รีสตาร์ท ตราบใดที่ node ของ Lavalink ยังทำงาน
- ถ้ารูปแบบ REST ของ Lavalink เปลี่ยน ทั้ง Bot (ผ่าน lavalink-client) และ `lavalink-rest.ts` ต้องตามไปแก้
- ผลการค้นหา cache ไว้ใน process ของ Backend ตาม TTL ในสเปก ได้แก่ การค้นหาโหมด Spotify 30 นาที (ผลว่างไม่ cache เลย #59, `search-service.ts:250`), หน้าศิลปินและอัลบั้มของ Spotify 7 วัน, การค้นหาช่อง YouTube 30 นาที (`:162`) และหน้าช่อง 1 ชั่วโมง ส่วนการค้นหาเพลงของ YouTube ไม่ cache (เหมือน v5) งานนี้จึงครอบช่อง "ผลค้นหาและ metadata" ที่ ADR-0006 เว้นไว้แค่บางส่วน และยังไม่ได้ใช้ชั้น Redis
<!-- lang:end -->
