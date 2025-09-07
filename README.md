
# 🎵 music-bot-sinsamuth

บอท Discord สำหรับเล่นเพลง (หรือใช้งานตามที่คุณออกแบบไว้)  
พัฒนาโดย [Khaoseekakun](https://github.com/Khaoseekakun)

---

## 📦 คุณสมบัติ

- เขียนด้วย TypeScript + Bun  
- ใช้ Prisma เป็น ORM  
- เชื่อมต่อกับ Discord ผ่าน [discord.js](https://discord.js.org)  
- จัดการ ENV ด้วย dotenv  

---

## ⚙️ การติดตั้ง

### 1️⃣ ติดตั้ง Bun

ถ้ายังไม่มี Bun ติดตั้งในเครื่อง ให้ทำตาม [คู่มือ Bun](https://bun.sh)  

```bash
curl -fsSL https://bun.sh/install | bash
````

---

### 2️⃣ โคลนโปรเจ็ก

```bash
git clone https://github.com/Khaoseekakun/music-bot-sinsamuth-2025.git
cd music-bot-sinsamuth-2025
```

---

### 3️⃣ ติดตั้ง dependencies

```bash
bun install
```

---

### 4️⃣ ตั้งค่าไฟล์ ENV

สร้างไฟล์ `.env` ใน root (ตัวอย่างตัวแปรที่อาจต้องมี: **TOKEN**, **DATABASE\_URL**)

```env
DISCORD_TOKEN=your_discord_bot_token
DATABASE_URL=your_database_connection_string
```

---

คุณสามารถเพิ่มไฟล์ `application.yml` ที่คุณให้มาใน README ได้โดยใส่ไว้ในหัวข้อใหม่ เช่น `🔧 ตัวอย่างการตั้งค่า Lavalink` หรือ `📄 ตัวอย่างไฟล์ config` แล้วใช้ code block เพื่อแสดง YAML อย่างชัดเจน

นี่คือตัวอย่างที่ปรับให้พร้อมใส่ต่อท้าย README เดิมของคุณ:

---

## 🔧 ตัวอย่างการตั้งค่า Lavalink (`application.yml`)

หากคุณใช้ [Lavalink](https://github.com/lavalink-devs/Lavalink) ร่วมกับบอทนี้ คุณสามารถใช้การตั้งค่าดังต่อไปนี้:

```yml
server: # REST and WS server
  port: 2333
  address: 0.0.0.0
  http2:
    enabled: false
lavalink:
  plugins:
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.7.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "com.github.topi314.lavasearch:lavasearch-plugin:1.0.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.13.2"
      snapshot: false
  server:
    password: "123456789"
    sources:
      youtube: false
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      nico: true
      http: true
      spotify: true     # เปิดใช้งาน Spotify ใน Lavalink server
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
      refreshToken: ''
      skipInitialization: false
  lavasrc:
    providers:
      - 'ytsearch:"%ISRC%"'
      - "ytsearch:%QUERY%"
    sources:
      spotify: true      # เปิดใช้งาน Spotify
      applemusic: false
      deezer: false
      yandexmusic: false
      flowerytts: false
      youtube: true
    spotify:
      clientId: "YOUR_SPOTIFY_CLIENT_ID"
      clientSecret: "YOUR_SPOTIFY_CLIENT_SECRET"
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
> 1. ต้องสร้าง Spotify App ใน [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
> 2. แทนที่ `YOUR_SPOTIFY_CLIENT_ID` และ `YOUR_SPOTIFY_CLIENT_SECRET` ด้วยค่าจริง
> 3. ดูคู่มือละเอียดใน [Spotify Integration Guide](./docs/spotify-integration.md)

### 5️⃣ สร้าง Prisma Client

```bash
bun prisma generate
```

---

## 📚 เอกสารและคู่มือ

- **[คู่มือการใช้ config.json](./docs/config-guide.md)** - การตั้งค่าพื้นฐานของบอท
- **[Icon Configuration](./docs/icon-configuration.md)** - การตั้งค่า iconURL สำหรับ embed
- **[Author URL Configuration](./docs/author-url-configuration.md)** - การตั้งค่า URL ใน author ของ embed
- **[Playlist Metadata System](./docs/playlist-metadata.md)** - ระบบจัดการข้อมูล playlist
- **[Spotify Integration](./docs/spotify-integration.md)** - การดึง thumbnail และข้อมูลจาก Spotify

---

## 🚀 การรันโปรเจ็ก

### โหมดพัฒนา (dev)

```bash
bun run dev
```

### สร้างไฟล์ build (สำหรับ production)

```bash
bun run build
```

### รัน production (หลัง build)

```bash
bun run start
```

---

## 🛠️ คำสั่งสำคัญ (ใน package.json)

| คำสั่ง          | รายละเอียด                                  |
| --------------- | ------------------------------------------- |
| `bun run dev`   | รันโค้ดแบบ hot-reload (เหมาะสำหรับพัฒนา)    |
| `bun run build` | สร้างไฟล์ build (minify, output ใน `dist/`) |
| `bun run start` | รันไฟล์ที่ build แล้ว (production)          |

---

## 📜 License

โปรเจ็กนี้ให้ใช้ภายใต้เงื่อนไข:

* **ห้ามนำไปใช้เชิงพาณิชย์หรือขายต่อ**
* **หากดัดแปลงหรือนำไปใช้ ต้องให้เครดิต**
  ดูรายละเอียดเพิ่มเติมใน [LICENSE](./LICENSE)

---

## 🙌 เครดิต

* ผู้พัฒนา: [Khaoseekakun](https://github.com/Khaoseekakun)
* โปรเจ็กต้นฉบับ: [music-bot-sinsamuth-2025](https://github.com/Khaoseekakun/music-bot-sinsamuth-2025)

```
