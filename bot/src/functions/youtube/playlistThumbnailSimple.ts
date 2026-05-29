// วิธีง่ายๆ ในการดึง playlist thumbnail โดยใช้ pattern ที่ทราบ
export function getPlaylistThumbnailSimple(playlistUrl: string): string | null {
    try {
        // ดึง playlist ID จาก URL
        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            console.error('Invalid playlist URL format');
            return null;
        }

        const playlistId = playlistIdMatch[1];

        // รูปแบบ URL สำหรับ playlist thumbnail
        // YouTube ใช้ format นี้สำหรับ playlist thumbnails
        const thumbnailPatterns = [
            // High quality thumbnail
            `https://i.ytimg.com/vi_webp/${playlistId}/maxresdefault.webp`,
            // Standard quality thumbnail  
            `https://i.ytimg.com/vi/${playlistId}/maxresdefault.jpg`,
            // Medium quality thumbnail
            `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`,
            // Default thumbnail
            `https://i.ytimg.com/vi/${playlistId}/default.jpg`
        ];

        // คืนค่า URL แรกที่น่าจะใช้ได้
        return thumbnailPatterns[0];
    } catch (error) {
        console.error('Error constructing playlist thumbnail URL:', error);
        return null;
    }
}

// ฟังก์ชันที่ตรวจสอบว่า URL นั้นใช้ได้จริงหรือไม่
export async function getValidPlaylistThumbnail(playlistUrl: string): Promise<string | null> {
    try {
        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            return null;
        }

        const playlistId = playlistIdMatch[1];
        
        const thumbnailPatterns = [
            `https://i.ytimg.com/vi_webp/${playlistId}/maxresdefault.webp`,
            `https://i.ytimg.com/vi/${playlistId}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`,
            `https://i.ytimg.com/vi/${playlistId}/default.jpg`
        ];

        // ลองเช็คแต่ละ URL ว่าใช้ได้หรือไม่
        for (const thumbnailUrl of thumbnailPatterns) {
            try {
                const response = await fetch(thumbnailUrl, { method: 'HEAD' });
                if (response.ok) {
                    return thumbnailUrl;
                }
            } catch (error) {
                // ถ้า URL นี้ไม่ได้ ลองต่อไป
                continue;
            }
        }

        return null;
    } catch (error) {
        console.error('Error validating playlist thumbnail URL:', error);
        return null;
    }
}

// ฟังก์ชันสำหรับดึง thumbnail จาก video แรกใน playlist
export async function getPlaylistThumbnailFromFirstVideo(playlistUrl: string): Promise<string | null> {
    try {
        // ดึง playlist ID
        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            return null;
        }

        // ใช้ YouTube oEmbed API เพื่อดึงข้อมูล
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(playlistUrl)}&format=json`;
        
        const response = await fetch(oembedUrl);
        if (response.ok) {
            const data = await response.json() as any;
            if (data.thumbnail_url) {
                // แปลงเป็น maxresdefault หากเป็นไปได้
                return data.thumbnail_url.replace(/\/[a-z]+default\.jpg/, '/maxresdefault.jpg');
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching playlist thumbnail from first video:', error);
        return null;
    }
}
