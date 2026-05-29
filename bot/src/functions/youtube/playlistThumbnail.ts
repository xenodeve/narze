import YTMusic from 'ytmusic-api';

export async function getPlaylistThumbnail(playlistUrl: string): Promise<string | null> {
    try {
        // สร้าง YTMusic instance
        const ytmusic = new YTMusic();
        await ytmusic.initialize();

        // ดึง playlist ID จาก URL
        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            console.error('Invalid playlist URL format');
            return null;
        }

        const playlistId = playlistIdMatch[1];

        // ดึงข้อมูล playlist
        const playlist = await ytmusic.getPlaylist(playlistId);
        
        if (playlist && playlist.thumbnails && playlist.thumbnails.length > 0) {
            // เลือก thumbnail ที่มีความละเอียดสูงสุด
            const bestThumbnail = playlist.thumbnails[playlist.thumbnails.length - 1];
            return bestThumbnail.url;
        }

        return null;
    } catch (error) {
        console.error('Error fetching playlist thumbnail:', error);
        return null;
    }
}

// ฟังก์ชันสำหรับดึง thumbnail จาก YouTube playlist ID โดยตรง
export async function getYouTubePlaylistThumbnail(playlistId: string): Promise<string | null> {
    try {
        const ytmusic = new YTMusic();
        await ytmusic.initialize();

        const playlist = await ytmusic.getPlaylist(playlistId);
        
        if (playlist && playlist.thumbnails && playlist.thumbnails.length > 0) {
            // เลือก thumbnail ที่มีความละเอียดสูงสุด
            const bestThumbnail = playlist.thumbnails[playlist.thumbnails.length - 1];
            return bestThumbnail.url;
        }

        return null;
    } catch (error) {
        console.error('Error fetching YouTube playlist thumbnail:', error);
        return null;
    }
}

// ฟังก์ชันสำรองที่ใช้ YouTube Data API format
export function constructPlaylistThumbnailUrl(playlistId: string): string {
    // Format: https://i.ytimg.com/vi_webp/[PLAYLIST_ID]/maxresdefault.webp
    // หรือ https://img.youtube.com/vi/[FIRST_VIDEO_ID]/maxresdefault.jpg
    return `https://i.ytimg.com/vi_webp/${playlistId}/maxresdefault.webp`;
}

// ฟังก์ชันที่ใช้ YouTube API สำรอง
export async function getPlaylistThumbnailFromAPI(playlistUrl: string): Promise<string | null> {
    try {
        // ดึง playlist ID จาก URL
        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            return null;
        }

        const playlistId = playlistIdMatch[1];
        
        // ใช้ Google's unofficial API endpoint
        const apiUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=YOUR_API_KEY`;
        
        // Note: คุณต้องมี YouTube Data API key
        // หรือใช้วิธีอื่นแทน
        
        return constructPlaylistThumbnailUrl(playlistId);
    } catch (error) {
        console.error('Error constructing playlist thumbnail URL:', error);
        return null;
    }
}
