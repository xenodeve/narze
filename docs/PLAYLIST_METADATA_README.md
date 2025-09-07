# Playlist Metadata System

ระบบจัดการข้อมูล playlist metadata ที่เพิ่มลงใน track objects เพื่อระบุว่า track นั้นมาจาก playlist ใด

## ฟีเจอร์

✅ เพิ่มข้อมูล playlist ลงใน track object  
✅ ระบุชื่อ playlist และ URL  
✅ แสดงลำดับเพลงใน playlist (เช่น 5/25)  
✅ ตรวจสอบว่า track มาจาก playlist หรือไม่  
✅ แสดงข้อมูล playlist ในรูปแบบต่างๆ  
✅ รองรับ Discord embed formatting  

## การเพิ่ม Metadata

### ใน play.ts และ skipplay.ts
```typescript
import { addPlaylistMetadata } from "../../functions/lavalink/playlistMetadata";

// เมื่อโหลด playlist
if (result.loadType === 'playlist') {
    // เพิ่ม playlist metadata ลงใน tracks
    const tracksWithMetadata = addPlaylistMetadata(
        result.tracks, 
        result.playlistInfo.name, 
        query
    );

    tracksWithMetadata.forEach(track => {
        player.queue.add(track);
    });
}
```

## Metadata ที่เพิ่ม

แต่ละ track จาก playlist จะมี metadata เพิ่มดังนี้:

```typescript
track.playlistName = "ชื่อ playlist"
track.playlistUrl = "URL ของ playlist"  
track.isFromPlaylist = true
track.playlistIndex = 5  // ลำดับเพลงใน playlist (1-based)
track.playlistTotalTracks = 25  // จำนวนเพลงทั้งหมดใน playlist
```

## Functions ที่ใช้งาน

### 1. การตรวจสอบ
```typescript
import { isFromPlaylist } from "../functions/lavalink/playlistMetadata";

if (isFromPlaylist(track)) {
    console.log("Track นี้มาจาก playlist");
}
```

### 2. การดึงข้อมูล
```typescript
import { getPlaylistMetadata, getPlaylistName } from "../functions/lavalink/playlistMetadata";

// ดึงข้อมูลทั้งหมด
const metadata = getPlaylistMetadata(track);
console.log(metadata);
/*
{
    playlistName: "Best Songs 2023",
    playlistUrl: "https://music.youtube.com/playlist?list=...",
    isFromPlaylist: true,
    playlistIndex: 5,
    playlistTotalTracks: 25
}
*/

// ดึงเฉพาะชื่อ
const playlistName = getPlaylistName(track);
```

### 3. การแสดงผล
```typescript
import { formatPlaylistInfo } from "../functions/lavalink/playlistMetadata";

// รูปแบบสั้น
formatPlaylistInfo(track, 'short');
// Result: "📄 Best Songs 2023"

// รูปแบบเต็ม
formatPlaylistInfo(track, 'full');
// Result: "📄 **Best Songs 2023** (5/25)"

// เฉพาะลำดับ
formatPlaylistInfo(track, 'index-only');
// Result: "(5/25)"
```

### 4. สำหรับ Discord Embed
```typescript
import { createPlaylistEmbedField } from "../functions/lavalink/playlistMetadata";

const playlistField = createPlaylistEmbedField(track);
if (playlistField) {
    embed.addFields(playlistField);
}
/*
{
    name: "📄 Playlist",
    value: "**Best Songs 2023**\nเพลงที่ 5 จาก 25 เพลง",
    inline: true
}
*/
```

## การใช้งานใน Track Events

### ใน trackStart.ts
```typescript
import { formatPlaylistInfo, isFromPlaylist } from "../../functions/lavalink/playlistMetadata";

// สร้าง description
let description = `\`▶️\`┃**${track.info.title}** \` ${convertTime(track.info.length)} \``;

// เพิ่มข้อมูล playlist หากมี
if (isFromPlaylist(track)) {
    const playlistInfo = formatPlaylistInfo(track, 'index-only');
    description += `\n> ${formatPlaylistInfo(track, 'short')} ${playlistInfo}`;
}

const embed = new EmbedBuilder()
    .setDescription(description);
```

### ผลลัพธ์ที่แสดง
```
▶️┃**See You Again** ` 3:49 `
> 📄 Best Songs 2023 (5/25)
```

## การใช้งานใน Commands อื่นๆ

### Queue Command
```typescript
export function createQueueDisplay(tracks: any[]): string[] {
    return tracks.map((track, index) => {
        let line = `${index + 1}. **${track.info.title}** - ${track.info.author}`;
        
        if (isFromPlaylist(track)) {
            const playlistName = formatPlaylistInfo(track, 'short');
            line += ` ${playlistName}`;
        }
        
        return line;
    });
}
```

### NowPlaying Command
```typescript
const embed = new EmbedBuilder()
    .setTitle('🎵 ขณะนี้กำลังเล่น')
    .setDescription(`**${track.info.title}**\nโดย: ${track.info.author}`);

// เพิ่ม field สำหรับ playlist
const playlistField = createPlaylistEmbedField(track);
if (playlistField) {
    embed.addFields(playlistField);
}
```

## ตัวอย่างการแสดงผล

### เพลงจาก Playlist
```
🎵 ขณะนี้กำลังเล่น
**See You Again**
โดย: Wiz Khalifa ft. Charlie Puth

📄 Playlist
**Best Songs 2023**
เพลงที่ 5 จาก 25 เพลง
```

### เพลงเดี่ยว
```
🎵 ขณะนี้กำลังเล่น  
**Single Song**
โดย: Artist Name

(ไม่มี playlist field)
```

## ข้อมูลเพิ่มเติม

### Type Definitions
```typescript
export interface PlaylistMetadata {
    playlistName?: string;
    playlistUrl?: string;
    isFromPlaylist?: boolean;
    playlistIndex?: number;
    playlistTotalTracks?: number;
}

export interface TrackWithPlaylist {
    playlistName?: string;
    playlistUrl?: string;
    isFromPlaylist?: boolean;
    playlistIndex?: number;
    playlistTotalTracks?: number;
}
```

### การใช้งานขั้นสูง
```typescript
// เช็คและแสดงข้อมูล playlist
function displayTrackInfo(track: any) {
    console.log(`🎵 ${track.info.title}`);
    
    if (isFromPlaylist(track)) {
        const metadata = getPlaylistMetadata(track);
        console.log(`📄 จาก: ${metadata.playlistName}`);
        console.log(`📊 ลำดับ: ${metadata.playlistIndex}/${metadata.playlistTotalTracks}`);
        console.log(`🔗 Playlist: ${metadata.playlistUrl}`);
    } else {
        console.log("🎵 เพลงเดี่ยว");
    }
}
```

ระบบนี้ช่วยให้ผู้ใช้รู้ว่าเพลงที่กำลังเล่นมาจาก playlist ใด และอยู่ในลำดับที่เท่าไหร่ ทำให้การใช้งานมีความชัดเจนและเป็นระเบียบมากขึ้น
