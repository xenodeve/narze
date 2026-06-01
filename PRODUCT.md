# Product

## Register

product

## Users

ผู้ใช้งานแบ่งตาม permission 4 ระดับ:

- **User ทั่วไป** — สมาชิก Discord server ที่อยู่ใน Voice Channel เดียวกับบอท สามารถค้นหา, เพิ่มเพลง, จัดการคิว, และดูสถานะการเล่นได้
- **Server Owner** — ตั้งค่า Guild-level settings, กำหนด music channel
- **Admin** — เข้าถึง System Stats, Real-time Logs, ประวัติ, Chat History ผ่าน Admin Panel
- **Developer** — สิทธิ์ทุกอย่าง + จัดการระบบระดับสูง

Context: ใช้งานระหว่างฟังเพลงกับเพื่อนใน Discord, มักเปิดควบคู่ไปกับ Discord บน second monitor หรือแท็บเดียวกัน บรรยากาศ relaxed และ social

## Bot Behavior

- **Queue Recovery**: ก่อน shutdown bot เขียน queue snapshot ลง local JSON file → restart อ่านไฟล์ restore queue → ลบไฟล์
- **Recovery notification**: bot publish `bot:{guildId}:player:recovering` ให้ Dashboard แสดง state → ส่ง message ใน Discord music channel ที่ guild ตั้งค่าไว้ว่ากำลัง recover → publish state ปกติหลัง restore เสร็จ
- **Bot responsibility**: Pure music engine — ทำงานได้สมบูรณ์ทั้งสอง mode
- **Connected mode** (Redis พร้อม): bot รับ settings จาก NestJS ผ่าน Redis, publish events ให้ dashboard sync
- **Standalone mode** (ไม่มี Redis/NestJS): bot ดึง settings จาก Supabase โดยตรง, ทำงานปกติไม่มี dashboard
- **Local cache**: queue snapshot เก็บ local JSON เสมอ ทั้งสอง mode
- **Backend sync**: เมื่อ backend เริ่มรัน ส่ง `backend:request:state:{guildId}` → bot ตอบกลับ state ปัจจุบัน

## Product Purpose

Narze V6 คือ Web Dashboard สำหรับควบคุม Discord Music Bot ที่ self-host ได้ ผู้ใช้สั่งเล่น ค้นหา และจัดการคิวเพลงจาก YouTube, Spotify, SoundCloud ผ่าน UI แทนการพิมพ์คำสั่ง ทุกการเปลี่ยนแปลงจาก Discord หรือ Dashboard ซิงก์กลับแบบ real-time ผ่าน WebSocket

V6 เป็นการ rewrite ใหม่ทั้งหมด โดยแยก 3 layer ออกจากกันอย่างชัดเจน (บทเรียนจาก v5.0.2 ที่รวม bot+backend ทำให้ debug และ maintain ยาก — V6 ออกแบบให้ backend เป็น optional extension ไม่ใช่ส่วนหลักของ bot):
- **Frontend**: Next.js (React + TypeScript + Tailwind)
- **Backend API**: NestJS (Socket.io — commands + state sync, REST — Supabase Auth callbacks only, Redis — bot↔backend IPC + temporary state, Supabase — persistent storage)
- **Bot**: Discord.js + Lavalink

เป้าหมายความสำเร็จ: ผู้ใช้ควบคุมเพลงได้ทั้งหมดผ่าน Dashboard โดยไม่ต้องพิมพ์คำสั่งใน Discord และทุก session ซิงก์กันแบบ real-time

## Brand Personality

**Premium, Alive, Direct**

Tone: มั่นใจ, ไม่ verbose, มีชีวิตชีวาในแบบ Discord culture — ไม่ formal แต่ไม่ childish ดีไซน์รู้สึก dark และ premium เหมือน Spotify แต่มีความ expressive กว่า และ responsive กว่า Linear

อารมณ์ที่ต้องการ: ความรู้สึกว่า "มันทำงานได้เร็ว มันดูดี และฉันอยากใช้มันอยู่" — confidence + delight + clarity

## Anti-references

- **Cluttered gaming dashboards** — สีสันหนัก, ไอคอนทุกที่, ไม่มี hierarchy ชัดเจน
- **Glassmorphism overload** (เช่น v5.0.2 เอง) — blur ทุก surface, border ทุกอย่าง, สูญเสีย focus
- **Generic SaaS dark mode** — dark gray ล้วน, ไม่มี character, รู้สึกเหมือน admin panel ธรรมดา
- **Bot dashboards ยุคเก่า** เช่น Hydra, MEE6 — ดีไซน์ตก, ไม่ real-time, รู้สึกเก่า

## Design Principles

1. **Music is the hero** — Album art, track title, และ playback controls ต้องเห็นได้ชัดและเข้าถึงได้ทันที ไม่มีอะไรมาบดบัง
2. **Real-time หมายถึงมีชีวิต** — UI ต้องสื่อสารว่ากำลัง live อยู่ด้วย motion ที่มีความหมาย ไม่ใช่ static
3. **Permission shapes the interface** — แต่ละ role เห็น UI ที่เหมาะกับสิทธิ์ของตัวเอง ไม่ใช่ซ่อน feature แบบ grey-out
4. **Clarity over decoration** — ทุก element มีหน้าที่ชัดเจน ตัดสิ่งที่ไม่ช่วย decision-making ออก
5. **Dark as a canvas, not a constraint** — darkness ทำให้ album art โดดเด่น, ไม่ใช่แค่ทำให้ดู gamer

## Accessibility & Inclusion

- WCAG AA minimum
- Reduced motion support (animations ต้องมี fallback)
- Keyboard navigation สำหรับ playback controls และ queue management
- Color contrast ≥4.5:1 สำหรับ body text บน dark backgrounds
