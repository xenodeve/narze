/**
 * YouTube Channel Cache
 * Caches channel/artist detail pages to reduce YouTube API quota usage
 * Uses In-Memory + JSON file for persistence (same pattern as Spotify cache)
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

// ================= Configuration =================
const CACHE_DIR = path.join(__dirname, '../../../cache');
const CACHE_FILE = path.join(CACHE_DIR, 'youtube-channel-cache.json');

// Cache TTL: 1 hour (channel data changes less frequently than search)
const CACHE_TTL = 60 * 60 * 1000;

// Debounce delay: 30 seconds (save after 30s of no changes)
const DEBOUNCE_DELAY = 30 * 1000;

// ================= Types =================
export interface CachedChannelVideo {
    id: string;
    title: string;
    channelTitle?: string;
    thumbnailUrl?: string;
    duration: number;
    publishedAt?: string;
    category: 'music' | 'video';
}

export interface CachedChannelDetail {
    channelId: string;
    name: string;
    description?: string;
    thumbnailUrl?: string;
    bannerUrl?: string;
    subscriberCount?: number;
    videoCount?: number;
    customUrl?: string;
    videos: CachedChannelVideo[];
    cachedAt: number;
}

interface CacheData {
    // Key: channelId
    channels: Record<string, CachedChannelDetail>;
    lastUpdated: number;
}

// ================= In-Memory Cache =================
const channelCache = new Map<string, CachedChannelDetail>();
let isDirty = false;
let debounceSaveTimer: NodeJS.Timeout | null = null;

// ================= Helper Functions =================

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] Created cache directory`);
    }
}

/**
 * Schedule a debounced save - saves after 30s of no changes
 */
function scheduleDebouncedSave(): void {
    // Clear existing timer if any
    if (debounceSaveTimer) {
        clearTimeout(debounceSaveTimer);
    }
    
    // Schedule save after 30 seconds
    debounceSaveTimer = setTimeout(() => {
        if (isDirty) {
            saveToJson();
        }
        debounceSaveTimer = null;
    }, DEBOUNCE_DELAY);
}

// ================= Save/Load =================

/**
 * Save cache to JSON file
 */
export function saveToJson(): boolean {
    try {
        ensureCacheDir();

        const data: CacheData = {
            channels: {},
            lastUpdated: Date.now()
        };

        channelCache.forEach((detail, channelId) => {
            data.channels[channelId] = detail;
        });

        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        isDirty = false;

        console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] 💾 Saved ${channelCache.size} channel entries`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('YT CHANNEL CACHE')}] ❌ Failed to save:`, error);
        return false;
    }
}

/**
 * Load cache from JSON file
 */
export function loadFromJson(): boolean {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            console.log(`[${chalk.bold.yellow('YT CHANNEL CACHE')}] 📂 No cache file found`);
            return false;
        }

        const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        let loadedCount = 0;
        let expiredCount = 0;

        for (const [channelId, detail] of Object.entries(data.channels || {})) {
            if (Date.now() - detail.cachedAt > CACHE_TTL) {
                expiredCount++;
                continue;
            }
            channelCache.set(channelId, detail);
            loadedCount++;
        }

        console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] 📂 Loaded ${loadedCount} entries (${expiredCount} expired)`);
        return true;
    } catch (error) {
        console.error(`[${chalk.bold.red('YT CHANNEL CACHE')}] ❌ Failed to load:`, error);
        return false;
    }
}

// ================= Cache Operations =================

/**
 * Get channel detail from cache
 */
export function getChannelDetail(channelId: string): CachedChannelDetail | null {
    const detail = channelCache.get(channelId);
    
    if (!detail) return null;
    
    // Check TTL
    if (Date.now() - detail.cachedAt > CACHE_TTL) {
        channelCache.delete(channelId);
        return null;
    }
    
    return detail;
}

/**
 * Set channel detail in cache
 */
export function setChannelDetail(channelId: string, detail: Omit<CachedChannelDetail, 'cachedAt'>): void {
    channelCache.set(channelId, {
        ...detail,
        cachedAt: Date.now()
    });
    isDirty = true;
    scheduleDebouncedSave();  // Debounced save
    
    console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] 📝 Cached channel "${detail.name}" with ${detail.videos.length} videos`);
}

/**
 * Clear cache
 */
export function clearCache(): void {
    channelCache.clear();
    isDirty = true;
    scheduleDebouncedSave();  // Debounced save
    console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] 🗑️ Cache cleared`);
}

// ================= Lifecycle =================

/**
 * Initialize cache on startup
 */
export function initYouTubeChannelCache(): void {
    console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] 🚀 Initializing (debounced save: 30s)...`);
    
    loadFromJson();
    
    console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] ✅ Initialized (${channelCache.size} entries)`);
}

/**
 * Shutdown - save cache
 */
export function shutdownYouTubeChannelCache(): void {
    // Clear pending debounce timer
    if (debounceSaveTimer) {
        clearTimeout(debounceSaveTimer);
        debounceSaveTimer = null;
    }
    
    // Save if dirty
    if (isDirty) {
        saveToJson();
    }
    
    console.log(`[${chalk.bold.redBright('YT CHANNEL CACHE')}] 🛑 Shutdown complete`);
}

/**
 * Get cache stats
 */
export function getYouTubeChannelCacheStats() {
    return {
        entries: channelCache.size,
        isDirty,
        cacheFile: CACHE_FILE,
        ttlMinutes: CACHE_TTL / 60000
    };
}
