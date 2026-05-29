import { Innertube } from 'youtubei.js';

export async function getPlaylistThumbnailYTI(playlistUrl: string): Promise<string | null> {
    try {
        // สร้าง Innertube instance
        const youtube = await Innertube.create();

        // ดึง playlist ID จาก URL
        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            console.error('Invalid playlist URL format');
            return null;
        }

        const playlistId = playlistIdMatch[1];

        // ดึงข้อมูล playlist
        const playlist = await youtube.music.getPlaylist(playlistId);
        
        if (playlist && playlist.header) {
            // ลองหาจาก header หลายแบบ
            const header = playlist.header as any;
            if (header.thumbnail && header.thumbnail.thumbnails) {
                const thumbnails = header.thumbnail.thumbnails;
                const bestThumbnail = thumbnails[thumbnails.length - 1];
                return bestThumbnail.url;
            }
            
            // หรือลองจากข้อมูลอื่นๆ
            if ((playlist as any).sidebar && (playlist as any).sidebar.thumbnail) {
                const sidebarThumbnails = (playlist as any).sidebar.thumbnail.thumbnails;
                if (sidebarThumbnails && sidebarThumbnails.length > 0) {
                    const bestThumbnail = sidebarThumbnails[sidebarThumbnails.length - 1];
                    return bestThumbnail.url;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching playlist thumbnail with youtubei.js:', error);
        return null;
    }
}

// ฟังก์ชันสำหรับ YouTube Music playlists
export async function getYTMusicPlaylistThumbnail(playlistUrl: string): Promise<string | null> {
    try {
        const youtube = await Innertube.create();

        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            return null;
        }

        const playlistId = playlistIdMatch[1];
        
        // ใช้ YouTube Music API
        const playlist = await youtube.music.getPlaylist(playlistId);
        
        if (playlist?.header) {
            const header = playlist.header as any;
            if (header.thumbnail?.thumbnails) {
                const thumbnails = header.thumbnail.thumbnails;
                const bestThumbnail = thumbnails[thumbnails.length - 1];
                return bestThumbnail.url;
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching YT Music playlist thumbnail:', error);
        return null;
    }
}
