# 🚀 System Architecture & Data Flow: Narze v5

โปรเจกต์นี้แบ่งออกเป็น **2 ส่วนหลัก** ที่ทำงานร่วมกันอย่างใกล้ชิด คือ **Discord Bot (Backend)** และ **Web Dashboard (Frontend)**

ภาพรวมคือ: **Dashboard สั่งงาน ➡ Bot ไปเรียก Discord / Lavalink ➡ Bot ส่งอัปเดตกลับมาที่ Dashboard แบบ Real-Time ผ่าน SSE**

---

## 🏗️ 1. โครงสร้างหลักของระบบ (Architecture)

### 🤖 ฝั่ง Bot (Backend)
- **Engine:** Node.js + TypeScript
- **Discord Lib:** `discord.js` (จัดการ event และคำสั่งใน Discord)
- **Audio/Music:** `riffy` (Lavalink wrapper) ทำหน้าที่สื่อสารกับ Lavalink Server เพื่อเล่นเพลง (รองรับ YouTube, Spotify, SoundCloud ฯลฯ)
- **API Server:** `express` เป็น REST API ให้ Dashboard เรียกใช้คำสั่งต่างๆ (Play, Pause, Skip, Volume)
- **Real-Time API:** `SSE (Server-Sent Events)` ใช้ส่งข้อมูลกลับไปหน้าเว็บทันทีเมื่อมีอะไรเปลี่ยนแปลง (เช่น เพลงเปลี่ยน, คิวเปลี่ยน)
- **Database:** `MongoDB` (เก็บคิวเพลง, ประวัติการเล่น, ข้อมูล metadata ของเพลง)
- **Firebase:** บันทึกประวัติการใช้แบบ Time-series
- **Spotify API:** ใช้ดึงรูป Album Art และค้นหาเพลง

### 💻 ฝั่ง Dashboard (Frontend)
- **Framework:** Next.js (React) + TypeScript
- **Styling:** Tailwind CSS + Shadcn UI (Component library)
- **State Management:** `Zustand` (เก็บ Global State เช่น สถานะ Bot Online/Offline)
- **Auth:** Firebase Auth (Login ด้วย Google / Discord)
- **Real-Time Client:** ใช้ `EventSource` (hook: `useSSE`, `useUserSSE`) เพื่อรับข้อมูลสดๆ จาก Bot
- **API Communication:** เรียก API ไปที่ฝั่ง Bot โดยตรง

---

## 🔄 2. Data Flow (การไหลของข้อมูลและการทำงาน)

### 📌 Flow 1: การสั่งเล่นเพลงผ่าน Dashboard

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant BotAPI as Bot (Express API)
    participant Lava as Lavalink
    participant SSE as SSE Stream

    User->>Dashboard: พิมพ์ค้นหาเพลง
    Dashboard->>BotAPI: POST /api/search
    BotAPI->>Lava: ค้นหาเพลงจาก Source
    Lava-->>BotAPI: ส่งผลลัพธ์กลับ
    BotAPI-->>Dashboard: แจ้งผลลัพธ์ (JSON)
    
    User->>Dashboard: กดปุ่ม Play
    Dashboard->>BotAPI: POST /api/player/play
    BotAPI->>Lava: สั่ง Allocate node & เล่นเพลง
    BotAPI->>MongoDB: บันทึกคิว (Backup)
    BotAPI->>SSE: Broadcast "trackStart"
    SSE-->>Dashboard: แจ้งเตือนแบบ Real-time
    Dashboard-->>User: UI อัปเดตเพลงกำลังเล่น (ไม่หน้ากระตุก)
```

### 📌 Flow 2: ระบบ Real-Time (Server-Sent Events - SSE)

```mermaid
sequenceDiagram
    participant Dashboard
    participant BotAPI as Bot (Express API)
    participant Discord as Discord Server
    
    Dashboard->>BotAPI: GET /api/guild/{id}/stream
    Note over BotAPI: จับ Connection ใส่ Map cache (sseClients)
    BotAPI-->>Dashboard: เปิด Connection ค้างไว้ (200 OK)
    
    Discord->>BotAPI: แจ้งเตือน: มีคนกดข้ามเพลง (trackEnd)
    BotAPI->>BotAPI: ตรวจสอบ Map cache
    BotAPI->>Dashboard: ส่ง Data ผ่าน Stream: {event: "queueUpdate", data: ...}
    Dashboard->>Dashboard: useSSE.ts รับข้อมูล
    Dashboard->>Dashboard: Zustand/React State อัปเดต
    Note over Dashboard: เพลงถัดไปแสดงขึ้นจอทันที
```

### 📌 Flow 3: การจัดการคิวและซิงก์ข้อมูล (Queue System)

```mermaid
flowchart TD
    A["User เพิ่มเพลง"] --> B["Riffy/Lavalink Memory"]
    B --> C["MongoDB SavedQueue"]
    A --> D{"Revision Tracking"}
    D --> |+1| E("ส่ง queueRevision ผ่าน API/SSE")
    E --> F["Dashboard รับ SSE"]
    F --> G{"revision ตรงกันไหม?"}
    G -->|"ตรง"| H["หน้าจออัปเดต"]
    G -->|"ไม่ตรง"| I["ร้องขอเส้นเต็ม: GET /api/guild/id/queue"]
    I --> H
```

### 📌 Flow 4: การทำงานของ Bot Status & Error Handling (Reconnect)

```mermaid
stateDiagram-v2
    [*] --> Online: เชื่อมต่อ SSE สำเร็จ
    Online --> Offline: SSE หลุด / Bot ปิด / Lavalink ล่ม
    
    state Offline {
        [*] --> Reconnecting
        Reconnecting --> LavalinkConnect: พยายามต่อ Lavalink เรื่อยๆ
        LavalinkConnect --> CheckMode: เช็ค .env
        CheckMode --> Unlimited: LAVALINK_RECONNECT_MODE=unlimited
        Unlimited --> Reconnecting: ลูปไปเรื่อยๆ
        CheckMode --> Limited: LAVALINK_RECONNECT_MODE=limited
        Limited --> CheckLimit: ครบโควต้า LAVALINK_RECONNECT_TRIES ใช่มั้ย?
        CheckLimit --> Reconnecting: ยังไม่ครบ
        CheckLimit --> MaxReached: ครบแล้ว
        MaxReached --> ReconnectCommand: รอ User พิมพ์ 'reconnect' ใน Terminal
    }
    
    ReconnectCommand --> Online: เชื่อมต่อใหม่สำเร็จ
```

### 📌 Flow 5: ระบบ 🔍 Search & Music Providers (Spotify, YouTube, SoundCloud)

ระบบค้นหาของ Narze V5 มีความซับซ้อนเพราะทำงานแบบผสมผสาน (Hybrid) โดยรวมผลลัพธ์จากหลาย API เพื่อให้ประสบการณ์เทียบเท่า Music Streaming App

```mermaid
sequenceDiagram
    participant User
    participant BotAPI as Bot API
    participant Cache as SearchResultCache
    participant Spotify as Spotify Web API
    participant LavaSearch as Lavalink (LavaSrc + YouTube)

    User->>BotAPI: ค้นหาเพลง "รสชาติชีวิต" (source: spotify-api)
    BotAPI->>Cache: เช็ค Cache (1 ชม.)
    
    alt มีข้อมูลใน Cache
        Cache-->>BotAPI: คืนค่าข้อมูลเก่า
    else ไม่มีใน Cache (Miss)
        BotAPI->>Spotify: ค้นหา Tracks, Artists, Albums
        Spotify-->>BotAPI: ส่ง Metadata กลับมา
        BotAPI->>Cache: บันทึกลง Memory
    end
    
    BotAPI-->>User: คืนค่าให้ Dashboard แสดงผล
    
    Note over User,BotAPI: เมื่อ User กด Play เพลงจาก Spotify
    User->>BotAPI: ส่ง Spotify URI (spotify:track:xxx)
    BotAPI->>LavaSearch: สั่ง Resolve เพลง
    Note over LavaSearch: Lavalink จะใช้ LavaSrc plugin<br/>ดึง Metadata จาก Spotify<br/>แล้วไปหาวิดีโอเสียงบน YouTube<br/>มาสตรีมให้ฟัง
    LavaSearch-->>BotAPI: พร้อมเล่น
```

### 📌 Flow 6: ระบบ Admin Panel & History Tracking

```mermaid
flowchart LR
    A["Bot เล่นเพลงจบ"] --> B["บันทึกประวัติลง MongoDB"]
    A --> C["บันทึกลง Firebase Time-series"]
    D["Admin เข้า Dashboard"] --> E["GET /api/admin/stats"]
    E --> F{"ดึงข้อมูลจาก"}
    F --> G["MongoDB (Play History, Popularity)"]
    F --> H["Memory (Active Sessions / Players)"]
    G --> I["Dashboard แสดง Charts & Stats"]
    H --> I
    I --> J["Admin สั่ง Restart / Shutdown ถ้าระบบค้าง"]
```

### 📌 Flow 7: 💻 Narze Terminal (CLI)

บอทมีหน้าต่าง Console ให้ Admin คุมผ่าน Server โดยตรง ไม่ต้องผ่าน Discord หรือ Web

```mermaid
stateDiagram-v2
    [*] --> TerminalRunning: บอทสตาร์ทเสร็จ
    
    state TerminalRunning {
        WaitInput: รอคำสั่งที่ stdin
        WaitInput --> Command: User พิมพ์คำสั่ง
        
        state Command {
            help --> แสดงคำสั่งทั้งหมด
            status --> ดึงข้อมูลจาก Lavalink.NodeMap --> แสดง Online/Offline/Uptime
            players --> ดึงข้อมูลจาก client.manager.players --> แสดงจำนวนห้องที่กำลังเล่น
            reconnect --> สั่ง node.connect() ใหม่ทุก node ที่หลุด
        }
        Command --> WaitInput
    }
    ReconnectCommand --> Online: เชื่อมต่อใหม่สำเร็จ
```

### 📌 Flow 8: ระบบ 💬 ดูประวัติแชท (Chat History) ผ่าน Admin Panel

ระบบนี้ไม่ได้ดักฟังและเก็บข้อความลง Database (เพื่อความเป็นส่วนตัวและประหยัดพื้นที่) แต่ใช้วิธี **ดึงข้อมูลสด (On-demand)** จาก Discord เมื่อ Admin ร้องขอผ่าน Dashboard

```mermaid
sequenceDiagram
    participant Admin as Admin (Dashboard)
    participant BotAPI as Bot API (/admin/...)
    participant Discord as Discord Server

    Admin->>BotAPI: เลือกเซิร์ฟเวอร์ & ช่องแชทที่ต้องการดู
    BotAPI->>BotAPI: GET /api/admin/guild/:id/messages/:channelId
    
    Note over BotAPI: Bot ตรวจสอบสิทธิ์ว่าแชทนี้เป็น<br/>Text Channel หรือ Thread
    
    BotAPI->>Discord: ขอข้อความย้อนหลัง (channel.messages.fetch)
    Discord-->>BotAPI: ส่งข้อมูลเนื้อหาแชท, รูปภาพ, วิดีโอ, Embeds
    
    Note over BotAPI: Parser ทำการแปลงข้อมูลให้หน้าเว็บอ่านง่าย:<br/>- หา Users ที่ถูก กล่าวถึง (Mentions)<br/>- แยกประเภทไฟล์แนบ (Images/Videos/Docs)<br/>- ดึงข้อมูลข้อความที่ Reply (อ้างอิง)
    
    BotAPI-->>Admin: ส่ง JSON ข้อมูลแชทที่ประมวลผลแล้ว
    Note over Admin: Admin Panel แสดงผลแชท<br/>ดีไซน์คล้ายหน้าจอ Discord ย่อส่วน
```

### 📌 Flow 9: ระบบ 🟢 อัปเดตสถานะบอทในหน้าเลือก Server (User SSE / Dashboard Presence)

เมื่อ User ล็อกอินหน้า Dashboard แล้วอยู่ในหน้า Home (หน้าเลือก Server) ระบบจะแสดง "จำนวนคิวปัจจุบัน" และ "สถานะกำลังเล่น" ของเซิร์ฟเวอร์ที่ User คนนั้นๆ อยู่แบบ **Realtime** ทันที ไม่ต้องกด Refresh

```mermaid
sequenceDiagram
    participant User as User (Dashboard Home)
    participant UserSSE as User SSE Channel
    participant Lavalink as Lavalink Event
    participant Manager as SSE Manager (userSseClients)

    User->>Manager: subscribe /api/user/:userId/events
    Manager-->>UserSSE: เปิดการเชื่อมต่อ SSE ผูกกับ User ID
    
    Note over Manager,UserSSE: Bot จะเช็คว่า User คนนี้อยู่ในเซิร์ฟเวอร์ไหนบ้าง<br/>และทำการ Subscribe (userGuildSubscriptions)

    Lavalink->>Manager: Event เพลงเริ่มเล่น (trackStart) หรือ เพิ่มคิว (queueUpdate)
    
    Note over Manager: ตรวจสอบว่ามี User ไหนกำลัง Subscribe หน้า Home<br/>ของเซิร์ฟเวอร์ที่เกิด Event อยู่บ้าง
    
    Manager->>UserSSE: ส่งข้อมูล broadcastGuildUpdateToUsers<br/>(isPlaying: true, queueLength: 5)
    
    UserSSE-->>User: Dashboard อัปเดต UI ทันที<br/>เช่น หน้าปกเพลงหมุน, จำนวนคิวเด้งเปลี่ยน
```

### 📌 Flow 10: ระบบ 🔀 จัดการคิว (Queue Management)

ระบบอำนวยความสะดวกในการจัดคิว เช่น สลับคิว, ลบคิว, ล้างคิว, สุ่มคิว (Shuffle) ผ่านหน้า Dashboard แบบลื่นไหลด้วย SSE
- **สลับลำดับ (Reorder/Move):** User ลากเพลงบนเว็บ (Drag & Drop) -> ส่งข้อมูลต้นทางปลายทางไปที่ `/api/queue/:id/move` -> Bot ย้ายข้อมูลใน Array `player.queue` -> ส่ง SSE แจ้งทุกคนในห้อง
- **ลบเพลง (Remove):** กดยกเลิกเพลง -> ไปที่ `/api/queue/:id/remove/:index` -> `player.queue.splice(index, 1)` -> ยิง SSE แจ้งอัปเดต
- **ล้างคิว (Clear):** `/api/queue/:id/clear` -> ลบ Array คิวทั้งหมดทิ้ง -> ยิง SSE
- **สุ่มคิว (Shuffle):** สุ่มสลับ Index ใน Array -> ยิง SSE

ทุกคำสั่งจะส่งผลให้ `player.queue` บน Lavalink Client ถูกแก้ไขทันทีแบบชั่วคราว (Memory) และยิง Event `queueUpdate` ให้ซิงก์กลับไปยังทุกหน้าจอ

### 📌 Flow 11: ระบบ 🎶 นำเข้าและโหลด Playlist (Spotify, YouTube)

Narze V5 สามารถค้นหา URL Playlist ของ Spotify หรือ YouTube และดึงมาเก็บไว้เปิดฟังส่วนตัวได้แบบฉับไว
1. **Fetch:** Dashboard ยิง URL Playlist มาที่ `/api/playlist/fetch`
2. **Resolve:** Lavalink Manager ใช้ "LavaSrc" (ปลั๊กอินพิเศษ) เพื่อแยกเพลงใน Playlist ออกมา หากเป็น Spotify จะไปดึงประวัติและหน้าปกจาก Spotify Web API เพิ่มเติม
3. **Save:** เมื่อกดบันทึก ข้อมูล Playlist จะถูกเก็บลงในเซิร์ฟเวอร์ฐานข้อมูล **Firebase Firestore** เพื่อให้เป็นบัญชีส่วนตัว
4. **Load:** เมื่อกดเล่น Playlist ระบบจะแปลงข้อมูล Track เป็น Array ยิงเข้า `/api/queue/:id/add-playlist` เพื่อเติมเพลงเข้าคิว Bot โดยเร็วที่สุดและเล่นทันที

### 📌 Flow 12: ระบบ ⚙️ ตั้งค่าห้องแชทสำหรับส่งการแจ้งเตือน (Notifications)

สามารถกำหนดให้ Bot ตอบสนองหรือปักหมุดตัวเองอยู่ใน Text Channel เดียวได้ เพื่อความสะอาดของ Server (ลดสแปมคำสั่ง)
- **Flow:** Admin หรือ เจ้าของเซิร์ฟเวอร์เปลี่ยนหมวดหมู่ช่องแชทบนโหมดตั้งค่า -> API เซฟข้อมูลลง **MongoDB** คอลเลกชัน `guild_settings`
- จากนั้น Bot จะยิง SSE ส่ง Event คลาส `settingsUpdate` กลับมา ทำให้ทุกคนในห้องเห็นการเปลี่ยนแปลงของ Text Channel ทันที (หากมีการเล่นเพลง Bot จะไม่ไปสร้าง Embed รบกวนห้องแชทอื่นๆ อีก)

### 📌 Flow 13: ระบบ 📊 แสดงสถานะ Server สด ใน Admin Panel

หน้าตักของผู้ดูแลระบบที่ดึงข้อมูลประมวลผลเซิร์ฟเวอร์ด้วยความเร็วระดับ Hardware-level (OS)
- **ดึงข้อมูล (Stats):** `/api/admin/stats` โดย Bot ขอข้อมูล `os.cpus()`, `os.totalmem()`, และขนาดของ Cache Directory แบบสดๆ 
- **ระบบ SSE พิเศษ (Logging & User Status):**
  - Bot แอบดักการทำงานของฟังก์ชันยอดฮิต (`console.log`, `console.warn`) ทั้งหมด แล้วเก็บเข้าคิว Buffer ส่งผ่าน SSE `/api/admin/logs/events` ทะลุหน้าเว็บให้ Admin ดูทันที ไม่ต้อง SSH เข้าเซิร์ฟเวอร์
  - คอยตรวจสอบ User Active Sessions ที่กำลังเชื่อมต่อ และรายงานตรงขึ้นไปให้ Admin เห็น (Presence) ผ่านระบบ ListeningSessionManager

### 📌 Flow 14: ระบบ 👑 จำกัดสิทธิ์ Role Admin & Developer

ระบบความปลอดภัยป้องกันไม่ให้ User ทั่วไปสั่งการระบบหลัก หรือ Restart บอทได้
1. **Check Role:** ตรวจสอบรหัส Discord ID ภายใน Config Environment ([.env](file:///c:/Github/narze%20v5%20beta/narze%20v5.0.2/bot/.env) ของฝั่ง Dashboard / API)
2. **Gateway:** เมนู "จัดการเซิร์ฟเวอร์ (Admin Panel)" จะเรนเดอร์ให้เฉพาะ Discord ID ที่มีสิทธิ์ตามระบบเท่านั้น
3. **Backend Middleware:** ทุกๆ API Endpoint ของผู้ดูแลระบบ (เช่น `/restart` หรือ `/shutdown`) จะตรวจสอบ Discord Session (ว่าตรงกับ Token ที่เก็บสิทธิ์ Dev/Admin ไหม) หากฝืนยิง API จะถูกดักด้วย `401 Unauthorized` เสมอ

```mermaid
flowchart TD
    User["User (Discord Login)"] --> CheckID{"Discord ID ตรงกับ Admin/Dev ไหม?"}
    CheckID -- "ใช่" --> ShowAdminButton["แสดงปุ่มเข้า Admin Panel"]
    CheckID -- "ไม่ใช่" --> HideAdminButton["ซ่อนปุ่ม Admin Panel"]
    
    ShowAdminButton --> RequestAdminData["กดเรียก API /admin/stats"]
    RequestAdminData --> APIMiddleware{"Middleware ตรวจสอบ Session"}
    APIMiddleware -- "สิทธิ์ถูกต้อง" --> ReturnData["ส่งข้อมูล System Stats"]
    APIMiddleware -- "สิทธิ์ไม่ถูกต้อง / ข้ามเข้ามายิง" --> Forbidden["เตะกลับ 401 Forbidden"]
```

### 📌 Flow 15: ระบบ 🖥️ แสดง Terminal Bot ในหน้า Admin Panel

แทนที่จะต้องเปิด SSH เข้าไปดูหน้าจอบน Server โดยตรง Narze V5 ได้พัฒนาระบบที่จับข้อความ (Intercept) จากการทำงานของหลังบ้านมาวาดบนหน้าเว็บ Dashboard เสมือนหน้าจอ Terminal ของจริง

```mermaid
sequenceDiagram
    participant Bot as Bot Source Code
    participant Logger as Interceptor (console.log)
    participant Buffer as Memory Array (adminLogs)
    participant SSE as API (/api/admin/logs/events)
    participant Admin as Admin Panel (Terminal UI)

    Note over Bot,Logger: เมื่อใดก็ตามที่โค้ดสั่ง console.log(), .warn()
    Bot->>Logger: console.log("[API] บอทเล่นเพลง...")
    
    Logger->>Logger: 1. พิมพ์ออกหน้าจอ Server จริง (STDOUT)<br/>2. จัดฟอร์แมตข้อความ (Timestamp, Level)
    Logger->>Buffer: Push ข้อความเข้า Array (จำกัด 1,000 บรรทัด)
    
    Note over Admin,SSE: เมื่อ Admin เปิดหน้าเว็บขึ้นมา
    Admin->>SSE: Subscribe ขอรับข้อมูล Log แบบสด
    SSE-->>Admin: ส่ง History 100 บรรทัดล่าสุดไปให้วาดหน้าจอทันที
    
    Logger->>SSE: มี Log ใหม่เข้ามา
    SSE-->>Admin: ยิง Log ใหม่ผ่านท่อ SSE ไปแสดงบรรทัดถัดไปแบบ Realtime
```

- **จุดเด่น:** สามารถดักจับสี (Color Formatter) และ Error Level ต่างๆ เพื่อสร้างกล่องข้อความที่มีโค้ดสีต่างกันบนหน้าเว็บได้ (เช่น แดง=Error, เหลือง=Warning) และประหยัดทรัพยากรเพราะไม่ได้เซฟลง Database

### 📌 Flow 16: ระบบ 🔑 Login ด้วย Discord (OAuth2 + Firebase Auth)

Narze V5 ใช้ระบบ **Discord OAuth2** เพื่อดึงข้อมูลเซิร์ฟเวอร์ที่ผู้ใช้อยู่ (Guilds) ร่วมกับ **Firebase Authentication** เพื่อจัดการ Session และสร้างฐานบัญชีผู้ใช้ (ใช้สถาปัตยกรรมแบบ Custom Token)

```mermaid
sequenceDiagram
    participant User as User (Browser)
    participant NextJS as Dashboard (Next.js API)
    participant Discord as Discord OAuth2 API
    participant Firebase as Firebase Auth / Firestore

    User->>NextJS: กดปุ่ม "Login with Discord"
    NextJS-->>User: Redirect ไปหน้าเว็บ Discord ยืนยันสิทธิ์
    
    User->>Discord: กดยืนยัน (Authorize)
    Discord-->>NextJS: ส่ง Authorization Code กลับไปที่ /api/auth/discord/callback
    
    Note over NextJS: API ของ Dashboard เอา Code ไปแลกเป็น<br/>Access Token & Refresh Token จาก Discord
    NextJS->>Discord: ขอข้อมูล User Profile (id, username, avatar)
    Discord-->>NextJS: ข้อมูลส่วนตัว Discord
    
    NextJS->>Firebase: ใช้ Admin SDK อัปเดตข้อมูลผู้ใช้ใน Firestore และสร้าง Firebase Custom Token
    Firebase-->>NextJS: ส่ง Custom Token กลับมา
    
    NextJS-->>User: บันทึก Token ลง Cookie & ส่ง Custom Token ไปหน้า Frontend
    
    Note over User,Firebase: Frontend เอา Custom Token<br/>ไป signInWithCustomToken() เพื่อล็อกอินเข้า Firebase
    User->>NextJS: หน้าเว็บเปลี่ยนเป็น "เข้าสู่ระบบสำเร็จ" พร้อมแสดงข้อมูลผู้ใช้
```

- **จุดเด่น:** 
  - การใช้ Firebase คู่กันทำให้ระบบไม่ต้องสร้าง Database เขียน Session Login เองแบบดั้งเดิม (JWT Custom) 
  - จัดการข้อมูล Firebase (เช่น Playlists หรือ ประวัติฟังเพลง) ผ่าน Firebase Client SDK บนฝั่ง Frontend ได้อย่างปลอดภัยทันที

### 📌 Flow 17: ระบบ 🎤 Voice State Permission (จัดการสิทธิ์อัตโนมัติตามห้อง Voice)

เมื่อ User เข้า/ออกห้อง Voice Channel ระบบจะตรวจสอบอัตโนมัติว่า User อยู่ห้องเดียวกับบอทหรือไม่ แล้วส่ง SSE แจ้ง Dashboard ทันทีเพื่ออัปเดตปุ่มควบคุม (แสดง/ซ่อน)

```mermaid
sequenceDiagram
    participant User as User (Discord)
    participant Bot as Bot (voiceStateUpdate)
    participant Checker as Permission Checker
    participant SSE as SSE Broadcast

    User->>Bot: เข้าห้อง Voice Channel ของบอท
    Bot->>Checker: ตรวจสอบว่า User อยู่ห้องเดียวกับ Bot ไหม
    Checker-->>Bot: canControl: true
    Bot->>SSE: broadcast permissionUpdate
    SSE-->>User: Dashboard แสดงปุ่มควบคุมเพลง

    User->>Bot: ออกจากห้อง Voice Channel
    Bot->>Checker: ตรวจสอบสิทธิ์ใหม่
    Checker-->>Bot: canControl: false
    Bot->>SSE: broadcast permissionUpdate
    SSE-->>User: Dashboard ซ่อนปุ่มควบคุม
```

- **จุดเด่น:** ระบบยังรองรับกรณีที่บอทถูกย้ายห้อง (Bot Moving) โดยจะทำ Batch Permission Update ให้ User ทุกคนในทั้งห้องเก่าและห้องใหม่พร้อมกัน

---

## 📂 3. อธิบายโครงสร้างโฟลเดอร์แบบสรุป

### `/bot/src/` (ใจกลางสมอง Bot)
- **`index.ts`** : จุดเริ่มต้น โหลด config, โหลด Discord Client, สร้าง API Server, เริ่ม Terminal
- **`api/`** : Express server ที่หน้าเว็บยิงมาคุย มีระบบ SSE Stream และ routing
- **`commands/`** : คำสั่ง Slash Command ของ Discord (/play, /skip)
- **`events/`** : ตัวดักจับเวลามีอะไรเกิดขึ้น เช่น มีคนเข้าห้อง (`voiceStateUpdate`), Lavalink เล่นเพลงจบ (`trackEnd`)
- **`functions/`** : โค้ดรวมของระบบสำคัญๆ เช่น `lavalink/manager.ts`, `terminal.ts`
- **`models/`** : โครงสร้าง MongoDB (Mongoose Schema)
- **`lib/`** : Utils ต่างๆ เช่น Firebase, Custom Logger, Formatter

### `/dashboard/` (ฝั่งหน้าบ้าน)
- **`app/`** : โครงสร้างหน้าเว็บแบบ App Router ของ Next.js
- **`components/`** : ชิ้นส่วน UI (ปุ่ม, แถบ Queue, แถบเวลา, ช่องค้นหา) สร้างมาจาก Shadcn UI
- **`hooks/`** : React Hooks สำคัญมาก โดยเฉพาะ `useSSE.ts` (รับ stream จากบอท) และ `useBotStatus.ts`
- **`lib/`** : Zustand Stores (เก็บ State กลาง), Fetcher helpers

---

## 🏁 บทสรุป

**Narze V5** เป็นแอปเพลงที่ "Hybrid" คือสามารถพิมพ์ `/play` ลงใน Discord แชทก็ได้ หรือเปิดเว็บ **Dashboard** เข้าไปกดสั่งงานผ่าน GUI ล้ำๆ ก็ได้ โดยไม่ว่าจะสั่งจากทางไหน **หน้าจอเว็บก็จะอัปเดตและเคลื่อนไหวตามกันไปพร้อมๆ กันแบบเสี้ยววินาทีผ่านทางเทคโนโลยี SSE** ครับ
