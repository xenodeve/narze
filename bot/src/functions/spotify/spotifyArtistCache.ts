/**
 * Spotify Artist Cache
 * Caches artist info from Spotify API to avoid repeated calls
 * Uses In-Memory + JSON file for persistence (same pattern as spotifyAlbumCache)
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

// ================= Configuration =================
const CACHE_DIR = path.join(__dirname, '../../../cache');
const CACHE_FILE = path.join(CACHE_DIR, 'spotify-artist-cache.json');

// Cache TTL: 7 days (artist info rarely changes)
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// Auto-save interval: 5 minutes
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

// ================= Types =================
export interface CachedArtistInfo {
    id: string;
    name: string;
    imageUrl?: string;
    followers?: number;
    genres?: string[];
    spotifyUrl?: string;
    cachedAt: number;
}

// NEW: Full artist detail for artist page
export interface CachedArtistTrack {
    id: string;
    name: string;
    artistName: string;
    albumName?: string;
    albumId?: string;
    imageUrl?: string;
    duration: number;
    uri?: string;
}

export interface CachedArtistAlbum {
    id: string;
    name: string;
    imageUrl?: string;
    releaseDate?: string;
    totalTracks?: number;
    albumType?: string;
}

export interface CachedArtistDetail {
    artistId: string;
    name: string;
    imageUrl?: string;
    followers?: number;
    genres?: string[];
    spotifyUrl?: string;
    topTracks: CachedArtistTrack[];
    albums: CachedArtistAlbum[];
    cachedAt: number;
}

interface CacheData {
    // Key: Spotify artist ID
    artists: Record<string, CachedArtistInfo>;
    // NEW: Key: Spotify artist ID (for full detail)
    artistDetails: Record<string, CachedArtistDetail>;
    lastUpdated: number;
}

// ================= In-Memory Cache =================
const artistCache = new Map<string, CachedArtistInfo>();
// NEW: Full artist detail cache
const artistDetailCache = new Map<string, CachedArtistDetail>();
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
        console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] Created cache directory`);
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
            artists: {},
            artistDetails: {},
            lastUpdated: Date.now()
        };

        artistCache.forEach((info, artistId) => {
            data.artists[artistId] = info;
        });

        artistDetailCache.forEach((detail, artistId) => {
            data.artistDetails[artistId] = detail;
        });

        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        isDirty = false;

        console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] 💾 Saved ${artistCache.size} info entries, ${artistDetailCache.size} detail entries`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('ARTIST CACHE')}] ❌ Failed to save:`, error);
        return false;
    }
}

/**
 * Load cache from JSON file
 */
export function loadFromJson(): boolean {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            console.log(`[${chalk.bold.yellow('ARTIST CACHE')}] 📂 No cache file found`);
            return false;
        }

        const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        let infoLoadedCount = 0;
        let infoExpiredCount = 0;
        let detailLoadedCount = 0;
        let detailExpiredCount = 0;

        // Load artist info
        for (const [artistId, info] of Object.entries(data.artists || {})) {
            if (Date.now() - info.cachedAt > CACHE_TTL) {
                infoExpiredCount++;
                continue;
            }
            artistCache.set(artistId, info);
            infoLoadedCount++;
        }

        // Load artist details
        for (const [artistId, detail] of Object.entries(data.artistDetails || {})) {
            if (Date.now() - detail.cachedAt > CACHE_TTL) {
                detailExpiredCount++;
                continue;
            }
            artistDetailCache.set(artistId, detail);
            detailLoadedCount++;
        }

        console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] 📂 Loaded ${infoLoadedCount} info (${infoExpiredCount} expired), ${detailLoadedCount} detail (${detailExpiredCount} expired)`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('ARTIST CACHE')}] ❌ Failed to load:`, error);
        return false;
    }
}

// ================= Cache Operations =================

/**
 * Get artist info from cache
 */
export function getArtistInfo(artistId: string): CachedArtistInfo | null {
    const info = artistCache.get(artistId);
    
    if (!info) return null;
    
    // Check TTL
    if (Date.now() - info.cachedAt > CACHE_TTL) {
        artistCache.delete(artistId);
        return null;
    }
    
    return info;
}

/**
 * Set artist info in cache
 */
export function setArtistInfo(artistId: string, info: Omit<CachedArtistInfo, 'cachedAt'>): void {
    artistCache.set(artistId, {
        ...info,
        cachedAt: Date.now()
    });
    isDirty = true;
}

/**
 * Batch set artist info
 */
export function setArtistInfoBatch(entries: Map<string, Omit<CachedArtistInfo, 'cachedAt'>>): void {
    const now = Date.now();
    entries.forEach((info, artistId) => {
        artistCache.set(artistId, {
            ...info,
            cachedAt: now
        });
    });
    isDirty = true;
    
    console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] 📝 Cached ${entries.size} artist info entries`);
}

/**
 * Get missing artist IDs (not in cache or expired)
 */
export function getMissingArtistIds(artistIds: string[]): string[] {
    return artistIds.filter(id => !getArtistInfo(id));
}

// ================= Artist Detail Cache Operations =================

/**
 * Get full artist detail from cache (topTracks, albums)
 */
export function getArtistDetail(artistId: string): CachedArtistDetail | null {
    const detail = artistDetailCache.get(artistId);
    
    if (!detail) return null;
    
    // Check TTL
    if (Date.now() - detail.cachedAt > CACHE_TTL) {
        artistDetailCache.delete(artistId);
        return null;
    }
    
    return detail;
}

/**
 * Set full artist detail in cache
 */
export function setArtistDetail(artistId: string, detail: Omit<CachedArtistDetail, 'cachedAt'>): void {
    artistDetailCache.set(artistId, {
        ...detail,
        cachedAt: Date.now()
    });
    isDirty = true;
    
    console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] 📝 Cached artist "${detail.name}" with ${detail.topTracks.length} tracks, ${detail.albums.length} albums`);
}

/**
 * Clear cache
 */
export function clearCache(): void {
    artistCache.clear();
    artistDetailCache.clear();
    isDirty = true;
    scheduleDebouncedSave();
    console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] 🗑️ Cache cleared`);
}

// ================= Lifecycle =================

/**
 * Initialize cache on startup
 */
export function initSpotifyArtistCache(): void {
    console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] 🚀 Initializing (debounced save: 30s)...`);
    
    loadFromJson();
    
    console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] ✅ Initialized (${artistCache.size} info, ${artistDetailCache.size} detail entries)`);
}

/**
 * Shutdown - save cache
 */
export function shutdownSpotifyArtistCache(): void {
    if (debounceSaveTimer) {
        clearTimeout(debounceSaveTimer);
        debounceSaveTimer = null;
    }
    
    if (isDirty) {
        saveToJson();
    }
    
    console.log(`[${chalk.bold.cyan('ARTIST CACHE')}] 🛑 Shutdown complete`);
}

/**
 * Get cache stats
 */
export function getArtistCacheStats() {
    return {
        entries: artistCache.size,
        isDirty,
        cacheFile: CACHE_FILE
    };
}
