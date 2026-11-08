# ADR-0005: Supabase Auth with Discord; the Backend derives identity from a verified session

- **Status:** Accepted — 2026-11-08 (implemented in #99)
- **Area:** backend · dashboard · infra
- **Builds on:** ADR-0001 (Socket.io), ADR-0002 (Redis IPC)

<!-- lang:en -->
## Context

In v5 the caller's identity was self-asserted: the Bot's HTTP API read `req.body.user.discordId` or `?userId=`, skipped the permission check when the field was missing, and allowed the request when the check threw (spec `docs/research/v5-feature-inventory.md` §0 item 3). Firebase custom tokens were minted by the Dashboard, so nothing on the server tied a request to a signed-in Discord user. v7 needs one identity that every Backend decision — Control Permission, admin roles, Presence — can trust.

## Decision

1. **Supabase Auth with the Discord provider** signs users in (PKCE flow, scopes `identify guilds`). The Dashboard opens the provider in a **popup** (`apps/dashboard/src/lib/session.ts:98` `signIn`), opened synchronously in the click so blockers allow it; when it is blocked, the whole page goes to Discord instead. `/auth/callback` exchanges the code, posts `narze:signed-in` to its opener and closes, or goes home when there is no opener.
2. **The Backend verifies every token with Supabase Auth** (`apps/backend/src/auth/authenticator.ts:39` `verify` → `auth.getUser(token)`), not just the JWT signature. Measured on GoTrue v2.192: after `POST /auth/v1/logout`, `/auth/v1/user` answers `403 session_not_found` for the old token, so Sign Out takes effect at once for every REST call. **A socket is verified at its handshake and again at that token's `exp`** (#142, `UserGateway.renew`): the Backend asks the tab for its current token (`session:token`) and closes the socket unless a valid token for the same user comes back. The signing-out tab re-handshakes as anonymous; a socket opened elsewhere with the revoked token keeps its rooms until that token expires (one JWT lifetime, 1 h by default) — not past it. Socket actions that change playback (#101) verify the token per action.
3. **The Discord ID comes only from `user.identities[provider = discord].id`** (`apps/backend/src/auth/authenticator.ts:17` `discordIdentity`), which Supabase Auth writes from the provider. `user_metadata` is never used for identity: the user can change it with `updateUser`. No endpoint reads a Discord ID from the body or query (`apps/backend/test/me.e2e.test.ts` asserts a foreign ID is ignored).
4. **The guild list is fetched by the Backend** with the Discord token Supabase hands the Dashboard once at sign-in (`POST /api/me/sync`, `apps/backend/src/me/me.controller.ts:38`). The Backend first checks the token belongs to the signed-in user (`GET /users/@me`), then replaces the user's snapshot in `public.user_guilds` in one transaction (`replace_user_guilds`, `apps/backend/src/users/user-store.ts:38`). If Discord refuses the guild list (429, 5xx) the sync answers 502 and the stored snapshot is kept (`apps/backend/src/discord/discord-api.ts:30`). Mutual Guilds are that snapshot intersected with the Bot's guild set in Redis (`RedisKeys.botGuilds`).
5. **Sockets authenticate in the handshake** (`auth.token`); a bad token fails with `connect_error`. A socket with no token stays anonymous and receives only Bot status.
6. **Tests use the real Supabase Auth with a fake Discord.** `supabase/config.toml` reads the provider `url` from the environment; `bun run infra:up` points it at `packages/fake-discord`, so the Playwright suite drives the real PKCE flow, state check and session revocation without Discord credentials.

## Alternatives considered

- **Verify the JWT locally against the JWKS** — no network hop, but a signed-out token stays valid until expiry (1 h), which fails "the Backend refuses the old token".
- **Full-page redirect only** — simpler, but loses the page the user was on; the popup keeps playback UI and socket state intact.
- **A fake GoTrue instead of a fake Discord** — faster to start, but the suite would then test our imitation of Supabase Auth, not Supabase Auth.

## Consequences

- `bun run verify` and `bun run e2e` need Supabase local running (`bun run infra:up`), as they already needed Redis. The T4 gate fails closed without it.
- Each authenticated request costs one round trip to Supabase Auth. A short-lived verification cache is the lever if this shows up in #114's measurements; it would trade revocation latency for it.
- The Discord token is used once at sign-in and not stored; the guild snapshot refreshes only at the next sign-in. Guild changes in between appear in the Bot-side set (Redis) but not in the user's own list. **Server Owner is the exception (#141):** the Bot publishes each guild's owner (`bot:guild-owners`, written on ready, join, leave and `guildUpdate`), and the Backend takes it over the snapshot's `is_owner` in `GuildDirectory.mutual()` and on every `permission()`, so a change of hands applies at once, also on an open socket. A guild the Bot has published no owner for still uses the snapshot. A member removed from a guild keeps reading it until the next sign-in: seeing removals would need the privileged GuildMembers intent.
- Bot Owner (guild settings, #106) is not yet part of the badge; the ladder (`packages/shared/src/guilds.ts:52`) treats it as false until then.
- **Presence assumes one Backend process:** the Backend clears the tab counts on start and orders writes per user in memory. A second instance needs a per-instance count first.
- Only the first page of guilds (Discord's maximum, 200) is fetched.
- A socket's Mutual Guild rooms are fixed at connect; a guild the Bot joins later updates live after the next reconnect.
<!-- lang:end -->

<!-- lang:th -->
## บริบท

ใน v5 ตัวตนของผู้เรียกเป็นสิ่งที่ผู้เรียกบอกเอง HTTP API ของ Bot อ่าน `req.body.user.discordId` หรือ `?userId=` ข้ามการตรวจสิทธิ์ไปเลยถ้าไม่มีฟิลด์นั้น และปล่อยผ่านถ้าการตรวจโยน error (สเปก `docs/research/v5-feature-inventory.md` หมวด 0 ข้อ 3) ส่วน Firebase custom token ก็สร้างโดย Dashboard ฝั่ง server จึงไม่มีอะไรผูกคำขอกับผู้ใช้ Discord ที่ login อยู่จริง v7 ต้องมีตัวตนเดียวที่การตัดสินใจทุกอย่างของ Backend ไว้ใจได้ ทั้ง Control Permission, สิทธิ์ admin และ Presence

## การตัดสินใจ

1. **ใช้ Supabase Auth กับ provider Discord** ในการ login (PKCE, scope `identify guilds`) Dashboard เปิด provider ใน **popup** (`apps/dashboard/src/lib/session.ts:98` `signIn`) โดยเปิดทันทีในจังหวะคลิกเพื่อไม่ให้ตัวบล็อก popup กันไว้ ถ้ายังโดนบล็อกก็พาทั้งหน้าไป Discord แทน หน้า `/auth/callback` แลก code แล้วส่ง `narze:signed-in` ให้หน้าที่เปิดมันแล้วปิดตัวเอง หรือถ้าไม่มีหน้าที่เปิดก็กลับหน้าแรก
2. **Backend ยืนยัน token ทุกครั้งกับ Supabase Auth** (`apps/backend/src/auth/authenticator.ts:39` `verify` → `auth.getUser(token)`) ไม่ได้ดูแค่ลายเซ็นของ JWT วัดกับ GoTrue v2.192 แล้วว่าหลัง `POST /auth/v1/logout` ตัว `/auth/v1/user` ตอบ token เดิมด้วย `403 session_not_found` ดังนั้น Sign Out มีผลทันทีกับทุกคำขอ REST **ส่วน socket ตรวจตอน handshake และตรวจอีกครั้งตอน token นั้นถึง `exp`** (#142, `UserGateway.renew`) ตอนนั้น Backend จะขอ token ปัจจุบันจากแท็บ (`session:token`) และปิด socket ถ้าไม่ได้ token ที่ใช้ได้ของผู้ใช้คนเดิมกลับมา แท็บที่กด sign out จะ handshake ใหม่เป็นแบบไม่ระบุตัวตน ส่วน socket ที่เปิดไว้ที่อื่นด้วย token ที่ถูกถอนแล้วยังอยู่ใน room ได้จนกว่า token นั้นจะหมดอายุ (อายุหนึ่ง JWT ค่าเริ่มต้นคือ 1 ชั่วโมง) แต่ไม่เกินนั้น การสั่งงานที่เปลี่ยนการเล่นผ่าน socket (#101) จะตรวจ token ทุกครั้ง
3. **Discord ID เอามาจาก `user.identities[provider = discord].id` เท่านั้น** (`apps/backend/src/auth/authenticator.ts:17` `discordIdentity`) ซึ่ง Supabase Auth เขียนจากข้อมูลของ provider ห้ามใช้ `user_metadata` เป็นตัวตน เพราะผู้ใช้แก้เองได้ผ่าน `updateUser` และไม่มี endpoint ไหนอ่าน Discord ID จาก body หรือ query (`apps/backend/test/me.e2e.test.ts` ตรวจว่า ID ของคนอื่นถูกเมิน)
4. **Backend เป็นคนดึงรายชื่อ guild** ด้วย Discord token ที่ Supabase ส่งให้ Dashboard ครั้งเดียวตอน login (`POST /api/me/sync`, `apps/backend/src/me/me.controller.ts:38`) Backend ตรวจก่อนว่า token เป็นของผู้ใช้ที่ login อยู่ (`GET /users/@me`) แล้วจึงแทน snapshot ของผู้ใช้ใน `public.user_guilds` ทั้งชุดภายใน transaction เดียว (`replace_user_guilds`, `apps/backend/src/users/user-store.ts:38`) ถ้า Discord ไม่ยอมส่งรายชื่อ guild (429, 5xx) sync จะตอบ 502 และเก็บ snapshot เดิมไว้ (`apps/backend/src/discord/discord-api.ts:30`) Mutual Guild คือ snapshot นี้ตัดกับชุด guild ของ Bot ใน Redis (`RedisKeys.botGuilds`)
5. **socket ยืนยันตัวตนตอน handshake** (`auth.token`) token ที่ไม่ถูกต้องจะได้ `connect_error` ส่วน socket ที่ไม่มี token ยังต่อได้แบบไม่ระบุตัวตน และได้รับแค่สถานะของ Bot
6. **test ใช้ Supabase Auth ตัวจริงคู่กับ Discord ปลอม** `supabase/config.toml` อ่าน `url` ของ provider จาก env และ `bun run infra:up` ชี้ไปที่ `packages/fake-discord` ชุด Playwright จึงวิ่งผ่าน PKCE, การตรวจ state และการถอน session ของจริงได้โดยไม่ต้องมี credential ของ Discord

## ทางเลือกที่พิจารณา

- **ตรวจ JWT เองกับ JWKS** — ไม่ต้องยิง network แต่ token ที่ sign out แล้วยังใช้ได้จนหมดอายุ (1 ชั่วโมง) ซึ่งขัดกับเกณฑ์ "Backend ปฏิเสธ token เก่า"
- **redirect ทั้งหน้าอย่างเดียว** — ง่ายกว่า แต่ผู้ใช้หลุดจากหน้าที่อยู่ ส่วน popup รักษา UI การเล่นและ socket ไว้ได้
- **ทำ GoTrue ปลอมแทน Discord ปลอม** — เริ่มเร็วกว่า แต่ชุด test จะกลายเป็นการทดสอบของเลียนแบบ Supabase Auth ที่เราเขียนเอง ไม่ใช่ Supabase Auth จริง

## ผลที่ตามมา

- `bun run verify` และ `bun run e2e` ต้องมี Supabase local รันอยู่ (`bun run infra:up`) เหมือนที่ต้องมี Redis อยู่แล้ว ถ้าไม่มี gate ของ T4 จะไม่ยอม merge
- ทุกคำขอที่ต้องยืนยันตัวตนเสียหนึ่ง round trip ไปที่ Supabase Auth ถ้าการวัดใน #114 เห็นว่าเป็นปัญหา ทางแก้คือ cache ผลการยืนยันสั้น ๆ แลกกับการถอน token ที่ช้าลง
- Discord token ใช้ครั้งเดียวตอน login และไม่เก็บไว้ snapshot ของ guild จึงอัปเดตตอน login ครั้งถัดไปเท่านั้น guild ที่เปลี่ยนระหว่างนั้นจะเห็นในชุดฝั่ง Bot (Redis) แต่ไม่เห็นในรายการของผู้ใช้เอง **ยกเว้น Server Owner (#141):** Bot publish เจ้าของของแต่ละ guild (`bot:guild-owners` เขียนตอน ready, ตอนเข้า, ตอนออก และตอน `guildUpdate`) แล้ว Backend ใช้ค่านี้แทน `is_owner` จาก snapshot ใน `GuildDirectory.mutual()` และทุกครั้งที่เรียก `permission()` การโอนเจ้าของจึงมีผลทันที แม้ socket จะเปิดค้างอยู่ guild ที่ Bot ยังไม่เคย publish เจ้าของมาให้จะยังใช้ snapshot ส่วนสมาชิกที่ถูกนำออกจาก guild ยังอ่านข้อมูลได้จนกว่าจะ login ครั้งถัดไป เพราะการรู้ว่ามีคนถูกนำออกต้องใช้ GuildMembers intent ซึ่งเป็น intent พิเศษ
- Bot Owner (ตั้งค่า guild ใน #106) ยังไม่ได้อยู่ในป้ายสิทธิ์ ลำดับการตรวจ (`packages/shared/src/guilds.ts:52`) ถือว่าเป็น false ไปก่อน
- **Presence ถือว่ามี Backend อยู่ process เดียว** Backend ล้างตัวนับแท็บตอนเริ่ม และเรียงลำดับการเขียนต่อผู้ใช้ไว้ในหน่วยความจำ ถ้าจะมีหลาย instance ต้องนับแยกต่อ instance ก่อน
- ดึงรายชื่อ guild แค่หน้าแรก (สูงสุดที่ Discord ให้คือ 200)
- room ของ Mutual Guild ใน socket ถูกกำหนดตอนต่อ guild ที่ Bot เพิ่งเข้าจะอัปเดตสดหลังต่อใหม่ครั้งถัดไป
<!-- lang:end -->
