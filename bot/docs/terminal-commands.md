# Terminal Commands Guide

ระบบคำสั่ง Terminal สำหรับ Discord Music Bot ช่วยให้คุณสามารถควบคุมบอทจากหน้า terminal ได้โดยตรง

## 🚀 การเริ่มต้น

เมื่อบอทเริ่มทำงาน Terminal จะแสดงข้อความต้อนรับและพร้อมรับคำสั่ง:

```
╔══════════════════════════════════════╗
║        Discord Narze Terminal        ║
╚══════════════════════════════════════╝
Commands: help, play, stop, skip, leave, status, clear, exit
Example: play "Imagine Dragons Bones" 123456789 987654321

Narze Terminal > 
```

## 📜 คำสั่งที่มีให้ใช้งาน

### 🎵 `play` - เล่นเพลง
เล่นเพลงหรือ playlist ในห้องเสียงที่ระบุ

**รูปแบบ:**
```bash
play <query> <guildId|guildName> <voiceChannelId|voiceChannelName>
```

**ตัวอย่าง:**
```bash
# ใช้ ID
play "Imagine Dragons Bones" 123456789012345678 987654321098765432

# ใช้ชื่อ
play "Imagine Dragons Bones" "My Server" "General"

# URL
play "https://www.youtube.com/watch?v=abc123" 123456789 987654321

# Playlist
play "https://www.youtube.com/playlist?list=PLxxx" "My Server" "Music"
```

### ⏹️ `stop` - หยุดเล่น
หยุดการเล่นเพลงและออกจากห้องเสียง

**รูปแบบ:**
```bash
stop <guildId|guildName>
```

**ตัวอย่าง:**
```bash
stop 123456789012345678
stop "My Server"
```

### ⏭️ `skip` - ข้ามเพลง
ข้ามเพลงปัจจุบันและเล่นเพลงถัดไป

**รูปแบบ:**
```bash
skip <guildId|guildName>
```

**ตัวอย่าง:**
```bash
skip 123456789012345678
skip "My Server"
```

### 🚪 `leave` - ออกจากห้องเสียง
ให้บอทออกจากห้องเสียงแต่ไม่หยุด player

**รูปแบบ:**
```bash
leave <guildId|guildName>
```

**ตัวอย่าง:**
```bash
leave 123456789012345678
leave "My Server"
```

### 📊 `status` - ดูสถานะ
แสดงสถานะของ player ในเซิร์ฟเวอร์

**รูปแบบ:**
```bash
status [guildId|guildName]
```

**ตัวอย่าง:**
```bash
# ดูสถานะทุกเซิร์ฟเวอร์
status

# ดูสถานะเซิร์ฟเวอร์เฉพาะ
status 123456789012345678
status "My Server"
```

**ผลลัพธ์:**
```
[TERMINAL STATUS] My Server:
  - Current: Imagine Dragons - Bones
  - Queue: 5 tracks
  - Playing: true
  - Paused: false
  - Volume: 100%
  - Position: 01:23/03:45
```

### 📋 `list` / `guilds` - แสดงรายการ
แสดงรายการเซิร์ฟเวอร์และห้องเสียงทั้งหมด

**รูปแบบ:**
```bash
list
guilds
```

**ผลลัพธ์:**
```
=== GUILDS AND VOICE CHANNELS ===

Guild: My Discord Server
ID: 123456789012345678
Members: 150
  Voice Channels:
    General - 987654321098765432 (3 members)
    Music - 876543210987654321 (0 members)
  Text Channels (sendable):
    general - 765432109876543210
    music-commands - 654321098765432109
```

### 🔍 `find` - ค้นหา
ค้นหาเซิร์ฟเวอร์หรือห้องเสียงด้วยชื่อ

**รูปแบบ:**
```bash
find guild <name>
find voice <guildId> <name>
```

**ตัวอย่าง:**
```bash
# ค้นหาเซิร์ฟเวอร์
find guild "My Server"
find guild Discord

# ค้นหาห้องเสียง
find voice 123456789012345678 "General"
find voice 123456789012345678 Music
```

### ❓ `help` - ความช่วยเหลือ
แสดงรายการคำสั่งทั้งหมด

**รูปแบบ:**
```bash
help
```

### 🧹 `clear` / `cls` - ล้างหน้าจอ
ล้างหน้าจอ terminal

**รูปแบบ:**
```bash
clear
cls
```

### 🚪 `exit` / `quit` - ออกจากระบบ
ปิดระบบ terminal command (บอทยังทำงานต่อ)

**รูปแบบ:**
```bash
exit
quit
```

## 💡 เทคนิคการใช้งาน

### 🎯 การระบุพารามิเตอร์

**1. ใช้ ID (แม่นยำที่สุด):**
```bash
play "song name" 123456789012345678 987654321098765432
```

**2. ใช้ชื่อ (สะดวกกว่า):**
```bash
play "song name" "My Server" "General"
```

**3. ใช้ส่วนของชื่อ:**
```bash
play "song name" Discord Music  # จะหาเซิร์ฟเวอร์ที่มี "Discord" หรือ "Music"
```

### 🎵 รูปแบบ Query ที่รองรับ

**1. ชื่อเพลง:**
```bash
play "Imagine Dragons Bones" "My Server" "General"
```

**2. YouTube URL:**
```bash
play "https://www.youtube.com/watch?v=abc123" "My Server" "General"
```

**3. YouTube Playlist:**
```bash
play "https://www.youtube.com/playlist?list=PLxxx" "My Server" "General"
```

**4. Spotify URL:**
```bash
play "https://open.spotify.com/track/abc123" "My Server" "General"
```

### 🔧 การแก้ปัญหา

**ปัญหา: Guild not found**
```bash
# แก้ไข: ใช้คำสั่ง list เพื่อดู ID ที่ถูกต้อง
list
find guild "ชื่อเซิร์ฟเวอร์"
```

**ปัญหา: Voice channel not found**
```bash
# แก้ไข: ตรวจสอบห้องเสียงที่มี
find voice 123456789012345678 "ชื่อห้อง"
```

**ปัญหา: No tracks found**
```bash
# แก้ไข: ตรวจสอบ query หรือลองใช้ URL แทน
play "https://www.youtube.com/watch?v=abc123" "My Server" "General"
```

## 🎮 ตัวอย่างการใช้งานจริง

### เล่นเพลงเดี่ยว:
```bash
Narze Terminal > list
Narze Terminal > play "Imagine Dragons Bones" "My Discord Server" "General"
Narze Terminal > status "My Discord Server"
```

### เล่น Playlist:
```bash
Narze Terminal > play "https://www.youtube.com/playlist?list=PLxxx" 123456789 987654321
Narze Terminal > status
```

### ควบคุมการเล่น:
```bash
Narze Terminal > skip "My Server"
Narze Terminal > status "My Server"
Narze Terminal > stop "My Server"
```

### ค้นหาและเล่น:
```bash
Narze Terminal > find guild Music
Narze Terminal > find voice 123456789012345678 General
Narze Terminal > play "Lo-fi Hip Hop" "Music Server" "Chill Room"
```

## ⚠️ ข้อควรระวัง

1. **Permissions**: บอทต้องมีสิทธิ์เข้าห้องเสียงและส่งข้อความใน text channel
2. **Query ที่มีช่องว่าง**: ใส่ใน quotes หรือใส่ guild/voice channel ID ท้ายสุด
3. **Case Sensitive**: การค้นหาด้วยชื่อไม่สนใจตัวใหญ่เล็ก
4. **Network**: ต้องมีการเชื่อมต่อ Lavalink server

## 🔗 Links
- [Lavalink Configuration](../lavalink/application.yml)
- [Bot Configuration](../src/config/config.json)
- [Commands Documentation](../docs/commands/)
