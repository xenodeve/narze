# Icon Configuration System

ระบบ icon configuration ใหม่ในไฟล์ `config.json` ช่วยให้คุณปรับแต่ง iconURL ของ embed ตามประเภทของเพลง

## การตั้งค่าใน config.json

```json
{
    "icon_config": {
        "normal_track": "userimage",
        "playlist_display": "playlist_thumbnail", 
        "playlist_track": "playlist_thumbnail"
    }
}
```

## ประเภทของ Icon

### ค่าที่รองรับ:
- `"botavatar"` - ใช้ avatar ของบอท (Bot Avatar)
- `"userimage"` - ใช้ avatar ของผู้ใช้ที่สั่งเล่น (User Avatar)
- `"playlist_thumbnail"` - ใช้ thumbnail ของ playlist (fallback เป็น userimage หากไม่มี)
- `"artistImage"` - ใช้รูปโปรไฟล์ของศิลปิน (Artist Profile Image) จาก Spotify API

### การแยกประเภท:

#### 1. `normal_track`
- **ใช้กับ:** เพลงธรรมดาที่ไม่ได้มาจาก playlist
- **ตัวอย่าง:** เพลงที่ search หรือ single track URL
- **แนะนำ:** `"userimage"` เพื่อให้เห็นว่าใครเป็นคนเล่น

#### 2. `playlist_display`
- **ใช้กับ:** การแสดงผลเมื่อเพิ่ม playlist ทั้งหมด (command `/play` และ `/skipplay`)
- **ตัวอย่าง:** "เพิ่ม playlist ABC มี 20 เพลง"
- **แนะนำ:** `"playlist_thumbnail"` เพื่อแสดงตัวตน playlist

#### 3. `playlist_track`
- **ใช้กับ:** เพลงแต่ละเพลงที่มาจาก playlist (event `trackStart`)
- **ตัวอย่าง:** "กำลังเล่น: เพลง XYZ จาก playlist ABC"
- **แนะนำ:** `"playlist_thumbnail"` เพื่อความสอดคล้อง หรือ `"artistImage"` เพื่อแสดงศิลปิน

## ตัวอย่างการตั้งค่า

### แบบ 1: เน้น User Identity
```json
{
    "icon_config": {
        "normal_track": "userimage",
        "playlist_display": "userimage", 
        "playlist_track": "userimage"
    }
}
```
**ผลลัพธ์:** ทุกอย่างใช้ avatar ของผู้ใช้

### แบบ 2: เน้น Artist Identity (ใหม่!)
```json
{
    "icon_config": {
        "normal_track": "artistImage",
        "playlist_display": "botavatar", 
        "playlist_track": "artistImage"
    }
}
```
**ผลลัพธ์:** เพลงใช้รูปศิลปิน, playlist display ใช้ bot avatar

### แบบ 3: ผสมผสานทุกแบบ
```json
{
    "icon_config": {
        "normal_track": "artistImage",
        "playlist_display": "playlist_thumbnail", 
        "playlist_track": "artistImage"
    }
}
```
**ผลลัพธ์:** เพลงใช้รูปศิลปิน, playlist display ใช้ playlist thumbnail

### แบบ 2: เน้น Playlist Identity
```json
{
    "icon_config": {
        "normal_track": "userimage",
        "playlist_display": "playlist_thumbnail", 
        "playlist_track": "playlist_thumbnail"
    }
}
```
**ผลลัพธ์:** เพลงธรรมดาใช้ user avatar, เพลงจาก playlist ใช้ playlist thumbnail

### แบบ 3: ใช้ Bot Avatar ทั้งหมด
```json
{
    "icon_config": {
        "normal_track": "botavatar",
        "playlist_display": "botavatar", 
        "playlist_track": "botavatar"
    }
}
```
**ผลลัพธ์:** ทุกอย่างใช้ avatar ของบอท

## Fallback System

ระบบมี fallback หากไม่สามารถดึง icon ที่ต้องการได้:

1. `playlist_thumbnail` → `userimage` → `botavatar`
2. `userimage` → `botavatar`
3. `botavatar` → Discord's default embed avatar
4. `artistImage` → `userimage` → `botavatar` (ใหม่!)

## Artist Image System 🎨

### คุณสมบัติ
- **ดึงจาก:** Spotify Web API
- **คุณภาพ:** รูปโปรไฟล์ศิลปินขนาด 300x300px หรือมากกว่า
- **Performance:** ~200-500ms (cached หลังครั้งแรก)
- **Fallback:** หากไม่พบศิลปินใน Spotify จะใช้ userimage แทน

### การทำงาน
1. ✅ ดึงชื่อศิลปินจาก `track.info.author`
2. ✅ ค้นหาศิลปินใน Spotify API
3. ✅ ดึงรูปโปรไฟล์ศิลปิน (ขนาดเหมาะสม)
4. ✅ Return URL รูปศิลปิน

### ข้อกำหนด
⚠️ **ต้องตั้งค่า Spotify Credentials** ใน `lavalink/application.yml`:
```yaml
plugins:
  lavasrc:
    spotify:
      clientId: "YOUR_CLIENT_ID"
      clientSecret: "YOUR_CLIENT_SECRET"
```

### ตัวอย่างการใช้งาน
```json
{
    "icon_config": {
        "normal_track": "artistImage",     // เพลงเดี่ยวใช้รูปศิลปิน
        "playlist_display": "botavatar",   // playlist ใช้ bot avatar
        "playlist_track": "artistImage"    // เพลงจาก playlist ใช้รูปศิลปิน
    }
}
```

**ผลลัพธ์:**
- 🎤 เพลงของ **Taylor Swift** → แสดงรูป Taylor Swift
- 🎸 เพลงของ **Ed Sheeran** → แสดงรูป Ed Sheeran
- 🎹 เพลงของ **BTS** → แสดงรูป BTS

## การใช้งานใน Code

### สำหรับ Normal Track และ Playlist Track
```typescript
import { getIconURL } from "../../functions/lavalink/iconConfig";

const iconURL = await getIconURL(track, userAvatar); // ⚠️ ต้องใช้ await!
```

### สำหรับ Playlist Display
```typescript
import { getPlaylistDisplayIcon } from "../../functions/lavalink/iconConfig";

const iconURL = await getPlaylistDisplayIcon(
    playlistThumbnail, 
    userAvatar, 
    artistName // ⚠️ จำเป็นสำหรับ artistImage
);
```

## Performance Considerations

### Artist Image
- **First Request:** ~200-500ms (ต้อง call Spotify API)
- **Subsequent:** ~50-100ms (อาจมี cache ใน memory)
- **Error Handling:** Auto fallback ไม่ส่งผลกระทบต่อประสบการณ์ผู้ใช้

### Recommendations
✅ **ใช้ artistImage เมื่อ:** ต้องการให้ embed มี visual identity ที่หลากหลาย  
✅ **ใช้ userimage เมื่อ:** ต้องการ performance สูงสุดและ consistency  
✅ **ใช้ playlist_thumbnail เมื่อ:** ต้องการแสดงความเป็น playlist

## Benefits

✅ **Consistency:** เพลงจาก playlist เดียวกันจะมี visual identity เดียวกัน  
✅ **Flexibility:** ปรับแต่งได้ตามความต้องการ  
✅ **User Experience:** ชัดเจนว่าเพลงมาจากไหน  
✅ **Fallback:** ไม่มีปัญหาหาก thumbnail หาไม่เจอ
