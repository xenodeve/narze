import { getPlaylistThumbnailMain, isPlaylistUrl, extractPlaylistId, generatePlaylistThumbnailUrl } from '../functions/youtube/index';

// ตัวอย่างการใช้งาน
async function examples() {
    const playlistUrl = 'https://music.youtube.com/playlist?list=PLqUySH4LapbDFxDzLQZ7OLiBKPnJCaO3b';
    
    console.log('=== ตัวอย่างการใช้งาน Playlist Thumbnail Functions ===\n');

    // ตรวจสอบว่าเป็น playlist URL หรือไม่
    console.log('1. ตรวจสอบ URL:', isPlaylistUrl(playlistUrl));
    
    // ดึง playlist ID
    const playlistId = extractPlaylistId(playlistUrl);
    console.log('2. Playlist ID:', playlistId);
    
    // สร้าง thumbnail URL แบบ manual
    if (playlistId) {
        console.log('3. Manual thumbnail URL:', generatePlaylistThumbnailUrl(playlistId, 'maxres'));
    }
    
    // วิธีที่ 1: Auto (ลองทุกวิธี)
    console.log('\n=== วิธีที่ 1: Auto (แนะนำ) ===');
    try {
        const thumbnail1 = await getPlaylistThumbnailMain(playlistUrl, undefined, {
            method: 'auto',
            fallbackToVideo: true,
            highQuality: true
        });
        console.log('Auto method result:', thumbnail1);
    } catch (error) {
        console.error('Auto method error:', error);
    }
    
    // วิธีที่ 2: Web Scraping เท่านั้น
    console.log('\n=== วิธีที่ 2: Web Scraping ===');
    try {
        const thumbnail2 = await getPlaylistThumbnailMain(playlistUrl, undefined, {
            method: 'web-scraping',
            fallbackToVideo: false
        });
        console.log('Web scraping result:', thumbnail2);
    } catch (error) {
        console.error('Web scraping error:', error);
    }
    
    // วิธีที่ 3: YTMusic API เท่านั้น
    console.log('\n=== วิธีที่ 3: YTMusic API ===');
    try {
        const thumbnail3 = await getPlaylistThumbnailMain(playlistUrl, undefined, {
            method: 'ytmusic-api',
            fallbackToVideo: false
        });
        console.log('YTMusic API result:', thumbnail3);
    } catch (error) {
        console.error('YTMusic API error:', error);
    }
    
    // วิธีที่ 4: Simple Pattern เท่านั้น
    console.log('\n=== วิธีที่ 4: Simple Pattern ===');
    try {
        const thumbnail4 = await getPlaylistThumbnailMain(playlistUrl, undefined, {
            method: 'simple',
            fallbackToVideo: false
        });
        console.log('Simple pattern result:', thumbnail4);
    } catch (error) {
        console.error('Simple pattern error:', error);
    }
    
    // วิธีที่ 5: ใช้ fallback
    console.log('\n=== วิธีที่ 5: ใช้ Fallback ===');
    const videoThumbnail = 'https://i.ytimg.com/vi/SAMPLE_VIDEO_ID/mqdefault.jpg';
    try {
        const thumbnail5 = await getPlaylistThumbnailMain(playlistUrl, videoThumbnail, {
            method: 'auto',
            fallbackToVideo: true,
            highQuality: true
        });
        console.log('With fallback result:', thumbnail5);
    } catch (error) {
        console.error('With fallback error:', error);
    }
}

// เรียกใช้ตัวอย่าง
// examples();

export { examples };
