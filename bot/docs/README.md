# 📚 เอกสารและคู่มือ Discord Music Bot

รวมเอกสารและคู่มือการใช้งานทั้งหมดสำหรับ Discord Music Bot

## 🚀 เริ่มต้นใช้งาน

### [คู่มือการใช้ config.json](./config-guide.md)
การตั้งค่าพื้นฐานของบอท รวมถึงสี embed, ระดับเสียง, และรูปภาพเริ่มต้น

**เนื้อหาหลัก:**
- การตั้งค่า lavalink_config
- การจัดการสี embed 
- การตั้งค่า volume และ default image
- ตัวอย่างการ config แบบต่างๆ

---

## 🎨 การปรับแต่งการแสดงผล

### [Icon Configuration System](./icon-configuration.md)
ระบบจัดการ iconURL ของ embed ตามประเภทของเพลง

**เนื้อหาหลัก:**
- การตั้งค่า icon สำหรับเพลงธรรมดา
- การตั้งค่า icon สำหรับ playlist
- การตั้งค่า icon สำหรับเพลงจาก playlist
- ตัวอย่าง configuration patterns

### [Author URL Configuration](./author-url-configuration.md)
ระบบการตั้งค่า URL ใน author ของ embed เมื่อเล่นเพลง

**เนื้อหาหลัก:**
- การเลือกใช้ playlist URL หรือ track URL
- การตั้งค่า use_playlist_url
- ตัวอย่างการทำงานแบบต่างๆ
- คำแนะนำการใช้งาน

---

## 🎵 ระบบ Playlist

### [Playlist Metadata System](./playlist-metadata.md)
ระบบจัดการข้อมูล playlist ที่ครบถ้วนและแสดงผลสวยงาม

**เนื้อหาหลัก:**
- การเก็บข้อมูล playlist metadata
- การแสดงผลข้อมูล playlist
- การจัดการ playlist thumbnail
- ฟังก์ชันสำหรับจัดการ playlist

### [Spotify Integration](./spotify-integration.md)
ระบบดึง thumbnail และข้อมูลจาก Spotify playlists

**เนื้อหาหลัก:**
- การตั้งค่า Spotify API credentials
- การดึง playlist thumbnails จาก Spotify
- Fallback system สำหรับ YouTube playlists
- การใช้งาน Spotify Web API

---

## 📖 Quick Reference

### การตั้งค่าเบื้องต้น
```json
{
    "lavalink_config": {
        "volume_default": 15,
        "default_image": "https://example.com/default.png"
    },
    "icon_config": {
        "normal_track": "userimage",
        "playlist_display": "playlist_thumbnail",
        "playlist_track": "playlist_thumbnail"
    },
    "author_url_config": {
        "use_playlist_url": true
    },
    "embed_color": "#e4854a",
    "embed_fail": "#FF0000"
}
```

### ค่า Icon ที่รองรับ
- `"botavatar"` - Bot avatar
- `"userimage"` - User avatar
- `"playlist_thumbnail"` - Playlist thumbnail
- `"artistImage"` - Artist profile image จาก Spotify API

### ค่า Author URL ที่รองรับ
- `"use_playlist_url": true` - ใช้ playlist URL เมื่อเป็นเพลงจาก playlist
- `"use_playlist_url": false` - ใช้ track URL เสมอ

### Format ข้อมูล Playlist
- `'short'` - "จาก: Playlist Name"
- `'full'` - "จาก: Playlist Name (5/20)"
- `'index-only'` - "(5/20)"

---

## 🔧 การพัฒนาเพิ่มเติม

### ไฟล์สำคัญ
```
src/
├── config/
│   └── config.json              # การตั้งค่าหลัก
├── functions/lavalink/
│   ├── iconConfig.ts           # ระบบจัดการ icon
│   └── playlistMetadata.ts     # ระบบ playlist metadata
├── commands/lavalink/
│   ├── play.ts                 # คำสั่งเล่นเพลง
│   └── skipplay.ts             # คำสั่ง skip และเล่นใหม่
└── events/lavalink/
    └── trackStart.ts           # Event เมื่อเพลงเริ่ม
```

### การเพิ่มฟีเจอร์ใหม่
1. อ่านเอกสาร Playlist Metadata System
2. ศึกษา Icon Configuration System
3. ปรับแต่ง config.json ตามต้องการ
4. ทดสอบใน development environment

---

## 🆘 การแก้ไขปัญหา

### ปัญหาที่พบบ่อย

**🔴 Bot ไม่ทำงาน**
- ตรวจสอบ JSON syntax ใน config.json
- ใช้ JSON validator online

**🔴 สีไม่แสดง**
- ตรวจสอบ hex color format (#RRGGBB)
- ต้องมี # นำหน้า

**🔴 รูป Thumbnail ไม่แสดง**
- ตรวจสอบ network connection
- ตรวจสอบ YouTube API quota
- ลองใช้ fallback configuration

**🔴 ข้อมูล Playlist ไม่แสดง**
- ตรวจสอบว่าเรียก addPlaylistMetadata() แล้ว
- ตรวจสอบ loadType === 'playlist'

---

## 📞 การติดต่อและสนับสนุน

- **GitHub Repository:** [music-bot-sinsamuth-2025](https://github.com/Khaoseekakun/music-bot-sinsamuth-2025)
- **Developer:** [Khaoseekakun](https://github.com/Khaoseekakun)

---

## 📝 การอัปเดตเอกสาร

เอกสารนี้ได้รับการอัปเดตล่าสุด: **September 7, 2025**

หากพบข้อผิดพลาดหรือต้องการเพิ่มเติมเนื้อหา กรุณาแจ้งผ่าน GitHub Issues
