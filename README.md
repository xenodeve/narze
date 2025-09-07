
# 🎵 Narze TypeScript Music Bot

บอท Discord สำหรับเล่นเพลงที่ทันสมัย รองรับหลายแพลตฟอร์ม  
พัฒนาโดย [xenodev](https://github.com/xenodeve)

[![GitHub Repository](https://img.shields.io/badge/GitHub-narze-blue?style=for-the-badge&logo=github)](https://github.com/xenodeve/narze)
[![Version](https://img.shields.io/badge/Version-v4-green?style=for-the-badge)](https://github.com/xenodeve/narze/tree/v4)
[![License](https://img.shields.io/badge/License-Custom-orange?style=for-the-badge)](./LICENSE)

---

## 📦 คุณสมบัติหลัก

- ⚡ **เขียนด้วย TypeScript + Bun** สำหรับประสิทธิภาพสูง
- 🗃️ **ใช้ Prisma เป็น ORM** จัดการฐานข้อมูล
- 🎵 **รองรับหลายแพลตฟอร์ม** YouTube, Spotify, SoundCloud
- 🔍 **YouTube Artist Image** ดึงรูปศิลปินแบบอัตโนมัติ
- 📂 **Playlist Metadata System** จัดการข้อมูล playlist ขั้นสูง
- 🎛️ **Terminal Commands** ควบคุมบอทผ่าน terminal
- 🔧 **Config System** ตั้งค่าแบบยืดหยุ่น
- 🎨 **Customizable Embeds** ปรับแต่งสี icon และรูปแบบได้
- 🔄 **24/7 Support** เล่นเพลงต่อเนื่อง
- 🎚️ **Audio Controls** pause, skip, volume, loop, seek  

---

## ⚙️ การติดตั้งและเซ็ตอัป

### 1️⃣ ความต้องการของระบบ

- **Bun Runtime** (แนะนำ v1.0+)
- **Node.js** v18+ (สำหรับ dependencies บางตัว)  
- **Java 17+** (สำหรับ Lavalink server)
- **Database** MongoDB, PostgreSQL หรือ SQLite

### 2️⃣ ติดตั้ง Bun

ถ้ายังไม่มี Bun ติดตั้งในเครื่อง:

```bash
# Windows (PowerShell)
irm bun.sh/install.ps1 | iex

# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

### 3️⃣ โคลนและติดตั้งโปรเจ็ก

```bash
git clone https://github.com/xenodeve/narze.git
cd narze
git checkout v4  # เปลี่ยนไป branch v4 (default)
bun install
```

### 4️⃣ ตั้งค่าไฟล์ Environment

สร้างไฟล์ `.env` ใน root directory:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token

# Database Configuration  
DATABASE_URL="mongodb+srv://<username>:<db_password>@<cluster_name>.<string>.mongodb.net/"
# หรือใช้ SQLite: DATABASE_URL="file:./dev.db"

# Lavalink Configuration
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=123456789

# Spotify Integration (Optional)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

### 5️⃣ ติดตั้งและรัน Lavalink Server

```bash
# ดาวน์โหลด Lavalink JAR file
cd lavalink
# แก้ไข application.yml ตามต้องการ
# รัน Lavalink server
java -jar Lavalink.jar

# หรือใช้ script ที่เตรียมไว้ (Windows)
startlavalink.bat
```

### 6️⃣ เตรียม Database และ Prisma

```bash
# สร้าง Prisma Client
bun prisma generate

# รัน Database Migration (ถ้ามี)
bun prisma db push
```

---

## 🚀 การรันโปรเจ็ก

### โหมดพัฒนา (Development)

```bash
bun run dev
```

### สร้างไฟล์ build (Production)

```bash
bun run build
```

### รัน Production

```bash
bun run start
```

---

## 🎵 คำสั่งเพลงที่รองรับ

| คำสั่ง | รายละเอียด |
|--------|------------|
| `/play` | เล่นเพลงจาก URL หรือค้นหา |
| `/skipplay` | ข้ามเพลงปัจจุบันและเล่นเพลงใหม่ |
| `/pause` | หยุดเพลงชั่วคราว |
| `/skip` | ข้ามไปเพลงถัดไป |
| `/stop` / `/leave` | หยุดเล่นและออกจากห้อง |
| `/volume` | ปรับระดับเสียง (0-100) |
| `/loop` | วนซ้ำเพลง/คิว |
| `/seek` | กรอไปยังเวลาที่ระบุ |
| `/join` | เข้าร่วมห้องเสียง |
| `/247` | โหมดเล่นต่อเนื่อง 24/7 |
| `/clear` | ล้างคิวเพลง |

---

## 🔧 การตั้งค่า Configuration

### ไฟล์ config.json

อยู่ที่ `src/config/config.json` สามารถตั้งค่า:

```json
{
    "lavalink_config": {
        "volume_default": 15,
        "default_image": "https://example.com/default.png"
    },
    "icon_config": {
        "normal_track": "artistImage",
        "playlist_display": "botavatar", 
        "playlist_track": "artistImage"
    },
    "author_url_config": {
        "use_playlist_url": false
    },
    "embed_color": "#e4854a",
    "embed_fail": "#FF0000"
}
```

### Terminal Commands

บอทรองรับการควบคุมผ่าน terminal:

- `help` - แสดงคำสั่งที่ใช้ได้
- `guilds` - แสดงรายการเซิร์ฟเวอร์
- `players` - แสดงสถานะ players
- `stop` - หยุดบอท
- `restart` - รีสตาร์ทบอท

## 📚 เอกสารและคู่มือ

### 📖 คู่มือการใช้งาน
- **[คู่มือการใช้ config.json](./docs/config-guide.md)** - การตั้งค่าพื้นฐานของบอท
- **[Icon Configuration](./docs/icon-configuration.md)** - การตั้งค่า iconURL สำหรับ embed
- **[Author URL Configuration](./docs/author-url-configuration.md)** - การตั้งค่า URL ใน author ของ embed
- **[Terminal Commands](./docs/terminal-commands.md)** - การใช้งานคำสั่ง terminal

### 🎵 ระบบเพลงขั้นสูง
- **[Playlist Metadata System](./docs/playlist-metadata.md)** - ระบบจัดการข้อมูล playlist
- **[YouTube Artist Image](./docs/youtube-artist-image.md)** - การดึงรูปศิลปินจาก YouTube
- **[Spotify Integration](./docs/spotify-integration.md)** - การดึง thumbnail และข้อมูลจาก Spotify

### � การแก้ไขปัญหา
- **[TrackStart Multi-Guild Fix](./docs/TRACKSTART_MULTI_GUILD_FIX.md)** - แก้ไขปัญหาหลายเซิร์ฟเวอร์
- **[SkipPlay Command](./docs/commands/SKIPPLAY_README.md)** - การใช้คำสั่ง skipplay

---

## 🔧 ตัวอย่างการตั้งค่า Lavalink (`application.yml`)

ไฟล์ `lavalink/application.yml` สำหรับ Lavalink server:

```yml
server: # REST and WS server
  port: 2333
  address: 0.0.0.0
  http2:
    enabled: false
lavalink:
  plugins:
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.8.1"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "com.github.topi314.lavasearch:lavasearch-plugin:1.0.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.13.5"
      snapshot: false
  server:
    password: "<your_node_password>"
    sources:
      youtube: false
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      nico: true
      http: true
      spotify: true
    filters:
      volume: true
      equalizer: true
      karaoke: true
      timescale: true
      tremolo: true
      vibrato: true
      distortion: true
      rotation: true
      channelMix: true
      lowPass: true
    bufferDurationMs: 400
    frameBufferDurationMs: 5000
    opusEncodingQuality: 10
    resamplingQuality: LOW
    trackStuckThresholdMs: 10000
    useSeekGhosting: true
    youtubePlaylistLoadLimit: 6
    playerUpdateInterval: 5
    youtubeSearchEnabled: true
    soundcloudSearchEnabled: true
    gc-warnings: true
plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - TVHTML5EMBEDDED
      - TV
      - MUSIC
      - WEB
      - ANDROID
      - ANDROID_MUSIC
      - ANDROID_VR
      - IOS
    ANDROID_MUSIC:
      playlistLoading: false
      videoLoading: true
      searching: true
      playback: true
    MUSIC:
      playlistLoading: false
      videoLoading: true
      searching: true
      playback: false
    WEB:
      playlistLoading: false
      videoLoading: true
      searching: true
      playback: true
    WEBEMBEDDED:
      playlistLoading: false
      videoLoading: false
      searching: false
      playback: true
    TVHTML5EMBEDDED:
      playlistLoading: false
      videoLoading: false
      searching: false
      playback: true
    IOS:
      playlistLoading: false
      videoLoading: true
      searching: true
      playback: false
    oauth:
      enabled: true
      refreshToken: '<your_refresh_token>'
      skipInitialization: false
  lavasrc:
    providers:
      - 'ytsearch:"%ISRC%"'
      - "ytsearch:%QUERY%"
    sources:
      spotify: true
      applemusic: false
      deezer: false
      yandexmusic: false
      flowerytts: false
      youtube: true
    spotify:
      clientId: "<your_client_id>"
      clientSecret: "<your_client_secret>"
      countryCode: "TH"
      playlistLoadLimit: 50
      albumLoadLimit: 50
  dunctebot:
    ttsLanguage: "en-AU"
    sources:
      getyarn: true
      clypit: true
      tts: true
      pornhub: true
      reddit: true
      ocremix: true
      tiktok: true
      mixcloud: true
      soundgasm: true
      pixeldrain: true
metrics:
  prometheus:
    enabled: false
    endpoint: /metrics
sentry:
  dsn: ""
  environment: ""
logging:
  file:
    path: ./logs/
  level:
    root: INFO
    lavalink: INFO
  request:
    enabled: true
    includeClientInfo: true
    includeHeaders: false
    includeQueryString: true
    includePayload: true
    maxPayloadLength: 10000
  logback:
    rollingpolicy:
      max-file-size: 1GB
      max-history: 30
```

> **⚠️ สำคัญสำหรับ Spotify Integration:**
> 1. สร้าง Spotify App ใน [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
> 2. แทนที่ `YOUR_SPOTIFY_CLIENT_ID` และ `YOUR_SPOTIFY_CLIENT_SECRET`
> 3. ดูคู่มือละเอียดใน [Spotify Integration Guide](./docs/spotify-integration.md)

---

## 🛠️ สคริปต์สำคัญ (package.json)

| คำสั่ง | รายละเอียด |
|--------|------------|
| `bun run dev` | รันโค้ดแบบ development (hot-reload) |
| `bun run build` | สร้างไฟล์ build แบบ minify สำหรับ production |
| `bun run start` | รันบอทในโหมด production |
| `bun prisma generate` | สร้าง Prisma client |
| `bun prisma db push` | อัพเดท database schema |

---

## 🏗️ โครงสร้างโปรเจ็ก

```
├── src/
│   ├── commands/           # คำสั่ง Discord slash commands
│   │   ├── ping.ts
│   │   └── lavalink/       # คำสั่งเกี่ยวกับเพลง
│   │       ├── play.ts
│   │       ├── skip.ts
│   │       ├── pause.ts
│   │       └── ...
│   ├── events/             # Event handlers
│   │   ├── ready.ts
│   │   ├── interactionCreate.ts
│   │   └── lavalink/       # Lavalink events
│   ├── functions/          # ฟังก์ชันต่างๆ
│   │   ├── lavalink/       # จัดการ Lavalink
│   │   ├── spotify/        # Spotify integration
│   │   └── youtube/        # YouTube functions
│   ├── handlers/           # System handlers
│   └── config/
│       └── config.json     # ไฟล์ตั้งค่า
├── lavalink/               # Lavalink server files
│   ├── application.yml
│   ├── Lavalink.jar
│   └── plugins/
├── docs/                   # เอกสารประกอบ
└── prisma/                 # Database schema
    └── schema.prisma
```

---

## 🚨 การแก้ไขปัญหาทั่วไป

### ❌ บอทไม่เชื่อมต่อ Discord
```bash
# ตรวจสอบ DISCORD_TOKEN ใน .env
# ตรวจสอบ Intents และ Permissions ของบอท
```

### ❌ Lavalink ไม่เชื่อมต่อ
```bash
# ตรวจสอบว่า Lavalink server รันอยู่
java -jar lavalink/Lavalink.jar

# ตรวจสอบ port และ password ใน .env
```

### ❌ ไม่สามารถเล่นเพลงได้
```bash
# ตรวจสอบ permissions ของบอทในห้องเสียง
# ตรวจสอบ YouTube/Spotify plugins ใน Lavalink
```

### ❌ Database Error
```bash
# รัน Prisma migration
bun prisma db push

# สร้าง client ใหม่
bun prisma generate
```

---

## 📋 TODO และ Roadmap

- [ ] 🎵 เพิ่มการรองรับ Apple Music
- [ ] 🎨 เพิ่มระบบ EQ และ Audio Filters
- [ ] 📊 เพิ่มระบบสถิติและ Analytics
- [ ] 🌐 เพิ่ม Web Dashboard
- [ ] 🔐 เพิ่มระบบ User Permissions
- [ ] 📱 สร้าง Mobile App companion
- [ ] 🤖 เพิ่ม AI Music Recommendations

---

## 📜 License และการใช้งาน

โปรเจ็กนี้เป็น Open Source ภายใต้เงื่อนไข:

* **✅ อนุญาต:** ใช้งานส่วนตัว, ศึกษา, ดัดแปลง
* **❌ ห้าม:** ใช้เชิงพาณิชย์, ขายต่อ, แจกจ่ายแบบไม่ให้เครดิต
* **📝 ข้อกำหนด:** ต้องระบุเครดิตเมื่อนำไปใช้หรือดัดแปลง

---

## 🙌 เครดิตและการสนับสนุน

### 👨‍💻 ผู้พัฒนา
* **หลัก:** [xenodev](https://github.com/xenodeve)
* **ผู้ร่วมพัฒนา:** [ดูรายชื่อใน Contributors](https://github.com/xenodeve/narze/graphs/contributors)

### 🛠️ เทคโนโลยีที่ใช้
* [Bun](https://bun.sh) - JavaScript Runtime
* [Discord.js](https://discord.js.org) - Discord API Library  
* [Prisma](https://prisma.io) - Database ORM
* [Riffy](https://www.npmjs.com/package/riffy) - Lavalink Wrapper
* [Lavalink](https://github.com/lavalink-devs/Lavalink) - Audio Server

### 📞 ติดต่อและสนับสนุน
* 🐛 [รายงานบัค](https://github.com/xenodeve/narze/issues)
* 💡 [เสนอ Feature](https://github.com/xenodeve/narze/issues/new?template=feature_request.md)
* � [GitHub Repository](https://github.com/xenodeve/narze)
* 📧 [ติดต่อผู้พัฒนา](https://github.com/xenodeve)

---

## ⭐ หากโปรเจ็กนี้มีประโยชน์

ถ้าโปรเจ็กนี้ช่วยคุณได้ อย่าลืม:
* ⭐ **ให้ Star** บน GitHub
* 🍴 **Fork** และสร้างสิ่งที่น่าสนใจ
* 🐛 **รายงานบัค** หรือ **เสนอไอเดีย**
* 📢 **แชร์** ให้เพื่อนๆ ได้ใช้

**Happy Coding! 🎵🤖**
