# คู่มือการใช้งาน config.json

ไฟล์ `config.json` เป็นไฟล์หลักในการตั้งค่าการทำงานของบอท Discord Music Bot

## โครงสร้างไฟล์

```json
{
    "lavalink_config": {
        "volume_default": 15,
        "default_image": "https://ik.imagekit.io/xenodev/NO%20PICTURE.png?updatedAt=1757172663512"
    },

    "icon_config": {
        "normal_track": "botavatar",
        "playlist_display": "botavatar",
        "playlist_track": "botavatar"
    },

    "embed_color":"#e4854a",
    "embed_fail":"#FF0000"
}
```

---

## 📁 lavalink_config

การตั้งค่าเกี่ยวกับ Lavalink และการเล่นเพลง

### `volume_default`
- **ประเภท:** Number (0-100)
- **ค่าเริ่มต้น:** `15`
- **คำอธิบาย:** ระดับเสียงเริ่มต้นเมื่อเล่นเพลง (15%)
- **ตัวอย่าง:**
  ```json
  "volume_default": 25  // เสียงเริ่มต้น 25%
  ```

### `default_image`
- **ประเภท:** String (URL)
- **คำอธิบาย:** รูปภาพเริ่มต้นที่ใช้เมื่อไม่มี thumbnail ของเพลง
- **ตัวอย่าง:**
  ```json
  "default_image": "https://your-domain.com/default-music.png"
  ```

---

## 🎨 icon_config

การตั้งค่า iconURL ของ embed ตามประเภทของเพลง

### ตัวเลือกที่รองรับ:
- `"botavatar"` - Avatar ของบอท
- `"userimage"` - Avatar ของผู้ใช้ที่สั่งเล่น  
- `"playlist_thumbnail"` - Thumbnail ของ playlist

### `normal_track`
- **คำอธิบาย:** เพลงธรรมดาที่ไม่ได้มาจาก playlist
- **แนะนำ:** `"userimage"` 
- **ตัวอย่าง:**
  ```json
  "normal_track": "userimage"  // แสดง avatar ของคนเล่น
  ```

### `playlist_display`
- **คำอธิบาย:** การแสดงผลเมื่อเพิ่ม playlist (/play, /skipplay)
- **แนะนำ:** `"playlist_thumbnail"`
- **ตัวอย่าง:**
  ```json
  "playlist_display": "playlist_thumbnail"  // แสดง thumbnail playlist
  ```

### `playlist_track`
- **คำอธิบาย:** เพลงแต่ละเพลงที่มาจาก playlist (trackStart event)
- **แนะนำ:** `"playlist_thumbnail"`
- **ตัวอย่าง:**
  ```json
  "playlist_track": "playlist_thumbnail"  // แสดง thumbnail playlist
  ```

---

## 🎨 embed_color

การตั้งค่าสีของ embed

### `embed_color`
- **ประเภท:** String (Hex Color)
- **ค่าเริ่มต้น:** `"#e4854a"`
- **คำอธิบาย:** สีของ embed สำหรับการแสดงผลปกติ
- **ตัวอย่าง:**
  ```json
  "embed_color": "#00ff00"  // สีเขียว
  "embed_color": "#3498db"  // สีน้ำเงิน
  "embed_color": "#9b59b6"  // สีม่วง
  ```

### `embed_fail`
- **ประเภท:** String (Hex Color) 
- **ค่าเริ่มต้น:** `"#FF0000"`
- **คำอธิบาย:** สีของ embed สำหรับการแสดง error หรือความล้มเหลว
- **ตัวอย่าง:**
  ```json
  "embed_fail": "#e74c3c"  // สีแดงเข้ม
  ```

---

## 📋 ตัวอย่างการตั้งค่า

### แบบ 1: เน้น User Identity
```json
{
    "lavalink_config": {
        "volume_default": 20,
        "default_image": "https://example.com/music-note.png"
    },
    "icon_config": {
        "normal_track": "userimage",
        "playlist_display": "userimage", 
        "playlist_track": "userimage"
    },
    "embed_color": "#3498db",
    "embed_fail": "#e74c3c"
}
```
**ผลลัพธ์:** ทุกอย่างแสดง avatar ของผู้ใช้

### แบบ 2: เน้น Playlist Branding
```json
{
    "lavalink_config": {
        "volume_default": 15,
        "default_image": "https://example.com/playlist-default.jpg"
    },
    "icon_config": {
        "normal_track": "userimage",
        "playlist_display": "playlist_thumbnail", 
        "playlist_track": "playlist_thumbnail"
    },
    "embed_color": "#9b59b6",
    "embed_fail": "#FF0000"
}
```
**ผลลัพธ์:** เพลงธรรมดาแสดง user avatar, playlist แสดง thumbnail

### แบบ 3: Bot-centric Design
```json
{
    "lavalink_config": {
        "volume_default": 25,
        "default_image": "https://example.com/bot-music.png"
    },
    "icon_config": {
        "normal_track": "botavatar",
        "playlist_display": "botavatar", 
        "playlist_track": "botavatar"
    },
    "embed_color": "#2c3e50",
    "embed_fail": "#c0392b"
}
```
**ผลลัพธ์:** ทุกอย่างใช้ bot avatar

---

## ⚠️ หมายเหตุสำคัญ

### Hex Color Format
- ใช้รูปแบบ `#RRGGBB` เท่านั้น
- ตัวอย่างที่ถูกต้อง: `#ff0000`, `#00FF00`, `#3498DB`
- ❌ ไม่ถูกต้อง: `red`, `rgb(255,0,0)`, `#f00`

### URL Requirements
- `default_image` ต้องเป็น URL ที่เข้าถึงได้จาก internet
- รองรับ format: PNG, JPG, JPEG, GIF, WEBP
- แนะนำขนาด: 512x512 หรือ 1024x1024 pixels

### Volume Range
- `volume_default` ต้องอยู่ระหว่าง 0-100
- 0 = เงียบ, 100 = เสียงเต็ม
- แนะนำ: 10-30 สำหรับการใช้งานทั่วไป

---

## 🔧 การ Reload Configuration

หลังจากแก้ไข `config.json`:

1. **ปิดบอท:** Ctrl+C ใน terminal
2. **เริ่มใหม่:** รัน `bun src/index.ts` อีกครั้ง
3. **หรือใช้:** Process manager ที่รองรับ hot reload

---

## 🚨 Troubleshooting

### ❌ Bot ไม่ทำงาน
- ตรวจสอบ JSON syntax (comma, quotes, brackets)
- ใช้ JSON validator online เพื่อตรวจสอบ

### ❌ สีไม่แสดง
- ตรวจสอบ hex color format
- ต้องมี # นำหน้า

### ❌ รูปไม่แสดง
- ตรวจสอบ URL accessibility
- ลองเปิด URL ในเบราว์เซอร์

### ❌ Volume ไม่เปลี่ยน
- ตรวจสอบว่าค่าอยู่ระหว่าง 0-100
- Restart บอทหลังแก้ไข

---

## 📚 เอกสารเพิ่มเติม

- [Icon Configuration Guide](./icon-configuration.md)
- [Playlist Metadata System](./playlist-metadata.md)
- [Lavalink Setup Guide](./lavalink-setup.md)
