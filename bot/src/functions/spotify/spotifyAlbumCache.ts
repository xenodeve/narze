/**
 * Spotify Album Cache
 * Caches album info from Spotify API to avoid repeated calls
 * Uses In-Memory + JSON file for persistence
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

// ================= Configuration =================
const CACHE_DIR = path.join(__dirname, '../../../cache');
const CACHE_FILE = path.join(CACHE_DIR, 'spotify-album-cache.json');

// Cache TTL: 7 days (album info rarely changes)
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// Auto-save interval: 5 minutes
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

// ================= Types =================
export interface CachedAlbumInfo {
    albumName: string;
    albumReleaseDate?: string;
    albumArtUrl?: string;
    addedAt?: string;  // When track was added to playlist
    cachedAt: number;
}

// NEW: Album Tracks Cache (albumId → full album data with tracks)
export interface CachedAlbumTrack {
    id: string;
    name: string;
    artistName: string;
    duration: number;
    uri?: string;
}

export interface CachedAlbumDetail {
    albumId: string;
    albumName: string;
    artistName: string;
    artistId?: string;
    imageUrl?: string;
    releaseDate?: string;
    spotifyUrl?: string;
    tracks: CachedAlbumTrack[];
    cachedAt: number;
}

interface CacheData {
    // Key: Spotify track ID
    tracks: Record<string, CachedAlbumInfo>;
    // NEW: Key: Spotify album ID
    albums: Record<string, CachedAlbumDetail>;
    lastUpdated: number;
}

// ================= In-Memory Cache =================
const albumCache = new Map<string, CachedAlbumInfo>();
// NEW: Album Tracks Cache
const albumTracksCache = new Map<string, CachedAlbumDetail>();
let isDirty = false;
let debounceSaveTimer: NodeJS.Timeout | null = null;

// Debounce delay: 30 seconds
const DEBOUNCE_DELAY = 30 * 1000;

// ================= Helper Functions =================

/**
 * Schedule a debounced save - saves after 30s of no changes
 */
function scheduleDebouncedSave(): void {
    if (debounceSaveTimer) {
        clearTimeout(debounceSaveTimer);
    }
    debounceSaveTimer = setTimeout(() => {
        if (isDirty) {
            saveToJson();
        }
        debounceSaveTimer = null;
    }, DEBOUNCE_DELAY);
}

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] Created cache directory`);
    }
}

// ================= Save/Load =================

/**
 * Save cache to JSON file
 */
export function saveToJson(): boolean {
    try {
        ensureCacheDir();

        const data: CacheData = {
            tracks: {},
            albums: {},
            lastUpdated: Date.now()
        };

        albumCache.forEach((info, trackId) => {
            data.tracks[trackId] = info;
        });

        albumTracksCache.forEach((detail, albumId) => {
            data.albums[albumId] = detail;
        });

        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        isDirty = false;

        console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 💾 Saved ${albumCache.size} track entries, ${albumTracksCache.size} album entries`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('ALBUM CACHE')}] ❌ Failed to save:`, error);
        return false;
    }
}

/**
 * Load cache from JSON file
 */
export function loadFromJson(): boolean {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            console.log(`[${chalk.bold.yellow('ALBUM CACHE')}] 📂 No cache file found`);
            return false;
        }

        const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        let trackLoadedCount = 0;
        let trackExpiredCount = 0;
        let albumLoadedCount = 0;
        let albumExpiredCount = 0;

        // Load track→album info
        for (const [trackId, info] of Object.entries(data.tracks || {})) {
            if (Date.now() - info.cachedAt > CACHE_TTL) {
                trackExpiredCount++;
                continue;
            }
            albumCache.set(trackId, info);
            trackLoadedCount++;
        }

        // Load album→tracks
        for (const [albumId, detail] of Object.entries(data.albums || {})) {
            if (Date.now() - detail.cachedAt > CACHE_TTL) {
                albumExpiredCount++;
                continue;
            }
            albumTracksCache.set(albumId, detail);
            albumLoadedCount++;
        }

        console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 📂 Loaded ${trackLoadedCount} track entries (${trackExpiredCount} expired), ${albumLoadedCount} album entries (${albumExpiredCount} expired)`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('ALBUM CACHE')}] ❌ Failed to load:`, error);
        return false;
    }
}

// ================= Cache Operations =================

/**
 * Get album info from cache
 */
export function getAlbumInfo(trackId: string): CachedAlbumInfo | null {
    const info = albumCache.get(trackId);
    
    if (!info) return null;
    
    // Check TTL
    if (Date.now() - info.cachedAt > CACHE_TTL) {
        albumCache.delete(trackId);
        return null;
    }
    
    return info;
}

/**
 * Set album info in cache
 */
export function setAlbumInfo(trackId: string, info: Omit<CachedAlbumInfo, 'cachedAt'>): void {
    albumCache.set(trackId, {
        ...info,
        cachedAt: Date.now()
    });
    isDirty = true;
}

/**
 * Batch set album info
 */
export function setAlbumInfoBatch(entries: Map<string, Omit<CachedAlbumInfo, 'cachedAt'>>): void {
    const now = Date.now();
    entries.forEach((info, trackId) => {
        albumCache.set(trackId, {
            ...info,
            cachedAt: now
        });
    });
    isDirty = true;
    
    console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 📝 Cached ${entries.size} track→album entries`);
}

/**
 * Get missing track IDs (not in cache or expired)
 */
export function getMissingTrackIds(trackIds: string[]): string[] {
    return trackIds.filter(id => !getAlbumInfo(id));
}

// ================= Album Detail Cache Operations =================

/**
 * Get album detail (with tracks) from cache
 */
export function getAlbumDetail(albumId: string): CachedAlbumDetail | null {
    const detail = albumTracksCache.get(albumId);
    
    if (!detail) return null;
    
    // Check TTL
    if (Date.now() - detail.cachedAt > CACHE_TTL) {
        albumTracksCache.delete(albumId);
        return null;
    }
    
    return detail;
}

/**
 * Set album detail (with tracks) in cache
 */
export function setAlbumDetail(albumId: string, detail: Omit<CachedAlbumDetail, 'cachedAt'>): void {
    albumTracksCache.set(albumId, {
        ...detail,
        cachedAt: Date.now()
    });
    isDirty = true;
    scheduleDebouncedSave();
    
    console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 📝 Cached album "${detail.albumName}" with ${detail.tracks.length} tracks`);
}

/**
 * Clear cache
 */
export function clearCache(): void {
    albumCache.clear();
    albumTracksCache.clear();
    isDirty = true;
    scheduleDebouncedSave();
    console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 🗑️ Cache cleared`);
}

// ================= Lifecycle =================

/**
 * Initialize cache on startup
 */
export function initSpotifyAlbumCache(): void {
    console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 🚀 Initializing (debounced save: 30s)...`);
    
    loadFromJson();
    
    console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] ✅ Initialized (${albumCache.size} track entries, ${albumTracksCache.size} album entries)`);
}

/**
 * Shutdown - save cache
 */
export function shutdownSpotifyAlbumCache(): void {
    if (debounceSaveTimer) {
        clearTimeout(debounceSaveTimer);
        debounceSaveTimer = null;
    }
    
    if (isDirty) {
        saveToJson();
    }
    
    console.log(`[${chalk.bold.magenta('ALBUM CACHE')}] 🛑 Shutdown complete`);
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        entries: albumCache.size,
        isDirty,
        cacheFile: CACHE_FILE
    };
}
