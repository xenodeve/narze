import { getPlaylistMetadata, formatPlaylistInfo, isFromPlaylist, createPlaylistEmbedField } from '../functions/lavalink/playlistMetadata';

// ตัวอย่างการใช้งาน Playlist Metadata

console.log('=== ตัวอย่างการใช้งาน Playlist Metadata ===\n');

// Mock track object สำหรับทดสอบ
const mockTrackFromPlaylist = {
    info: {
        title: 'See You Again',
        author: 'Wiz Khalifa ft. Charlie Puth',
        length: 229000,
        uri: 'https://www.youtube.com/watch?v=RgKAFK5djSk',
        thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/maxresdefault.jpg'
    },
    // Playlist metadata ที่เพิ่มเข้ามา
    playlistName: 'Best Songs 2023',
    playlistUrl: 'https://music.youtube.com/playlist?list=PLqUySH4LapbDFxDzLQZ7OLiBKPnJCaO3b',
    isFromPlaylist: true,
    playlistIndex: 5,
    playlistTotalTracks: 25
};

const mockSingleTrack = {
    info: {
        title: 'Single Song',
        author: 'Artist Name',
        length: 180000,
        uri: 'https://www.youtube.com/watch?v=abcd1234',
        thumbnail: 'https://i.ytimg.com/vi/abcd1234/maxresdefault.jpg'
    }
    // ไม่มี playlist metadata
};

function demonstratePlaylistMetadata() {
    console.log('1. ตรวจสอบว่า track มาจาก playlist หรือไม่:');
    console.log(`   Track 1 from playlist: ${isFromPlaylist(mockTrackFromPlaylist)}`);
    console.log(`   Track 2 single: ${isFromPlaylist(mockSingleTrack)}\n`);

    console.log('2. ดึงข้อมูล playlist metadata:');
    const metadata = getPlaylistMetadata(mockTrackFromPlaylist);
    console.log('   Metadata:', JSON.stringify(metadata, null, 2));
    console.log('');

    console.log('3. การแสดงข้อมูล playlist ในรูปแบบต่างๆ:');
    console.log(`   Short format: ${formatPlaylistInfo(mockTrackFromPlaylist, 'short')}`);
    console.log(`   Full format: ${formatPlaylistInfo(mockTrackFromPlaylist, 'full')}`);
    console.log(`   Index only: ${formatPlaylistInfo(mockTrackFromPlaylist, 'index-only')}\n`);

    console.log('4. สร้าง Discord embed field:');
    const embedField = createPlaylistEmbedField(mockTrackFromPlaylist);
    console.log('   Embed field:', JSON.stringify(embedField, null, 2));
    console.log('');

    console.log('5. ตัวอย่างการใช้ใน Discord embed description:');
    const trackTitle = mockTrackFromPlaylist.info.title;
    const playlistInfo = formatPlaylistInfo(mockTrackFromPlaylist, 'index-only');
    const playlistName = formatPlaylistInfo(mockTrackFromPlaylist, 'short');
    
    const description = `\`▶️\`┃**${trackTitle}**\n> ${playlistName} ${playlistInfo}`;
    console.log('   Description:', description);
    console.log('');

    console.log('6. ตัวอย่างการใช้ใน track queue display:');
    console.log('   🎵 **ขณะนี้กำลังเล่น:**');
    console.log(`   ${trackTitle}`);
    if (isFromPlaylist(mockTrackFromPlaylist)) {
        console.log(`   📄 จาก: ${formatPlaylistInfo(mockTrackFromPlaylist, 'full')}`);
    }
    console.log('');
}

// เรียกใช้การสาธิต
// demonstratePlaylistMetadata();

export { demonstratePlaylistMetadata };

// ตัวอย่างการใช้ใน trackStart event
export function createTrackStartMessage(track: any): string {
    let description = `\`▶️\`┃**${track.info.title}**`;
    
    if (isFromPlaylist(track)) {
        const playlistInfo = formatPlaylistInfo(track, 'index-only');
        const playlistName = formatPlaylistInfo(track, 'short');
        description += `\n> ${playlistName} ${playlistInfo}`;
    }
    
    return description;
}

// ตัวอย่างการใช้ใน queue command
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

// ตัวอย่างการใช้ใน nowplaying command
export function createNowPlayingEmbed(track: any) {
    const embedData = {
        title: '🎵 ขณะนี้กำลังเล่น',
        description: `**${track.info.title}**\nโดย: ${track.info.author}`,
        thumbnail: track.info.thumbnail,
        fields: []
    };

    // เพิ่ม field สำหรับ playlist หากมี
    const playlistField = createPlaylistEmbedField(track);
    if (playlistField) {
        embedData.fields.push(playlistField);
    }

    return embedData;
}
