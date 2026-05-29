import { getPlaylistThumbnail } from './playlistThumbnail';
import { getPlaylistThumbnailSimple } from './playlistThumbnailSimple';
import { getBestPlaylistThumbnail } from './playlistThumbnailWebScraping';
import { getSpotifyPlaylistThumbnail, isSpotifyPlaylistUrl, isSpotifyUrl } from '../spotify/index';
import chalk from 'chalk';

export interface PlaylistThumbnailOptions {
    method?: 'web-scraping' | 'ytmusic-api' | 'simple' | 'auto';
    fallbackToVideo?: boolean;
    highQuality?: boolean;
}

/**
 * ฟังก์ชันหลักสำหรับดึง playlist thumbnail
 * @param playlistUrl - URL ของ playlist
 * @param videoThumbnail - thumbnail จากเพลงแรก (สำหรับ fallback)
 * @param options - ตัวเลือกการดึง thumbnail
 */
export async function getPlaylistThumbnailMain(
    playlistUrl: string, 
    videoThumbnail?: string,
    options: PlaylistThumbnailOptions = {}
): Promise<string | null> {
    const { 
        method = 'auto', 
        fallbackToVideo = true, 
        highQuality = true 
    } = options;

    let thumbnailUrl: string | null = null;

    try {
        // ตรวจสอบว่าเป็น Spotify playlist ก่อน
        if (isSpotifyPlaylistUrl(playlistUrl)) {
            console.log(`[${chalk.bold.yellowBright('DEBUG')}] Detected Spotify playlist, using Spotify API...`);
            thumbnailUrl = await getSpotifyPlaylistThumbnail(playlistUrl, {
                size: 'large',
                fallbackToDefault: true
            });
            
            if (thumbnailUrl) {
                console.log(`[${chalk.bold.yellowBright('DEBUG')}] Successfully got Spotify playlist thumbnail:`, thumbnailUrl);
                return thumbnailUrl;
            }

            console.log(`[${chalk.bold.yellowBright('DEBUG')}] Failed to get Spotify thumbnail, falling back...`);
        }

        // สำหรับ YouTube playlists
        switch (method) {
            case 'web-scraping':
                thumbnailUrl = await getBestPlaylistThumbnail(playlistUrl);
                break;
                
            case 'ytmusic-api':
                thumbnailUrl = await getPlaylistThumbnail(playlistUrl);
                break;
                
            case 'simple':
                thumbnailUrl = getPlaylistThumbnailSimple(playlistUrl);
                break;
                
            case 'auto':
            default:
                // ลองทุกวิธีตามลำดับ (สำหรับ YouTube)
                if (!isSpotifyUrl(playlistUrl)) {
                    thumbnailUrl = await getBestPlaylistThumbnail(playlistUrl);
                    
                    if (!thumbnailUrl) {
                        thumbnailUrl = await getPlaylistThumbnail(playlistUrl);
                    }
                    
                    if (!thumbnailUrl) {
                        thumbnailUrl = getPlaylistThumbnailSimple(playlistUrl);
                    }
                }
                break;
        }

        // หาก fallback เปิดใช้งาน และยังไม่มี thumbnail
        if (!thumbnailUrl && fallbackToVideo && videoThumbnail) {
            thumbnailUrl = videoThumbnail;
            
            // อัปเกรดคุณภาพหากต้องการ
            if (highQuality && thumbnailUrl.includes('mqdefault')) {
                thumbnailUrl = thumbnailUrl.replace('mqdefault', 'maxresdefault');
            }
        }

        return thumbnailUrl;
    } catch (error) {
        console.error('Error getting playlist thumbnail:', error);
        
        // Fallback ให้ใช้ thumbnail จากเพลงแรกถ้ามี
        if (fallbackToVideo && videoThumbnail) {
            let fallbackThumbnail = videoThumbnail;
            if (highQuality && fallbackThumbnail.includes('mqdefault')) {
                fallbackThumbnail = fallbackThumbnail.replace('mqdefault', 'maxresdefault');
            }
            return fallbackThumbnail;
        }
        
        return null;
    }
}

/**
 * ฟังก์ชันสำหรับตรวจสอบว่า URL เป็น playlist หรือไม่ (รองรับทั้ง YouTube และ Spotify)
 */
export function isPlaylistUrl(url: string): boolean {
    return (url.includes('list=') && 
            (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com'))) ||
           isSpotifyPlaylistUrl(url);
}

/**
 * ฟังก์ชันสำหรับดึง playlist ID จาก URL
 */
export function extractPlaylistId(url: string): string | null {
    const match = url.match(/[?&]list=([^&]+)/);
    return match ? match[1] : null;
}

/**
 * ฟังก์ชันสำหรับสร้าง thumbnail URL แบบ manual
 */
export function generatePlaylistThumbnailUrl(playlistId: string, quality: 'maxres' | 'hq' | 'mq' | 'default' = 'maxres'): string {
    const qualityMap = {
        'maxres': 'maxresdefault',
        'hq': 'hqdefault', 
        'mq': 'mqdefault',
        'default': 'default'
    };

    return `https://i.ytimg.com/vi/${playlistId}/${qualityMap[quality]}.jpg`;
}
