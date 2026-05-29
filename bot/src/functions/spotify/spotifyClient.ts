/**
 * Spotify API Client
 * Handles authentication and API calls to Spotify Web API
 * Uses credentials from lavalink/application.yml
 */

import chalk from 'chalk';

// Spotify API configuration (from application.yml)
const SPOTIFY_CLIENT_ID = '2e815eaf9f384c918e818ecdc5412004';
const SPOTIFY_CLIENT_SECRET = 'd1e9cd4dcd994d2da96238b7826a3018';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// ================= Token Management =================
let accessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get access token for Spotify API (Client Credentials Flow)
 */
async function getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (accessToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
        return accessToken;
    }

    // Check if credentials are valid (not default placeholders)
    if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID.length < 32 || SPOTIFY_CLIENT_SECRET.length < 32) {
        console.warn(`[${chalk.bold.yellow('SPOTIFY')}] ⚠️ No valid Spotify credentials found. Using MOCK DATA mode.`);
        throw new Error('No valid credentials');
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] 🔑 Refreshing access token...`);

    try {
        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            throw new Error(`Token request failed: ${response.status}`);
        }

        const data = await response.json();
        accessToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000);

        console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Access token refreshed (expires in ${data.expires_in}s)`);
        return accessToken!;
    } catch (error) {
        console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Failed to get access token:`, error);
        throw error;
    }
}

// ================= API Methods =================

export interface SpotifyTrack {
    id: string;
    name: string;
    artists: { id?: string; name: string }[];
    album: {
        name: string;
        release_date: string;
        images: { url: string; width: number; height: number }[];
    };
    duration_ms: number;
    external_urls: { spotify: string };
    isrc?: string;
}

export interface SpotifyPlaylistTrack {
    added_at: string;
    track: SpotifyTrack;
}

export interface SpotifyPlaylist {
    id: string;
    name: string;
    owner: { display_name: string };
    images: { url: string }[];
    tracks: {
        total: number;
        items: SpotifyPlaylistTrack[];
        next: string | null;
    };
}

/**
 * Get playlist with tracks from Spotify API
 * Handles pagination for playlists > 100 tracks
 */
export async function getPlaylist(playlistId: string): Promise<SpotifyPlaylist | null> {
    const token = await getAccessToken();

    console.log(`[${chalk.bold.green('SPOTIFY')}] 📋 Fetching playlist: ${playlistId}`);

    try {
        const response = await fetch(
            `${SPOTIFY_API_BASE}/playlists/${playlistId}?fields=id,name,owner,images,tracks(total,items(added_at,track(id,name,artists,album,duration_ms,external_urls)))`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!response.ok) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Playlist fetch failed: ${response.status}`);
            return null;
        }

        const playlist: SpotifyPlaylist = await response.json();
        console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Got playlist: "${playlist.name}" (${playlist.tracks.total} tracks)`);

        // Handle pagination if more than 100 tracks
        if (playlist.tracks.total > playlist.tracks.items.length) {
            const allTracks = [...playlist.tracks.items];
            let nextUrl: string | null = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?offset=100&limit=100&fields=items(added_at,track(id,name,artists,album,duration_ms,external_urls)),next`;

            while (nextUrl && allTracks.length < playlist.tracks.total) {
                console.log(`[${chalk.bold.green('SPOTIFY')}] 📄 Fetching more tracks... (${allTracks.length}/${playlist.tracks.total})`);
                
                const pageResponse = await fetch(nextUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!pageResponse.ok) break;

                const pageData = await pageResponse.json();
                allTracks.push(...pageData.items);
                nextUrl = pageData.next;
            }

            playlist.tracks.items = allTracks;
            console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Fetched all ${allTracks.length} tracks`);
        }

        return playlist;
    } catch (error) {
        console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error fetching playlist:`, error);
        return null;
    }
}

/**
 * Get multiple tracks by IDs (max 50 per request)
 * Returns album info for each track
 */
export async function getTracks(trackIds: string[]): Promise<Map<string, SpotifyTrack>> {
    const token = await getAccessToken();
    const result = new Map<string, SpotifyTrack>();

    // Batch requests (max 50 per request)
    const batches: string[][] = [];
    for (let i = 0; i < trackIds.length; i += 50) {
        batches.push(trackIds.slice(i, i + 50));
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] 🎵 Fetching ${trackIds.length} tracks in ${batches.length} batch(es)`);

    for (const batch of batches) {
        try {
            const response = await fetch(
                `${SPOTIFY_API_BASE}/tracks?ids=${batch.join(',')}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );

            if (!response.ok) continue;

            const data = await response.json();
            for (const track of data.tracks) {
                if (track) {
                    result.set(track.id, track);
                }
            }
        } catch (error) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error fetching tracks batch:`, error);
        }
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Got ${result.size} tracks`);
    return result;
}

/**
 * Extract playlist ID from various Spotify URL formats
 */
export function extractPlaylistId(url: string): string | null {
    // https://open.spotify.com/playlist/3vfE1vVzKjQugGDYJARsGU
    // https://open.spotify.com/playlist/3vfE1vVzKjQugGDYJARsGU?si=...
    const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

/**
 * Extract track ID from Spotify URI or URL
 */
export function extractTrackId(uriOrUrl: string): string | null {
    // spotify:track:3ciSgo8Lw8Us7psQHG5YBO
    // https://open.spotify.com/track/3ciSgo8Lw8Us7psQHG5YBO
    const uriMatch = uriOrUrl.match(/track[:/]([a-zA-Z0-9]+)/);
    return uriMatch ? uriMatch[1] : null;
}

/**
 * Extract artist ID from Spotify URI or URL
 */
export function extractArtistId(uriOrUrl: string): string | null {
    // spotify:artist:3ciSgo8Lw8Us7psQHG5YBO
    // https://open.spotify.com/artist/3ciSgo8Lw8Us7psQHG5YBO
    const match = uriOrUrl.match(/artist[:/]([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

/**
 * Extract album ID from Spotify URI or URL
 */
export function extractAlbumId(uriOrUrl: string): string | null {
    // spotify:album:3ciSgo8Lw8Us7psQHG5YBO
    // https://open.spotify.com/album/3ciSgo8Lw8Us7psQHG5YBO
    const match = uriOrUrl.match(/album[:/]([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

// ================= Artist Types =================

export interface SpotifyArtist {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
    followers: { total: number };
    genres: string[];
    external_urls: { spotify: string };
}

export interface SpotifyAlbum {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    images: { url: string; width: number; height: number }[];
    release_date: string;
    total_tracks: number;
    external_urls: { spotify: string };
}

// ================= Artist API Methods =================

/**
 * Get multiple artists by IDs (max 50 per request)
 */
export async function getArtists(artistIds: string[]): Promise<Map<string, SpotifyArtist>> {
    if (artistIds.length === 0) return new Map();
    
    const result = new Map<string, SpotifyArtist>();
    
    // Attempt to get token - if fails, return mock data
    let token: string;
    try {
        token = await getAccessToken();
    } catch {
        // Return mock artists
        console.log(`[${chalk.bold.yellow('SPOTIFY')}] ⚠️ Using MOCK DATA for getArtists`);
        for (const id of artistIds) {
            result.set(id, {
                id,
                name: 'Imagine Dragons (Mock)',
                images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb920dc1f617550de8388f368e', width: 640, height: 640 }],
                followers: { total: 50000000 },
                genres: ['pop', 'rock'],
                external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
            });
        }
        return result;
    }

    // Batch requests (max 50 per request)
    const batches: string[][] = [];
    for (let i = 0; i < artistIds.length; i += 50) {
        batches.push(artistIds.slice(i, i + 50));
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] 👤 Fetching ${artistIds.length} artists in ${batches.length} batch(es)`);

    for (const batch of batches) {
        try {
            const response = await fetch(
                `${SPOTIFY_API_BASE}/artists?ids=${batch.join(',')}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );

            if (!response.ok) continue;

            const data = await response.json();
            for (const artist of data.artists) {
                if (artist) {
                    result.set(artist.id, artist);
                }
            }
        } catch (error) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error fetching artists batch:`, error);
        }
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Got ${result.size} artists`);
    return result;
}

/**
 * Get artist's top tracks
 */
export async function getArtistTopTracks(artistId: string, market: string = 'TH'): Promise<SpotifyTrack[]> {
    let token: string;
    try {
        token = await getAccessToken();
    } catch {
        console.log(`[${chalk.bold.yellow('SPOTIFY')}] ⚠️ Using MOCK DATA for top tracks`);
        // Return mock tracks
        return Array(5).fill(null).map((_, i) => ({
            id: `mock-track-${i}`,
            name: `Mock Song ${i + 1}`,
            artists: [{ name: 'Imagine Dragons (Mock)' }],
            album: {
                name: 'Mock Album',
                release_date: '2023-01-01',
                images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb920dc1f617550de8388f368e', width: 640, height: 640 }]
            },
            duration_ms: 180000,
            external_urls: { spotify: 'https://open.spotify.com/track/mock' }
        }));
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] 🎵 Fetching top tracks for artist: ${artistId}`);

    try {
        const response = await fetch(
            `${SPOTIFY_API_BASE}/artists/${artistId}/top-tracks?market=${market}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!response.ok) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Top tracks fetch failed: ${response.status}`);
            return [];
        }

        const data = await response.json();
        console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Got ${data.tracks?.length || 0} top tracks`);
        return data.tracks || [];
    } catch (error) {
        console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error fetching top tracks:`, error);
        return [];
    }
}

/**
 * Get artist's albums
 */
export async function getArtistAlbums(artistId: string, limit: number = 20): Promise<SpotifyAlbum[]> {
    let token: string;
    try {
        token = await getAccessToken();
    } catch {
        console.log(`[${chalk.bold.yellow('SPOTIFY')}] ⚠️ Using MOCK DATA for albums`);
        // Return mock albums
        return Array(6).fill(null).map((_, i) => ({
            id: `mock-album-${i}`,
            name: `Mock Album ${i + 1}`,
            artists: [{ id: 'mock-artist', name: 'Mock Artist' }],
            images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb920dc1f617550de8388f368e', width: 640, height: 640 }],
            release_date: '2023-01-01',
            total_tracks: 12,
            external_urls: { spotify: 'https://open.spotify.com/album/mock' }
        }));
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] 💿 Fetching albums for artist: ${artistId}`);

    try {
        const response = await fetch(
            `${SPOTIFY_API_BASE}/artists/${artistId}/albums?include_groups=album,single&limit=${limit}&market=TH`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!response.ok) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Albums fetch failed: ${response.status}`);
            return [];
        }

        const data = await response.json();
        console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Got ${data.items?.length || 0} albums`);
        return data.items || [];
    } catch (error) {
        console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error fetching albums:`, error);
        return [];
    }
}

/**
 * Get album tracks (with caching)
 */
export async function getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
    // Import cache functions dynamically to avoid circular deps
    const { getAlbumDetail, setAlbumDetail } = await import('./spotifyAlbumCache');
    
    // Check cache first
    const cached = getAlbumDetail(albumId);
    if (cached) {
        console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 📦 Cache HIT for album: ${albumId}`);
        // Convert cached format back to SpotifyTrack format
        return cached.tracks.map(t => ({
            id: t.id,
            name: t.name,
            artists: [{ name: t.artistName }],
            album: {
                name: cached.albumName,
                release_date: cached.releaseDate,
                images: cached.imageUrl ? [{ url: cached.imageUrl, width: 640, height: 640 }] : []
            },
            duration_ms: t.duration,
            external_urls: { spotify: `https://open.spotify.com/track/${t.id}` }
        }));
    }

    let token: string;
    try {
        token = await getAccessToken();
    } catch {
        console.log(`[${chalk.bold.yellow('SPOTIFY')}] ⚠️ Using MOCK DATA for album tracks`);
        return Array(8).fill(null).map((_, i) => ({
            id: `mock-album-track-${i}`,
            name: `Album Track ${i + 1}`,
            artists: [{ name: 'Imagine Dragons (Mock)' }],
            album: {
                name: 'Mock Album',
                release_date: '2023-01-01',
                images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb920dc1f617550de8388f368e', width: 640, height: 640 }]
            },
            duration_ms: 200000,
            external_urls: { spotify: 'https://open.spotify.com/track/mock' }
        }));
    }

    console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 🔍 Cache MISS, fetching album: ${albumId}`);

    try {
        // First get the album to get full track info
        const response = await fetch(
            `${SPOTIFY_API_BASE}/albums/${albumId}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!response.ok) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Album fetch failed: ${response.status}`);
            return [];
        }

        const album = await response.json();
        
        // Get full track details
        const trackIds = album.tracks.items.map((t: any) => t.id);
        const fullTracks = await getTracks(trackIds);
        
        const trackArray = Array.from(fullTracks.values());
        
        // Cache the result
        setAlbumDetail(albumId, {
            albumId,
            albumName: album.name,
            artistName: album.artists?.[0]?.name || 'Unknown',
            artistId: album.artists?.[0]?.id,
            imageUrl: album.images?.[0]?.url,
            releaseDate: album.release_date,
            spotifyUrl: album.external_urls?.spotify,
            tracks: trackArray.map(t => ({
                id: t.id,
                name: t.name,
                artistName: t.artists?.[0]?.name || 'Unknown',
                duration: t.duration_ms,
                uri: `spotify:track:${t.id}`
            }))
        });
        
        console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Got ${trackArray.length} album tracks`);
        return trackArray;
    } catch (error) {
        console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error fetching album tracks:`, error);
        return [];
    }
}

/**
 * Search Spotify for artists and albums (for enriching Lavalink search results)
 */
export async function searchSpotify(
    query: string, 
    types: ('artist' | 'album')[] = ['artist', 'album'],
    limit: number = 5
): Promise<{ artists: SpotifyArtist[]; albums: SpotifyAlbum[] }> {
    let token: string;
    try {
        token = await getAccessToken();
    } catch {
        console.log(`[${chalk.bold.yellow('SPOTIFY')}] ⚠️ Using MOCK DATA for Search`);
        // Return mock search results
        return {
            artists: [{
                id: 'mock-artist-1',
                name: 'Imagine Dragons (Mock Result)',
                images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb920dc1f617550de8388f368e', width: 640, height: 640 }],
                followers: { total: 12345678 },
                genres: ['pop rock', 'alternative rock'],
                external_urls: { spotify: 'https://open.spotify.com/artist/mock' }
            }],
            albums: [{
                id: 'mock-album-1',
                name: 'Evolve (Mock Result)',
                artists: [{ id: 'mock-artist-1', name: 'Imagine Dragons (Mock)' }],
                images: [{ url: 'https://i.scdn.co/image/ab67616d0000b273da5d5aeeabacacc1263c0f4b', width: 640, height: 640 }],
                release_date: '2017-06-23',
                total_tracks: 11,
                external_urls: { spotify: 'https://open.spotify.com/album/mock' }
            }]
        };
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] 🔍 Searching: "${query}" (types: ${types.join(', ')})`);

    try {
        const response = await fetch(
            `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=${types.join(',')}&limit=${limit}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!response.ok) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Search failed: ${response.status}`);
            return { artists: [], albums: [] };
        }

        const data = await response.json();
        
        const result = {
            artists: data.artists?.items || [],
            albums: data.albums?.items || []
        };

        console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Found ${result.artists.length} artists, ${result.albums.length} albums`);
        return result;
    } catch (error) {
        console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error searching:`, error);
        return { artists: [], albums: [] };
    }
}

/**
 * Search Spotify for tracks directly (for spotify-api mode)
 * Returns tracks from Spotify Web API instead of Lavalink
 */
export async function searchSpotifyTracks(
    query: string,
    limit: number = 10
): Promise<SpotifyTrack[]> {
    let token: string;
    try {
        token = await getAccessToken();
    } catch {
        console.log(`[${chalk.bold.yellow('SPOTIFY')}] ⚠️ Using MOCK DATA for Track Search`);
        return Array(5).fill(null).map((_, i) => ({
            id: `mock-track-${i}`,
            name: `Mock Song ${i + 1}`,
            artists: [{ id: 'mock-artist', name: 'Imagine Dragons (Mock)' }],
            album: {
                name: 'Mock Album',
                release_date: '2023-01-01',
                images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb920dc1f617550de8388f368e', width: 640, height: 640 }]
            },
            duration_ms: 200000,
            external_urls: { spotify: 'https://open.spotify.com/track/mock' }
        }));
    }

    console.log(`[${chalk.bold.green('SPOTIFY')}] 🔍 Searching tracks: "${query}"`);

    try {
        const response = await fetch(
            `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&market=TH`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!response.ok) {
            console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Track search failed: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const tracks = data.tracks?.items || [];

        console.log(`[${chalk.bold.green('SPOTIFY')}] ✅ Found ${tracks.length} tracks`);
        return tracks;
    } catch (error) {
        console.error(`[${chalk.bold.red('SPOTIFY')}] ❌ Error searching tracks:`, error);
        return [];
    }
}
