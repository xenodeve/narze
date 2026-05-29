/**
 * Play History Tracking
 * Saves user play history to Firebase Firestore
 * 
 * Storage Structure:
 * 1. Guild + User specific: playHistory/{guildId}/userHistory/{userId}/tracks/{trackId}
 * 2. Global User history: playHistory/global/userHistory/{userId}/tracks/{trackId}
 * 3. Server-wide history: playHistory/{guildId}/serverHistory/tracks/{trackId}
 */

import chalk from 'chalk';
import { getFirestore, isFirebaseInitialized } from '../../lib/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { isYouTubeMusicContent } from '../youtube/categoryCheck';
import { updateHistoryCacheOnPlay, getCachedUserHistory, getCachedServerHistory, setUserHistoryCache, setServerHistoryCache, queueHistoryUpdate } from '../cache/historyCache';

interface TrackInfo {
    title: string;
    author: string;
    uri: string;
    thumbnail?: string;
    length: number;
    requester?: string;
    source?: string;
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Record a track play to multiple history collections
 * @param guildId - Discord guild ID
 * @param userId - Discord user ID (requester)
 * @param track - Track information
 */
export async function recordTrackPlay(
    guildId: string,
    userId: string,
    track: TrackInfo
): Promise<void> {
    if (!isFirebaseInitialized()) {
        return;
    }

    const db = getFirestore();
    if (!db) {
        return;
    }

    try {
        // Create a unique ID for the track based on title + author
        const trackId = Buffer.from(`${track.title}-${track.author}`).toString('base64').replace(/[/+=]/g, '_');
        const source = track.source || detectSource(track.uri);
        
        // Check if YouTube content is music using YouTube Data API
        let isMusic = source === 'spotify'; // Spotify is always music
        if (source === 'youtube') {
            const videoId = extractYouTubeVideoId(track.uri);
            if (videoId) {
                try {
                    isMusic = await isYouTubeMusicContent(videoId);
                } catch (error) {
                    // On error, check if URL contains music.youtube.com
                    isMusic = track.uri.includes('music.youtube.com');
                }
            } else {
                isMusic = track.uri.includes('music.youtube.com');
            }
        }

        const trackData = {
            title: track.title,
            artist: track.author,
            url: track.uri,
            thumbnail: track.thumbnail || '',
            duration: track.length,
            source,
            isMusic,
            isVideo: source === 'youtube' && !isMusic,
        };

        // 1. Update in-memory cache and broadcast SSE (Immediate Feedback)
        updateHistoryCacheOnPlay(guildId, userId, trackData);
        
        // 1.1 Update uniqueTracksCount in userCache (sync with history length)
        const { updateUserTracksCount, getUser } = await import('../cache/userCache');
        const userHistoryCache = getCachedUserHistory(userId);
        if (userHistoryCache) {
            // Cache exists - use its length
            updateUserTracksCount(userId, userHistoryCache.length);
        } else {
            // Cache not loaded yet - increment existing count by 1 (assumes new unique track)
            const currentUser = getUser(userId);
            const currentCount = currentUser?.uniqueTracksCount || 0;
            updateUserTracksCount(userId, currentCount + 1);
        }

        // 2. Queue for Batch Write (Write-Behind Strategy)
        // This aggregates updates in memory and writes to Firebase every 5 minutes
        queueHistoryUpdate(guildId, userId, trackData, trackId);

        console.log(`[${chalk.bold.blueBright('HISTORY')}] Queueing record: ${track.title} for user ${userId} (isMusic=${isMusic})`);
    } catch (error) {
        console.error(`[${chalk.bold.redBright('HISTORY')}] Failed to record track:`, error);
    }
}

/**
 * Detect the source platform from URI
 */
function detectSource(uri: string): string {
    if (uri.includes('spotify.com')) return 'spotify';
    if (uri.includes('youtube.com') || uri.includes('youtu.be')) return 'youtube';
    if (uri.includes('soundcloud.com')) return 'soundcloud';
    if (uri.includes('deezer.com')) return 'deezer';
    return 'unknown';
}

/**
 * Get user play history (Global)
 * Strategy: Cache -> Firebase -> Set Cache
 * @param sortBy - 'playCount' (default, most played) or 'lastPlayedAt' (most recent)
 */
export async function getUserHistory(userId: string, limit: number = 100, sortBy: 'playCount' | 'lastPlayedAt' = 'playCount'): Promise<any[]> {
    // 1. Check Cache (cache is always sorted by playCount, so only use for playCount sort)
    if (sortBy === 'playCount') {
        const cached = getCachedUserHistory(userId);
        if (cached && cached.length >= limit) {
            return cached.slice(0, limit);
        }
    }

    if (!isFirebaseInitialized()) return [];
    const db = getFirestore();
    if (!db) return [];

    try {
        // 2. Query Firebase with specified sort order
        const snapshot = await db
            .collection('playHistory')
            .doc('global')
            .collection('userHistory')
            .doc(userId)
            .collection('tracks')
            .orderBy(sortBy, 'desc')
            .limit(limit)
            .get();

        const tracks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                artist: data.artist,
                url: data.url,
                thumbnail: data.thumbnail,
                duration: data.duration,
                playCount: data.playCount,
                source: data.source,
                isMusic: data.isMusic,
                isVideo: data.isVideo,
                lastPlayedAt: data.lastPlayedAt?.toDate()
            };
        });

        // 3. Set Cache
        setUserHistoryCache(userId, tracks as any[]);
        
        return tracks;
    } catch (error) {
        console.error(`[${chalk.bold.redBright('HISTORY')}] Failed to get user history:`, error);
        return [];
    }
}

/**
 * Get server play history
 * Strategy: Cache -> Firebase -> Set Cache
 */
export async function getServerHistory(guildId: string): Promise<any[]> {
    // 1. Check Cache
    const cached = getCachedServerHistory(guildId);
    if (cached) {
        return cached;
    }

    if (!isFirebaseInitialized()) return [];
    const db = getFirestore();
    if (!db) return [];

    try {
        // 2. Query Firebase
        const snapshot = await db
            .collection('playHistory')
            .doc(guildId)
            .collection('serverHistory')
            .doc('tracks')
            .collection('items')
            .orderBy('playCount', 'desc')
            .limit(20)
            .get();

        const tracks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                artist: data.artist,
                url: data.url,
                thumbnail: data.thumbnail,
                duration: data.duration,
                playCount: data.playCount,
                source: data.source,
                isMusic: data.isMusic,
                isVideo: data.isVideo,
                lastPlayedAt: data.lastPlayedAt?.toDate()
            };
        });

        // 3. Set Cache
        setServerHistoryCache(guildId, tracks as any[]);
        
        return tracks;
    } catch (error) {
        console.error(`[${chalk.bold.redBright('HISTORY')}] Failed to get server history:`, error);
        return [];
    }
}

// Re-export cache functions for use by other modules
export { getCachedUserHistory, getCachedServerHistory };
