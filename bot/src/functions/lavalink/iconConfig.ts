import configjson from '../../config/config.json';
import { isFromPlaylist, getPlaylistThumbnail } from './playlistMetadata';
import { getArtistImage } from '../spotify/index';
import { client } from '../..';

export type IconType = 'botavatar' | 'userimage' | 'playlist_thumbnail' | 'artistImage';

export interface IconConfig {
    normal_track: IconType;
    playlist_display: IconType;
    playlist_track: IconType;
}

/**
 * ดึง iconURL ตาม configuration และ track type
 * @param track - Track object
 * @param userAvatar - User avatar URL
 * @param isPlaylistDisplay - แสดงเป็น playlist หรือไม่ (สำหรับ skipplay playlist)
 * @returns iconURL string หรือ Promise<string> สำหรับ artistImage
 */
export async function getIconURL(track: any, userAvatar: string, isPlaylistDisplay = false): Promise<string> {
    const config = configjson.icon_config as IconConfig;
    const defaultIcon = client.user?.displayAvatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png';
    
    let iconType: IconType;
    
    // กำหนด type ตาม context
    if (isPlaylistDisplay) {
        iconType = config.playlist_display;
    } else if (isFromPlaylist(track)) {
        iconType = config.playlist_track;
    } else {
        iconType = config.normal_track;
    }
    
    // คืนค่า iconURL ตาม type
    switch (iconType) {
        case 'botavatar':
            return defaultIcon; // Bot Avatar
            
        case 'userimage':
            return userAvatar || defaultIcon; // User Avatar (fallback เป็น Bot Avatar)
            
        case 'playlist_thumbnail':
            if (isFromPlaylist(track)) {
                const playlistThumbnail = getPlaylistThumbnail(track);
                return playlistThumbnail || userAvatar || defaultIcon; // Playlist Thumbnail (fallback เป็น User Avatar แล้ว Bot Avatar)
            }
            return userAvatar || defaultIcon; // ถ้าไม่ใช่ playlist ให้ใช้ User Avatar
            
        case 'artistImage':
            if (track?.info?.author) {
                try {
                    const artistImageUrl = await getArtistImage(track.info.author);
                    return artistImageUrl || userAvatar || defaultIcon; // Artist Image (fallback เป็น User Avatar แล้ว Bot Avatar)
                } catch (error) {
                    console.error('Error getting artist image:', error);
                    return userAvatar || defaultIcon;
                }
            }
            return userAvatar || defaultIcon; // ถ้าไม่มี artist ให้ใช้ User Avatar
            
        default:
            return defaultIcon; // Bot Avatar
    }
}

/**
 * ดึง iconURL สำหรับ playlist display (skipplay)
 * @param playlistThumbnail - Playlist thumbnail URL
 * @param userAvatar - User avatar URL
 * @param artistName - ชื่อศิลปิน (สำหรับ artistImage)
 * @returns iconURL string หรือ Promise<string> สำหรับ artistImage
 */
export async function getPlaylistDisplayIcon(
    playlistThumbnail: string | null, 
    userAvatar: string, 
    artistName?: string
): Promise<string> {
    const config = configjson.icon_config as IconConfig;
    const defaultIcon = client.user?.displayAvatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png';
    
    switch (config.playlist_display) {
        case 'botavatar':
            return defaultIcon; // Bot Avatar
            
        case 'userimage':
            return userAvatar || defaultIcon; // User Avatar (fallback เป็น Bot Avatar)
            
        case 'playlist_thumbnail':
            return playlistThumbnail || userAvatar || defaultIcon; // Playlist Thumbnail (fallback เป็น User Avatar แล้ว Bot Avatar)
            
        case 'artistImage':
            if (artistName) {
                try {
                    const artistImageUrl = await getArtistImage(artistName);
                    return artistImageUrl || userAvatar || defaultIcon; // Artist Image (fallback เป็น User Avatar แล้ว Bot Avatar)
                } catch (error) {
                    console.error('Error getting artist image for playlist display:', error);
                    return userAvatar || defaultIcon;
                }
            }
            return userAvatar || defaultIcon; // ถ้าไม่มี artist ให้ใช้ User Avatar
            
        default:
            return defaultIcon; // Bot Avatar
    }
}
