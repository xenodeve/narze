<!-- lang:en -->
# Product — Narze v7

## Purpose

Narze is a self-hosted Discord music bot with a realtime web **Dashboard**. Anything you can do with a slash command you can do from the browser, and every change — from Discord or from any open tab — shows up everywhere within a moment. v7 is a full rewrite that keeps **every capability of v5.0.2** (acceptance list: `docs/research/v5-feature-inventory.md` §11, 123 items) and fixes its known defects (§10), on three separable processes (**Bot**, **Backend**, **Dashboard** — see `CONTEXT.md`).

Success means: a listener can run a whole session from the Dashboard without typing a command; two people in different tabs never see different queues; the Bot keeps playing when the Backend or Dashboard is down.

## Users

- **Listener** — a Guild member. Views any Guild's player; controls it when in the Bot's voice channel (or when nothing is playing and they are in any voice channel).
- **Server Owner / Bot Owner** — control from anywhere; set the Music Channel, 24/7, and the Bot Avatar's outfit.
- **Admin** — system stats, live logs, guilds, read-only channel viewer, users, sessions.
- **Developer** — everything Admin has, plus the Admin Whitelist.

Context of use: listening with friends in Discord, Dashboard open on a second monitor or a phone. Relaxed and social; the tool should never demand attention it hasn't earned.

## What v7 adds beyond v5

Developer-approved on 2026-11-08:

1. **Voice Commands** — speak to the Dashboard ("เล่นเพลง …", "ข้าม", "หยุด", "เสียง 40") through the browser's speech recognition (Chrome/Edge; others see a plain "not supported" state).
2. **Bot Avatar** — a plush character per Guild that mirrors the Player and can be dressed (hat, glasses, headphones, bow tie, colour) in Guild Settings.
3. **Likes** — heart any track; liked tracks become a Liked playlist.
4. **Now-playing notifications** — per-Guild opt-in browser notification when the track changes while the tab is open.
5. **Loop, shuffle, play-next on the web** — the Dashboard reaches parity with the slash commands.
6. **Working charts** — v5's chart block was hardcoded; v7 sources real chart data (provider to be verified before build).
7. **Real security** — server-side identity, Control Permission and admin roles (v5 trusted the browser).

## Brand personality

**Calm, precise, alive.** Swiss-editorial restraint (Strata-xeno) with one warm exception: the Bot Avatar, which gives the product a face. Confident, plain copy — Thai first, English available. Never noisy, never "gamer".

## Anti-references

- Cluttered gaming dashboards and legacy bot panels (Hydra/MEE6): icon rows, neon borders, identical card grids.
- Glassmorphism everywhere (v5's own look).
- Generic dark SaaS with no character.
- Mascots that perform constantly — the avatar reacts to real state, it doesn't dance for attention.

## Design principles

1. **Music is the hero; the avatar is the guide.**
2. **Live means accurate, then animated** — never show a state the server hasn't confirmed for longer than one optimistic beat; motion explains change, it doesn't decorate.
3. **Permission shapes the interface** — say why a control is absent and how to get it.
4. **Fast on a cheap phone** — performance targets in `DESIGN.md` §9 are product requirements.
5. **Works when parts are down** — Bot without Backend, Dashboard read-only when the Bot is offline, page usable without WebGL.

## Accessibility & inclusion

WCAG 2.2 AA; full keyboard control of playback and queue; reduced-motion parity; Thai and English UI with correct Thai typography; voice commands are an addition, never the only path.
<!-- lang:end -->

<!-- lang:th -->
# Product — Narze v7

## จุดประสงค์

Narze คือบอทเพลง Discord ที่ self-host ได้ พร้อม **Dashboard** บนเว็บที่อัปเดตแบบ realtime ทุกอย่างที่ทำได้ด้วย slash command ทำจากเบราว์เซอร์ได้เหมือนกัน และทุกการเปลี่ยนแปลง ไม่ว่าจะมาจาก Discord หรือแท็บไหนที่เปิดอยู่ จะขึ้นทุกที่ภายในไม่กี่อึดใจ v7 คือการเขียนใหม่ทั้งหมด โดยเก็บ **ความสามารถทุกข้อของ v5.0.2** ไว้ (รายการรับงานอยู่ที่ `docs/research/v5-feature-inventory.md` หมวด 11 จำนวน 123 ข้อ) และแก้ข้อบกพร่องที่รู้แล้ว (หมวด 10) บน process สามตัวที่แยกจากกันได้ (**Bot**, **Backend**, **Dashboard** — ดู `CONTEXT.md`)

ความสำเร็จคือ ผู้ฟังคุมทั้ง session จาก Dashboard ได้โดยไม่ต้องพิมพ์คำสั่งเลย คนสองคนที่เปิดคนละแท็บไม่มีวันเห็นคิวไม่ตรงกัน และ Bot ยังเล่นเพลงต่อได้ตอนที่ Backend หรือ Dashboard ล่ม

## ผู้ใช้

- **ผู้ฟัง** — สมาชิกของ Guild ดู player ของ Guild ไหนก็ได้ และควบคุมได้เมื่ออยู่ห้องเสียงเดียวกับ Bot (หรือตอนที่ไม่มีอะไรเล่นอยู่และตัวเองอยู่ในห้องเสียงห้องไหนก็ได้)
- **Server Owner / Bot Owner** — ควบคุมได้จากทุกที่ ตั้ง Music Channel, 24/7 และชุดของ Bot Avatar ได้
- **Admin** — ดูสถิติระบบ, log สด, รายชื่อ guild, ดูข้อความในช่องแบบอ่านอย่างเดียว, ผู้ใช้ และ session
- **Developer** — ทำได้ทุกอย่างที่ Admin ทำได้ บวกการจัดการ Admin Whitelist

บริบทการใช้งาน: ฟังเพลงกับเพื่อนใน Discord เปิด Dashboard ไว้บนจอที่สองหรือบนมือถือ บรรยากาศสบาย ๆ เป็นกันเอง เครื่องมือไม่ควรเรียกร้องความสนใจเกินกว่าที่มันสมควรได้

## สิ่งที่ v7 เพิ่มจาก v5

developer อนุมัติเมื่อ 2026-11-08:

1. **สั่งงานด้วยเสียง** — พูดกับ Dashboard ("เล่นเพลง …", "ข้าม", "หยุด", "เสียง 40") ผ่านระบบรู้จำเสียงของเบราว์เซอร์ (Chrome/Edge ส่วนเบราว์เซอร์อื่นจะเห็นข้อความเรียบ ๆ ว่ายังไม่รองรับ)
2. **Bot Avatar** — ตัวละครขนนุ่มประจำแต่ละ Guild ที่ขยับตามสถานะ Player และแต่งตัวได้ (หมวก, แว่น, หูฟัง, โบว์, สี) ในหน้า Guild Settings
3. **กดถูกใจ** — กดหัวใจให้เพลงไหนก็ได้ เพลงที่ถูกใจรวมเป็น playlist Liked
4. **แจ้งเตือนเพลงที่กำลังเล่น** — เปิดได้ราย Guild เบราว์เซอร์เด้งแจ้งตอนเปลี่ยนเพลงขณะที่แท็บยังเปิดอยู่
5. **วน, สุ่ม, เล่นถัดไปบนเว็บ** — ให้ Dashboard ทำได้ครบเท่ากับ slash command
6. **ชาร์ตที่ใช้ได้จริง** — ชาร์ตของ v5 เป็นข้อมูล hardcode ส่วน v7 ดึงข้อมูลชาร์ตจริง (ต้องตรวจแหล่งข้อมูลก่อนลงมือ)
7. **ความปลอดภัยจริง** — ยืนยันตัวตน, Control Permission และสิทธิ์ admin ที่ฝั่ง server (v5 เชื่อเบราว์เซอร์)

## บุคลิกแบรนด์

**สงบ, แม่นยำ, มีชีวิต** ความเรียบแบบ Swiss-editorial (Strata-xeno) มีข้อยกเว้นอบอุ่นอยู่หนึ่งเดียว คือ Bot Avatar ที่ทำให้ผลิตภัณฑ์มีหน้าตา ข้อความมั่นใจและเรียบง่าย ภาษาไทยเป็นหลัก มีภาษาอังกฤษให้เลือก ไม่หนวกหู และไม่ "เกมเมอร์"

## สิ่งที่ไม่อยากเป็น

- dashboard เกมที่รก และแผงบอทยุคเก่า (Hydra/MEE6): ไอคอนเรียงแถว, ขอบนีออน, การ์ดหน้าตาเหมือนกันเต็มจอ
- glassmorphism ทุกที่ (หน้าตาของ v5 เอง)
- SaaS โทนมืดทั่วไปที่ไม่มีตัวตน
- มาสคอตที่แสดงตลอดเวลา avatar ตอบสนองต่อ state จริง ไม่ได้เต้นเรียกร้องความสนใจ

## หลักการออกแบบ

1. **เพลงคือพระเอก avatar คือคนนำทาง**
2. **live แปลว่าถูกต้องก่อน แล้วค่อยมีการเคลื่อนไหว** ห้ามโชว์ state ที่ server ยังไม่ยืนยันนานเกินหนึ่งจังหวะของการอัปเดตล่วงหน้า การเคลื่อนไหวมีไว้อธิบายการเปลี่ยนแปลง ไม่ได้มีไว้ตกแต่ง
3. **สิทธิ์เป็นตัวกำหนดหน้าตา** บอกว่าทำไมปุ่มนั้นไม่อยู่ และต้องทำยังไงถึงจะได้
4. **เร็วบนมือถือราคาถูก** เป้า performance ใน `DESIGN.md` หมวด 9 คือ requirement ของผลิตภัณฑ์
5. **ใช้ได้แม้บางส่วนล่ม** Bot ทำงานได้โดยไม่มี Backend, Dashboard อ่านได้อย่างเดียวตอน Bot ออฟไลน์ และหน้าเว็บใช้ได้โดยไม่มี WebGL

## การเข้าถึงและความครอบคลุม

WCAG 2.2 AA คุมการเล่นและคิวด้วยคีย์บอร์ดได้ทั้งหมด โหมดลดการเคลื่อนไหวต้องได้ประสบการณ์เท่ากัน UI มีทั้งไทยและอังกฤษพร้อมการจัดตัวอักษรไทยที่ถูกต้อง สั่งงานด้วยเสียงเป็นทางเสริม ไม่ใช่ทางเดียว
<!-- lang:end -->
