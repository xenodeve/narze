/**
 * YouTube Search Cache
 * Caches search results to reduce YouTube API quota usage
 * Uses In-Memory + JSON file for persistence (same pattern as Spotify cache)
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

// ================= Configuration =================
const CACHE_DIR = path.join(__dirname, '../../../cache');
const CACHE_FILE = path.join(CACHE_DIR, 'youtube-search-cache.json');

// Cache TTL: 30 minutes (search results change frequently)
const CACHE_TTL = 30 * 60 * 1000;

// Debounce delay: 30 seconds (save after 30s of no changes)
const DEBOUNCE_DELAY = 30 * 1000;

// ================= Types =================
export interface CachedYouTubeChannel {
    id: string;
    name: string;
    description?: string;
    thumbnailUrl?: string;
    subscriberCount?: number;
    videoCount?: number;
    customUrl?: string;
}

export interface CachedSearchResult {
    query: string;
    source: 'youtube' | 'youtubemusic';
    channels: CachedYouTubeChannel[];
    cachedAt: number;
}

interface CacheData {
    // Key: "query:source" (e.g., "keshi:youtube")
    searches: Record<string, CachedSearchResult>;
    lastUpdated: number;
}

// ================= In-Memory Cache =================
const searchCache = new Map<string, CachedSearchResult>();
let isDirty = false;
let debounceSaveTimer: NodeJS.Timeout | null = null;

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
        console.log(`[${chalk.bold.red('YT CACHE')}] Created cache directory`);
    }
}

function getCacheKey(query: string, source: 'youtube' | 'youtubemusic'): string {
    return `${query.toLowerCase().trim()}:${source}`;
}

// ================= Save/Load =================

/**
 * Save cache to JSON file
 */
export function saveToJson(): boolean {
    try {
        ensureCacheDir();

        const data: CacheData = {
            searches: {},
            lastUpdated: Date.now()
        };

        searchCache.forEach((result, key) => {
            data.searches[key] = result;
        });

        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        isDirty = false;

        console.log(`[${chalk.bold.red('YT SEARCH CACHE')}] 💾 Saved ${searchCache.size} search entries`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('YT SEARCH CACHE')}] ❌ Failed to save:`, error);
        return false;
    }
}

/**
 * Load cache from JSON file
 */
export function loadFromJson(): boolean {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            console.log(`[${chalk.bold.yellow('YT SEARCH CACHE')}] 📂 No cache file found`);
            return false;
        }

        const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        let loadedCount = 0;
        let expiredCount = 0;

        for (const [key, result] of Object.entries(data.searches || {})) {
            if (Date.now() - result.cachedAt > CACHE_TTL) {
                expiredCount++;
                continue;
            }
            searchCache.set(key, result);
            loadedCount++;
        }

        console.log(`[${chalk.bold.red('YT SEARCH CACHE')}] 📂 Loaded ${loadedCount} entries (${expiredCount} expired)`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('YT SEARCH CACHE')}] ❌ Failed to load:`, error);
        return false;
    }
}

// ================= Cache Operations =================

/**
 * Get cached search result
 */
export function getCachedSearch(query: string, source: 'youtube' | 'youtubemusic'): CachedSearchResult | null {
    const key = getCacheKey(query, source);
    const result = searchCache.get(key);
    
    if (!result) return null;
    
    // Check TTL
    if (Date.now() - result.cachedAt > CACHE_TTL) {
        searchCache.delete(key);
        return null;
    }
    
    console.log(`[${chalk.bold.red('YT CACHE')}] ✅ Cache HIT for "${query}" (${source})`);
    return result;
}

/**
 * Set search result in cache
 */
export function setCachedSearch(
    query: string, 
    source: 'youtube' | 'youtubemusic', 
    channels: CachedYouTubeChannel[]
): void {
    const key = getCacheKey(query, source);
    searchCache.set(key, {
        query: query.toLowerCase().trim(),
        source,
        channels,
        cachedAt: Date.now()
    });
    isDirty = true;
    scheduleDebouncedSave();
    console.log(`[${chalk.bold.red('YT SEARCH CACHE')}] 📝 Cached ${channels.length} channels for "${query}" (${source})`);
}

/**
 * Clear cache
 */
export function clearCache(): void {
    searchCache.clear();
    isDirty = true;
    scheduleDebouncedSave();
    console.log(`[${chalk.bold.red('YT SEARCH CACHE')}] 🗑️ Cache cleared`);
}

// ================= Lifecycle =================

/**
 * Initialize cache on startup
 */
export function initYouTubeSearchCache(): void {
    console.log(`[${chalk.bold.red('YT SEARCH CACHE')}] 🚀 Initializing (debounced save: 30s)...`);
    
    loadFromJson();
    
    console.log(`[${chalk.bold.red('YT SEARCH CACHE')}] ✅ Initialized (${searchCache.size} entries)`);
}

/**
 * Shutdown - save cache
 */
export function shutdownYouTubeSearchCache(): void {
    if (debounceSaveTimer) {
        clearTimeout(debounceSaveTimer);
        debounceSaveTimer = null;
    }
    
    if (isDirty) {
        saveToJson();
    }
    
    console.log(`[${chalk.bold.red('YT SEARCH CACHE')}] 🛑 Shutdown complete`);
}

/**
 * Get cache stats
 */
export function getYouTubeCacheStats() {
    return {
        entries: searchCache.size,
        isDirty,
        cacheFile: CACHE_FILE,
        ttlMinutes: CACHE_TTL / 60000
    };
}
