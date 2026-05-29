# 🔗 Author URL Configuration Guide

คู่มือการตั้งค่า `author_url_config` สำหรับควบคุมการแสดง URL ใน author ของ embed เมื่อเล่นเพลง

## 📋 ภาพรวม

`author_url_config` ใช้สำหรับกำหนดว่าเมื่อเล่นเพลงจาก playlist แล้ว ลิงก์ "Go to Page" ใน embed จะนำไปที่:
- **Playlist URL** (ลิงก์ของ playlist ทั้งหมด) หรือ
- **Track URL** (ลิงก์ของเพลงแต่ละเพลง)

## ⚙️ การตั้งค่า

### ตำแหน่งไฟล์
```
src/config/config.json
```

### โครงสร้างการตั้งค่า
```json
{
    "author_url_config": {
        "use_playlist_url": true/false,
        "description": "คำอธิบายการทำงาน"
    }
}
```

## 🎛️ ตัวเลือกการตั้งค่า

### ✅ `use_playlist_url: true` (แนะนำ)
```json
"author_url_config": {
    "use_playlist_url": true
}
```

**พฤติกรรม:**
- เพลงจาก **playlist** → คลิก "Go to Page" ไป **playlist**
- เพลง**ธรรมดา** → คลิก "Go to Page" ไป **track**

**ข้อดี:**
- ผู้ใช้สามารถดู playlist ทั้งหมดได้
- เหมาะสำหรับการฟัง playlist ต่อเนื่อง
- สะดวกในการแชร์ playlist

### ❌ `use_playlist_url: false`
```json
"author_url_config": {
    "use_playlist_url": false
}
```

**พฤติกรรม:**
- **ทุกเพลง** → คลิก "Go to Page" ไป **track เสมอ**

**ข้อดี:**
- ผู้ใช้ไปที่เพลงที่กำลังเล่นโดยตรง
- เหมาะสำหรับการฟังเพลงแยกเป็นรายเพลง

## 🎵 ตัวอย่างการทำงาน

### 📀 กรณี Spotify Playlist

**คำสั่ง:**
```
!play https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
```

**ผลลัพธ์:**

#### เมื่อ `use_playlist_url: true`
```
┌─────────────────────────────────────┐
│ 🎵 Go to Page                       │ ← คลิกไปที่ Spotify Playlist
│ ▶️┃Today's Top Hits (1/50)          │
│ > 📋 Today's Top Hits               │
└─────────────────────────────────────┘
```

#### เมื่อ `use_playlist_url: false`
```
┌─────────────────────────────────────┐
│ 🎵 Go to Page                       │ ← คลิกไปที่เพลงปัจจุบัน
│ ▶️┃As It Was - Harry Styles         │
│ > 📋 Today's Top Hits (1/50)        │
└─────────────────────────────────────┘
```

### 🎬 กรณี YouTube Playlist

**คำสั่ง:**
```
!play https://www.youtube.com/playlist?list=PLrAXtmRdnEQy8V
```

**ผลลัพธ์:**

#### เมื่อ `use_playlist_url: true`
```
┌─────────────────────────────────────┐
│ 🎵 Go to Page                       │ ← คลิกไปที่ YouTube Playlist
│ ▶️┃Chill Music Mix                  │
│ > 📋 Chill Vibes (1/25)             │
└─────────────────────────────────────┘
```

#### เมื่อ `use_playlist_url: false`
```
┌─────────────────────────────────────┐
│ 🎵 Go to Page                       │ ← คลิกไปที่ Video ปัจจุบัน
│ ▶️┃Lofi Hip Hop Study Music         │
│ > 📋 Chill Vibes (1/25)             │
└─────────────────────────────────────┘
```

### 🎼 กรณีเพลงธรรมดา (ไม่ใช่ playlist)

**คำสั่ง:**
```
!play Shape of You
```

**ผลลัพธ์:** (เหมือนกันทั้ง 2 แบบ)
```
┌─────────────────────────────────────┐
│ 🎵 Go to Page                       │ ← คลิกไปที่เพลงนี้
│ ▶️┃Shape of You - Ed Sheeran        │
└─────────────────────────────────────┘
```

## 🔧 วิธีการเปลี่ยนแปลงการตั้งค่า

### 1. เปิดไฟล์ config.json
```bash
src/config/config.json
```

### 2. แก้ไขค่า use_playlist_url
```json
{
    "author_url_config": {
        "use_playlist_url": true  // เปลี่ยนเป็น true หรือ false
    }
}
```

### 3. Restart Bot
```bash
# หยุด bot
Ctrl + C

# เริ่มใหม่
npm start
# หรือ
bun run start
```

## 🎯 คำแนะนำการใช้งาน

### 💡 **แนะนำให้ใช้ `true`** เมื่อ:
- ผู้ใช้มักเล่น playlist เป็นหลัก
- ต้องการให้ผู้ใช้เข้าถึง playlist ทั้งหมด
- ใช้ใน server ที่มีการแชร์ playlist กันบ่อย

### 💡 **แนะนำให้ใช้ `false`** เมื่อ:
- ผู้ใช้มักเล่นเพลงแยกเป็นรายเพลง
- ต้องการให้ผู้ใช้ไปที่เพลงปัจจุบันโดยตรง
- ใช้ในการสตรีมหรือการฟังเพลงแบบเฉพาะเจาะจง

## 🐛 Troubleshooting

### ❓ การตั้งค่าไม่มีผล
- ✅ ตรวจสอบว่า restart bot แล้ว
- ✅ ตรวจสอบ syntax ของ JSON ว่าถูกต้อง
- ✅ ตรวจสอบว่าไฟล์ config.json บันทึกแล้ว

### ❓ Error เมื่อเริ่ม bot
- ✅ ตรวจสอบ JSON format ด้วย JSON validator
- ✅ ตรวจสอบว่ามี comma ครบ
- ✅ ตรวจสอบว่าไม่มี trailing comma

## 📚 เอกสารที่เกี่ยวข้อง

- [Playlist Metadata Guide](./playlist-metadata.md)
- [Icon Configuration Guide](./icon-configuration.md)
- [Config Guide](./config-guide.md)

---
**หมายเหตุ:** การตั้งค่านี้จะมีผลกับเพลงใหม่ที่เล่นหลังจากเปลี่ยนแปลงการตั้งค่าเท่านั้น
