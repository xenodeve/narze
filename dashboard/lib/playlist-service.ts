/**
 * Playlist Service - Client-side API wrapper
 * Uses Bot Server API (with high-performance cache layer)
 * 
 * Flow: Dashboard -> Bot API -> Cache (instant) -> Firebase (batched)
 */

export interface PlaylistTrack {
  title: string;
  artist: string;
  duration?: number;
  thumbnail?: string;
  uri?: string;
  album?: string;      // Album name
  addedAt?: string;    // ISO date string when track was added
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  description?: string;
  thumbnail?: string;
  trackCount: number;
  tracks: PlaylistTrack[];
  sourcePlatform?: 'spotify' | 'youtube' | 'custom';
  sourceUrl?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface PlaylistInput {
  userId: string;
  name: string;
  description?: string;
  thumbnail?: string;
  tracks: PlaylistTrack[];
  sourcePlatform?: 'spotify' | 'youtube' | 'custom';
  sourceUrl?: string;
}

// Bot API URL (uses high-performance cache)
const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

/**
 * Create a new playlist
 */
export async function createPlaylist(input: PlaylistInput): Promise<Playlist> {
  try {
    const response = await fetch(`${BOT_API_URL}/api/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('[Playlist] Bot returned non-JSON response - bot may be offline');
      throw new Error('Bot appears to be offline');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create playlist');
    }

    const data = await response.json();
    return data.playlist;
  } catch (err: any) {
    if (err?.name === 'TypeError' || err?.message?.includes('fetch')) {
      console.warn('[Playlist] Network error - bot may be offline');
      throw new Error('Bot appears to be offline');
    }
    throw err;
  }
}

/**
 * Get a playlist by ID
 */
export async function getPlaylist(playlistId: string): Promise<Playlist | null> {
  try {
    const response = await fetch(`${BOT_API_URL}/api/playlists/${playlistId}`);

    if (response.status === 404) {
      return null;
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('[Playlist] Bot returned non-JSON response - bot may be offline');
      return null;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch playlist');
    }

    const data = await response.json();
    return data.playlist;
  } catch (err: any) {
    if (err?.name === 'TypeError' || err?.message?.includes('fetch')) {
      console.warn('[Playlist] Network error - bot may be offline');
      return null;
    }
    throw err;
  }
}

/**
 * Get all playlists for a user
 */
export async function getUserPlaylists(userId: string): Promise<Playlist[]> {
  try {
    const response = await fetch(`${BOT_API_URL}/api/playlists?userId=${encodeURIComponent(userId)}`);

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('[Playlist] Bot returned non-JSON response - bot may be offline');
      return [];
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch playlists');
    }

    const data = await response.json();
    console.log(`[Playlist] Fetched ${data.playlists?.length || 0} playlists (source: ${data.source})`);
    return data.playlists || [];
  } catch (err: any) {
    if (err?.name === 'TypeError' || err?.message?.includes('fetch')) {
      console.warn('[Playlist] Network error - bot may be offline');
      return [];
    }
    throw err;
  }
}

/**
 * Update a playlist
 */
export async function updatePlaylist(playlistId: string, updates: Partial<PlaylistInput>): Promise<void> {
  try {
    const response = await fetch(`${BOT_API_URL}/api/playlists/${playlistId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('[Playlist] Bot returned non-JSON response - bot may be offline');
      throw new Error('Bot appears to be offline');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to update playlist');
    }
  } catch (err: any) {
    if (err?.name === 'TypeError' || err?.message?.includes('fetch')) {
      console.warn('[Playlist] Network error - bot may be offline');
      throw new Error('Bot appears to be offline');
    }
    throw err;
  }
}

/**
 * Delete a playlist
 */
export async function deletePlaylist(playlistId: string): Promise<void> {
  try {
    const response = await fetch(`${BOT_API_URL}/api/playlists/${playlistId}`, {
      method: 'DELETE',
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('[Playlist] Bot returned non-JSON response - bot may be offline');
      throw new Error('Bot appears to be offline');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to delete playlist');
    }
  } catch (err: any) {
    if (err?.name === 'TypeError' || err?.message?.includes('fetch')) {
      console.warn('[Playlist] Network error - bot may be offline');
      throw new Error('Bot appears to be offline');
    }
    throw err;
  }
}

/**
 * Count user's playlists
 */
export async function countUserPlaylists(userId: string): Promise<number> {
  const playlists = await getUserPlaylists(userId);
  return playlists.length;
}

/**
 * Get playlist cache stats (for debugging)
 */
export async function getPlaylistCacheStats() {
  const response = await fetch(`${BOT_API_URL}/api/playlist-stats`);
  if (!response.ok) return null;
  return response.json();
}
