import axios from 'axios';

export async function getPlaylistThumbnailWebScraping(playlistUrl: string): Promise<string | null> {
    try {
        // ดึง playlist ID จาก URL
        const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
        if (!playlistIdMatch) {
            console.error('Invalid playlist URL format');
            return null;
        }

        // ดึงหน้าเว็บของ playlist
        const response = await axios.get(playlistUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const html = response.data;

        // หา thumbnail URL จาก meta tags
        const metaImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (metaImageMatch) {
            let thumbnailUrl = metaImageMatch[1];
            
            // แปลงเป็น high quality หากเป็นไปได้
            if (thumbnailUrl.includes('hqdefault')) {
                thumbnailUrl = thumbnailUrl.replace('hqdefault', 'maxresdefault');
            } else if (thumbnailUrl.includes('mqdefault')) {
                thumbnailUrl = thumbnailUrl.replace('mqdefault', 'maxresdefault');
            }
            
            return thumbnailUrl;
        }

        // หา thumbnail URL จาก JSON data ในหน้าเว็บ
        const jsonMatch = html.match(/var ytInitialData = ({.*?});/);
        if (jsonMatch) {
            try {
                const data = JSON.parse(jsonMatch[1]);
                
                // ค้นหา thumbnail ในโครงสร้างข้อมูล
                const sidebar = data?.sidebar?.playlistSidebarRenderer?.items;
                if (sidebar && sidebar.length > 0) {
                    const primarySidebar = sidebar[0]?.playlistSidebarPrimaryInfoRenderer;
                    if (primarySidebar?.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails) {
                        const thumbnails = primarySidebar.thumbnailRenderer.playlistVideoThumbnailRenderer.thumbnail.thumbnails;
                        const bestThumbnail = thumbnails[thumbnails.length - 1];
                        return bestThumbnail.url;
                    }
                }

                // หาจากส่วน header
                const header = data?.header?.playlistHeaderRenderer;
                if (header?.playButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint) {
                    const videoId = header.playButton.buttonRenderer.navigationEndpoint.watchEndpoint.videoId;
                    if (videoId) {
                        return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
                    }
                }

            } catch (error) {
                console.error('Error parsing JSON data:', error);
            }
        }

        return null;
    } catch (error) {
        console.error('Error web scraping playlist thumbnail:', error);
        return null;
    }
}

// ฟังก์ชันที่รวมทุกวิธีเข้าด้วยกัน
export async function getBestPlaylistThumbnail(playlistUrl: string): Promise<string | null> {
    try {
        // วิธีที่ 1: Web scraping (แน่นอนที่สุด)
        let thumbnailUrl = await getPlaylistThumbnailWebScraping(playlistUrl);
        
        // วิธีที่ 2: ใช้ pattern หาก web scraping ไม่ได้
        if (!thumbnailUrl) {
            const playlistIdMatch = playlistUrl.match(/[?&]list=([^&]+)/);
            if (playlistIdMatch) {
                const playlistId = playlistIdMatch[1];
                thumbnailUrl = `https://i.ytimg.com/vi_webp/${playlistId}/maxresdefault.webp`;
            }
        }

        return thumbnailUrl;
    } catch (error) {
        console.error('Error getting best playlist thumbnail:', error);
        return null;
    }
}
