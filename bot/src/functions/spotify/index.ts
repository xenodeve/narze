/**
 * Spotify API utilities
 * สำหรับดึงข้อมูลและ thumbnail จาก Spotify
 */

export interface SpotifyPlaylistData {
    id: string;
    name: string;
    description: string;
    images: Array<{
        url: string;
        height: number;
        width: number;
    }>;
    tracks: {
        total: number;
    };
    owner: {
        display_name: string;
    };
}

export interface SpotifyThumbnailOptions {
    size?: 'large' | 'medium' | 'small';
    fallbackToDefault?: boolean;
}

/**
 * ดึง Spotify Access Token
 */
async function getSpotifyAccessToken(): Promise<string | null> {
    try {
        // อ่าน client credentials จาก config
        const configPath = '../../../lavalink/application.yml';
        const fs = require('fs');
        const yaml = require('yaml');
        
        let clientId: string | null = null;
        let clientSecret: string | null = null;
        
        try {
            const yamlText = fs.readFileSync(require('path').resolve(__dirname, configPath), 'utf8');
            const config = yaml.parse(yamlText);
            
            clientId = config?.plugins?.lavasrc?.spotify?.clientId;
            clientSecret = config?.plugins?.lavasrc?.spotify?.clientSecret;
        } catch (error) {
            console.error('Error reading Lavalink config:', error);
            return null;
        }

        if (!clientId || !clientSecret) {
            console.error('Spotify credentials not found in Lavalink config');
            return null;
        }

        // เปลี่ยน placeholder values หากยังไม่ได้แก้ไข
        if (clientId.includes('YOUR_SPOTIFY') || clientSecret.includes('YOUR_SPOTIFY')) {
            console.error('Please update Spotify credentials in lavalink/application.yml');
            return null;
        }

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status}`);
        }

        const data = await response.json() as { access_token: string };
        return data.access_token;
    } catch (error) {
        console.error('Error getting Spotify access token:', error);
        return null;
    }
}

/**
 * แยก Spotify playlist ID จาก URL
 */
export function extractSpotifyPlaylistId(url: string): string | null {
    const patterns = [
        /spotify:playlist:([a-zA-Z0-9]+)/,
        /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

/**
 * ตรวจสอบว่า URL เป็น Spotify playlist หรือไม่
 */
export function isSpotifyPlaylistUrl(url: string): boolean {
    return url.includes('spotify') && (url.includes('/playlist/') || url.includes('playlist:'));
}

/**
 * ตรวจสอบว่า URL เป็น Spotify (ทุกประเภท) หรือไม่
 */
export function isSpotifyUrl(url: string): boolean {
    return url.includes('spotify.com') || url.includes('spotify:');
}

/**
 * ดึงข้อมูล Spotify playlist
 */
async function getSpotifyPlaylistData(playlistId: string): Promise<SpotifyPlaylistData | null> {
    try {
        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) {
            return null;
        }

        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status}`);
        }

        return await response.json() as SpotifyPlaylistData;
    } catch (error) {
        console.error('Error fetching Spotify playlist data:', error);
        return null;
    }
}

/**
 * ดึง thumbnail จาก Spotify playlist
 */
export async function getSpotifyPlaylistThumbnail(
    url: string, 
    options: SpotifyThumbnailOptions = {}
): Promise<string | null> {
    const { size = 'large', fallbackToDefault = true } = options;

    try {
        const playlistId = extractSpotifyPlaylistId(url);
        if (!playlistId) {
            console.error('Invalid Spotify playlist URL');
            return null;
        }

        const playlistData = await getSpotifyPlaylistData(playlistId);
        if (!playlistData || !playlistData.images || playlistData.images.length === 0) {
            return fallbackToDefault ? getSpotifyDefaultThumbnail() : null;
        }

        // เลือกขนาดรูปตามที่กำหนด
        let selectedImage = playlistData.images[0]; // Default ใช้รูปแรก

        switch (size) {
            case 'large':
                // หารูปที่ใหญ่ที่สุด (โดยปกติจะเป็นรูปแรก)
                selectedImage = playlistData.images.reduce((largest, current) => 
                    (current.height || 0) > (largest.height || 0) ? current : largest
                );
                break;
                
            case 'medium':
                // หารูปขนาดกลาง (ประมาณ 300x300)
                selectedImage = playlistData.images.find(img => 
                    (img.height || 0) >= 200 && (img.height || 0) <= 400
                ) || playlistData.images[1] || playlistData.images[0];
                break;
                
            case 'small':
                // หารูปที่เล็กที่สุด
                selectedImage = playlistData.images.reduce((smallest, current) => 
                    (current.height || Infinity) < (smallest.height || Infinity) ? current : smallest
                );
                break;
        }

        return selectedImage.url;
    } catch (error) {
        console.error('Error getting Spotify playlist thumbnail:', error);
        return fallbackToDefault ? getSpotifyDefaultThumbnail() : null;
    }
}

/**
 * สร้าง default thumbnail สำหรับ Spotify
 */
function getSpotifyDefaultThumbnail(): string {
    // ใช้ Spotify logo หรือรูปเริ่มต้น
    return 'https://developer.spotify.com/assets/branding-guidelines/icon1@2x.png';
}

/**
 * ดึง Spotify track thumbnail (สำหรับเพลงเดี่ยว)
 */
export async function getSpotifyTrackThumbnail(url: string): Promise<string | null> {
    try {
        const trackId = extractSpotifyTrackId(url);
        if (!trackId) {
            return null;
        }

        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) {
            return null;
        }

        const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status}`);
        }

        const trackData = await response.json() as {
            album: {
                images: Array<{ url: string; height: number; width: number }>;
            };
        };
        if (trackData.album && trackData.album.images && trackData.album.images.length > 0) {
            return trackData.album.images[0].url;
        }

        return null;
    } catch (error) {
        console.error('Error getting Spotify track thumbnail:', error);
        return null;
    }
}

/**
 * ดึง Spotify artist image
 */
export async function getSpotifyArtistImage(artistName: string): Promise<string | null> {
    try {
        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) {
            return null;
        }

        // ค้นหาศิลปิน
        const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!searchResponse.ok) {
            throw new Error(`Spotify search API error: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json() as {
            artists: {
                items: Array<{
                    id: string;
                    name: string;
                    images: Array<{
                        url: string;
                        height: number;
                        width: number;
                    }>;
                }>;
            };
        };

        if (searchData.artists.items.length === 0) {
            return null;
        }

        const artist = searchData.artists.items[0];
        
        // เลือกรูปที่มีขนาดเหมาะสม (ประมาณ 300x300 หรือใหญ่กว่า)
        if (artist.images && artist.images.length > 0) {
            // หารูปที่มีขนาดเหมาะสม หรือใช้รูปแรกถ้าไม่มี
            const suitableImage = artist.images.find(img => 
                (img.height || 0) >= 200 && (img.height || 0) <= 500
            ) || artist.images[0];
            
            return suitableImage.url;
        }

        return null;
    } catch (error) {
        console.error('Error getting Spotify artist image:', error);
        return null;
    }
}

/**
 * ดึง artist image จากหลายแหล่ง (Spotify, Last.fm, etc.)
 */
export async function getArtistImage(artistName: string): Promise<string | null> {
    try {
        // ลองดึงจาก Spotify ก่อน
        const spotifyImage = await getSpotifyArtistImage(artistName);
        if (spotifyImage) {
            return spotifyImage;
        }

        // สามารถเพิ่มแหล่งอื่นๆ ได้ที่นี่ เช่น Last.fm API
        // const lastfmImage = await getLastfmArtistImage(artistName);
        
        return null;
    } catch (error) {
        console.error('Error getting artist image:', error);
        return null;
    }
}

/**
 * ค้นหา track จาก Spotify และดึง thumbnail + artist image + URL
 * สำหรับใช้กับ Billboard tracks ที่ไม่มี thumbnail
 */
export async function searchSpotifyTrack(title: string, artist: string): Promise<{
    thumbnail: string | null;
    artistImage: string | null;
    url: string | null;
}> {
    try {
        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) {
            return { thumbnail: null, artistImage: null, url: null };
        }

        // ค้นหา track
        const query = `${title} ${artist}`;
        const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!searchResponse.ok) {
            throw new Error(`Spotify search API error: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json() as {
            tracks: {
                items: Array<{
                    external_urls: {
                        spotify: string;
                    };
                    album: {
                        images: Array<{ url: string; height: number; width: number }>;
                    };
                    artists: Array<{
                        id: string;
                        name: string;
                    }>;
                }>;
            };
        };

        if (searchData.tracks.items.length === 0) {
            return { thumbnail: null, artistImage: null, url: null };
        }

        const track = searchData.tracks.items[0];
        
        // ดึง Spotify URL
        const url = track.external_urls?.spotify || null;
        
        // ดึง thumbnail จาก album
        const thumbnail = track.album.images && track.album.images.length > 0 
            ? track.album.images[0].url 
            : null;

        // ดึง artist image (ใช้ชื่อศิลปินแรกจากผลลัพธ์)
        let artistImage: string | null = null;
        if (track.artists && track.artists.length > 0) {
            artistImage = await getSpotifyArtistImage(track.artists[0].name);
        }

        return { thumbnail, artistImage, url };
    } catch (error) {
        console.error('Error searching Spotify track:', error);
        return { thumbnail: null, artistImage: null, url: null };
    }
}

/**
 * แยก Spotify track ID จาก URL
 */
function extractSpotifyTrackId(url: string): string | null {
    const patterns = [
        /spotify:track:([a-zA-Z0-9]+)/,
        /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}
