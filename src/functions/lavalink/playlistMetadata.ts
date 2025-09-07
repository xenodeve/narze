// Utility functions สำหรับจัดการ Playlist metadata ใน tracks

export interface PlaylistMetadata {
    playlistName?: string;
    playlistUrl?: string;
    playlistThumbnail?: string;
    isFromPlaylist?: boolean;
    playlistIndex?: number;
    playlistTotalTracks?: number;
}

// Type extending สำหรับ Track ที่มี playlist metadata
export interface TrackWithPlaylist {
    playlistName?: string;
    playlistUrl?: string;
    playlistThumbnail?: string;
    isFromPlaylist?: boolean;
    playlistIndex?: number;
    playlistTotalTracks?: number;
}

/**
 * เพิ่ม playlist metadata ลงใน tracks
 * @param tracks - Array ของ tracks ที่จะเพิ่ม metadata
 * @param playlistName - ชื่อ playlist
 * @param playlistUrl - URL ของ playlist
 * @param playlistThumbnail - Thumbnail URL ของ playlist
 * @returns tracks ที่มี playlist metadata
 */
export function addPlaylistMetadata(
    tracks: any[], 
    playlistName: string, 
    playlistUrl: string,
    playlistThumbnail?: string | null
): any[] {
    return tracks.map((track, index) => {
        // เพิ่ม metadata ลงใน track object
        (track as any).playlistName = playlistName;
        (track as any).playlistUrl = playlistUrl;
        (track as any).playlistThumbnail = playlistThumbnail;
        (track as any).isFromPlaylist = true;
        (track as any).playlistIndex = index + 1;
        (track as any).playlistTotalTracks = tracks.length;
        
        return track;
    });
}

/**
 * ตรวจสอบว่า track มาจาก playlist หรือไม่
 * @param track - Track ที่จะตรวจสอบ
 * @returns boolean
 */
export function isFromPlaylist(track: any): boolean {
    return !!(track as any).isFromPlaylist;
}

/**
 * ดึงชื่อ playlist จาก track
 * @param track - Track ที่จะดึงชื่อ playlist
 * @returns ชื่อ playlist หรือ null
 */
export function getPlaylistName(track: any): string | null {
    return (track as any).playlistName || null;
}

/**
 * ดึง thumbnail playlist จาก track
 * @param track - Track ที่จะดึง thumbnail playlist
 * @returns Thumbnail URL ของ playlist หรือ null
 */
export function getPlaylistThumbnail(track: any): string | null {
    return (track as any).playlistThumbnail || null;
}

/**
 * ดึง URL playlist จาก track
 * @param track - Track ที่จะดึง URL playlist
 * @returns URL playlist หรือ null
 */
export function getPlaylistUrl(track: any): string | null {
    return (track as any).playlistUrl || null;
}

/**
 * ดึงข้อมูล playlist ทั้งหมดจาก track
 * @param track - Track ที่จะดึงข้อมูล
 * @returns PlaylistMetadata หรือ null
 */
export function getPlaylistMetadata(track: any): PlaylistMetadata | null {
    if (!isFromPlaylist(track)) {
        return null;
    }
    
    return {
        playlistName: (track as any).playlistName,
        playlistUrl: (track as any).playlistUrl,
        playlistThumbnail: (track as any).playlistThumbnail,
        isFromPlaylist: (track as any).isFromPlaylist,
        playlistIndex: (track as any).playlistIndex,
        playlistTotalTracks: (track as any).playlistTotalTracks
    };
}

/**
 * สร้างข้อความแสดงข้อมูล playlist สำหรับ track
 * @param track - Track ที่จะสร้างข้อความ
 * @param format - รูปแบบการแสดงผล ('short' | 'full' | 'index-only')
 * @returns ข้อความแสดงข้อมูล playlist
 */
export function formatPlaylistInfo(track: any, format: 'short' | 'full' | 'index-only' = 'short'): string {
    const metadata = getPlaylistMetadata(track);
    
    if (!metadata) {
        return '';
    }
    
    switch (format) {
        case 'short':
            // return `\`📄\` ${metadata.playlistName}`;
            return `จาก: \` ${metadata.playlistName} \``;
            
        case 'full':
            // return `\`📄\` **${metadata.playlistName}** (${metadata.playlistIndex}/${metadata.playlistTotalTracks})`;
            return `จาก: **${metadata.playlistName}** **(**${metadata.playlistIndex}/${metadata.playlistTotalTracks}**)**`;
            
        case 'index-only':
            return `\`(${metadata.playlistIndex}/${metadata.playlistTotalTracks})\``;
            
        default:
            // return `\`📄\` ${metadata.playlistName}`;
            return `จาก: ${metadata.playlistName}`;
    }
}

/**
 * สร้าง embed field สำหรับข้อมูล playlist
 * @param track - Track ที่จะสร้าง field
 * @returns Discord embed field object หรือ null
 */
export function createPlaylistEmbedField(track: any): { name: string; value: string; inline: boolean } | null {
    const metadata = getPlaylistMetadata(track);
    
    if (!metadata) {
        return null;
    }
    
    return {
        name: '\`📄\` Playlist',
        value: `**${metadata.playlistName}**\nเพลงที่ ${metadata.playlistIndex} จาก ${metadata.playlistTotalTracks} เพลง`,
        inline: true
    };
}
