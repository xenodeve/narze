# YouTube Playlist Thumbnail Functions

ชุดฟังก์ชันสำหรับดึง thumbnail ของ YouTube/YouTube Music playlists

## ฟีเจอร์

✅ รองรับ YouTube และ YouTube Music playlists  
✅ หลายวิธีในการดึง thumbnail (Web Scraping, YTMusic API, Simple Pattern)  
✅ Fallback system สำหรับความน่าเชื่อถือ  
✅ รองรับคุณภาพ high resolution  
✅ TypeScript support  

## วิธีการติดตั้ง

Dependencies ที่ต้องการ:
```bash
bun add ytmusic-api youtubei.js axios
```

## การใช้งาน

### วิธีที่ 1: ใช้ฟังก์ชันหลัก (แนะนำ)

```typescript
import { getPlaylistThumbnailMain } from './functions/youtube/index';

// การใช้งานพื้นฐาน
const playlistUrl = 'https://music.youtube.com/playlist?list=PLqUySH4LapbDFxDzLQZ7OLiBKPnJCaO3b';
const thumbnail = await getPlaylistThumbnailMain(playlistUrl);
console.log(thumbnail);
// Output: https://yt3.googleusercontent.com/ySku04nsR4QDUkRwwVSsEE_pPoEQ0AYhUbSyd0fzxgJt6lZX6CM-_4E0Iukv8v1qD09i1ZvOtGk=s1200

// การใช้งานแบบกำหนดตัวเลือก
const thumbnail2 = await getPlaylistThumbnailMain(playlistUrl, videoThumbnail, {
    method: 'auto',          // 'auto' | 'web-scraping' | 'ytmusic-api' | 'simple'
    fallbackToVideo: true,   // ใช้ thumbnail จากเพลงแรกถ้าหาไม่เจอ
    highQuality: true        // อัปเกรดเป็น maxresdefault
});
```

### วิธีที่ 2: ใช้ฟังก์ชันแยก

```typescript
import { 
    getPlaylistThumbnail,          // ใช้ ytmusic-api
    getPlaylistThumbnailSimple,    // ใช้ URL pattern
    getBestPlaylistThumbnail       // ใช้ web scraping
} from './functions/youtube/';

// Web Scraping (แน่นอนที่สุด)
const thumbnail1 = await getBestPlaylistThumbnail(playlistUrl);

// YTMusic API
const thumbnail2 = await getPlaylistThumbnail(playlistUrl);

// Simple Pattern
const thumbnail3 = getPlaylistThumbnailSimple(playlistUrl);
```

### วิธีที่ 3: ใช้ Utility Functions

```typescript
import { 
    isPlaylistUrl, 
    extractPlaylistId, 
    generatePlaylistThumbnailUrl 
} from './functions/youtube/index';

const url = 'https://music.youtube.com/playlist?list=PLqUySH4LapbDFxDzLQZ7OLiBKPnJCaO3b';

// ตรวจสอบว่าเป็น playlist URL
if (isPlaylistUrl(url)) {
    // ดึง playlist ID
    const playlistId = extractPlaylistId(url);
    
    // สร้าง thumbnail URL แบบ manual
    const thumbnailUrl = generatePlaylistThumbnailUrl(playlistId, 'maxres');
}
```

## วิธีการทำงาน

### 1. Web Scraping Method
- ดึงหน้าเว็บของ playlist โดยตรง
- หา thumbnail จาก meta tags และ JSON data
- แน่นอนที่สุดแต่ช้าที่สุด

### 2. YTMusic API Method  
- ใช้ ytmusic-api library
- เร็วและเชื่อถือได้
- ต้องมี API initialization

### 3. Simple Pattern Method
- ใช้ URL pattern ที่ทราบ
- เร็วที่สุดแต่อาจไม่แน่นอน
- เหมาะสำหรับ fallback

## ตัวอย่างใน Discord Bot

```typescript
// ในไฟล์ play.ts
if (result.loadType === 'playlist') {
    const videoThumbnail = result.tracks[0]?.info?.thumbnail;
    const thumbnailUrl = await getPlaylistThumbnailMain(query, videoThumbnail, {
        method: 'auto',
        fallbackToVideo: true,
        highQuality: true
    });

    const embed = new EmbedBuilder()
        .setColor(configjson.embed_color as HexColorString)
        .setDescription(`📙 **Playlist:** ${result.playlistInfo.name}`)
        .setThumbnail(thumbnailUrl);
}
```

## URL Formats ที่รองรับ

- `https://music.youtube.com/playlist?list=PLqUySH4LapbDFxDzLQZ7OLiBKPnJCaO3b`
- `https://www.youtube.com/playlist?list=PLqUySH4LapbDFxDzLQZ7OLiBKPnJCaO3b`
- `https://youtube.com/playlist?list=PLqUySH4LapbDFxDzLQZ7OLiBKPnJCaO3b`

## Thumbnail Quality Options

- `maxres` - 1280x720 (ความละเอียดสูงสุด)
- `hq` - 480x360 (คุณภาพสูง)  
- `mq` - 320x180 (คุณภาพกลาง)
- `default` - 120x90 (คุณภาพปกติ)

## Error Handling

ฟังก์ชันทั้งหมดมี error handling และ fallback system:

```typescript
try {
    const thumbnail = await getPlaylistThumbnailMain(playlistUrl, videoThumbnail);
    if (thumbnail) {
        console.log('Success:', thumbnail);
    } else {
        console.log('No thumbnail found');
    }
} catch (error) {
    console.error('Error:', error);
    // ใช้ default thumbnail หรือ fallback
}
```

## Performance Tips

1. ใช้ `method: 'simple'` สำหรับความเร็ว
2. ใช้ `method: 'web-scraping'` สำหรับความแน่นอน
3. ใช้ `method: 'auto'` สำหรับ balance ระหว่างความเร็วและความแน่นอน
4. เปิด `fallbackToVideo: true` เพื่อความน่าเชื่อถือ
