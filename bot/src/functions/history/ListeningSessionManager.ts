import chalk from 'chalk';
import { getFirestore, isFirebaseInitialized } from '../../lib/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { GuildMember } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

// ================= Local JSON Cache =================
const CACHE_DIR = path.join(__dirname, '../../../cache');
const SESSION_CACHE_FILE = path.join(CACHE_DIR, 'sessions.json');

// ================= Types =================

export interface SessionParticipant {
    userId: string;
    username: string;
    avatarURL: string;
    joinedAt: number;
    // We could track "active time" later, for now just presence
}

export interface SessionTrack {
    title: string;
    author: string;
    uri: string;
    thumbnail: string;
    duration: number;
    playedAt: number;
    requesterAvatar?: string;
    requesterName?: string;
}

export interface ListeningSession {
    sessionId: string;
    guildId: string;
    guildName: string;
    channelId: string;
    startTime: number;
    endTime?: number;
    tracks: SessionTrack[];
    participants: Map<string, SessionParticipant>; // Map for easy deduplication
    isActive: boolean;
    lastUpdated: number;
}

// ================= State (In-Memory Cache) =================

// Active sessions: guildId -> Session
const activeSessions = new Map<string, ListeningSession>();

// Pending Writes (Queue for Batch Write strategy, similar to historyCache.ts)
const pendingSessionWrites = new Map<string, ListeningSession>();

// ================= Read Cache (In-Memory + JSON) =================
// Cache for getGuildSessions() - stores completed sessions per guild
// This dramatically speeds up session history page loading

interface SessionReadCache {
    sessions: any[];
    lastFetched: number;
    limit: number;
}

// In-memory read cache: guildId -> cached sessions
const sessionReadCache = new Map<string, SessionReadCache>();

// Cache TTL (5 minutes - same as batch interval)
const SESSION_READ_CACHE_TTL = 5 * 60 * 1000;

// JSON cache file for read cache
const SESSION_READ_CACHE_FILE = path.join(CACHE_DIR, 'session-read-cache.json');

/**
 * Save read cache to JSON for persistence across restarts
 */
function saveReadCacheToJson() {
    try {
        ensureCacheDir();
        const cacheData: Record<string, SessionReadCache> = {};
        sessionReadCache.forEach((cache, guildId) => {
            cacheData[guildId] = cache;
        });
        fs.writeFileSync(SESSION_READ_CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
    } catch (err) {
        console.error(`[${chalk.bold.redBright('SESSION')}] Failed to save read cache:`, err);
    }
}

/**
 * Load read cache from JSON on startup
 */
function loadReadCacheFromJson() {
    try {
        if (!fs.existsSync(SESSION_READ_CACHE_FILE)) return;
        
        const data = JSON.parse(fs.readFileSync(SESSION_READ_CACHE_FILE, 'utf-8'));
        const now = Date.now();
        
        Object.entries(data).forEach(([guildId, cache]: [string, any]) => {
            // Only load if not expired
            if (now - cache.lastFetched < SESSION_READ_CACHE_TTL) {
                sessionReadCache.set(guildId, cache);
            }
        });
        
        console.log(`[${chalk.bold.magenta('SESSION')}] Loaded ${sessionReadCache.size} guilds into read cache`);
    } catch (err) {
        console.error(`[${chalk.bold.redBright('SESSION')}] Failed to load read cache:`, err);
    }
}

/**
 * Invalidate read cache for a guild (called when session updates/ends)
 */
function invalidateReadCache(guildId: string) {
    if (sessionReadCache.has(guildId)) {
        sessionReadCache.delete(guildId);
    }
}

/**
 * Update read cache with new/updated session (in-memory only, no JSON write)
 */
function updateReadCacheWithSession(session: ListeningSession) {
    const cache = sessionReadCache.get(session.guildId);
    if (!cache) {
        // Initialize cache if not exists
        sessionReadCache.set(session.guildId, {
            sessions: [{
                ...session,
                participants: Array.from(session.participants.values())
            }],
            lastFetched: Date.now(),
            limit: 20
        });
        return;
    }
    
    // Convert session for storage
    const sessionData = {
        ...session,
        participants: Array.from(session.participants.values())
    };
    
    // Find and update existing session or add new one
    const existingIndex = cache.sessions.findIndex(s => s.sessionId === session.sessionId);
    if (existingIndex >= 0) {
        cache.sessions[existingIndex] = sessionData;
    } else {
        // Add to front (newest first)
        cache.sessions.unshift(sessionData);
        // Trim to limit
        if (cache.sessions.length > cache.limit) {
            cache.sessions = cache.sessions.slice(0, cache.limit);
        }
    }
    
    cache.lastFetched = Date.now();
    
    // Save to JSON backup on every update (same as historyCache.ts pattern)
    saveReadCacheToJson();
}

// ================= Manager Functions =================

// Broadcast function reference
let broadcastFn: ((guildId: string, event: string, data: any) => void) | null = null;

export function setSessionBroadcastFunction(
    guildBroadcast: (guildId: string, event: string, data: any) => void
) {
    broadcastFn = guildBroadcast;
}

// Batch write config
const BATCH_INTERVAL = 5 * 60 * 1000; // 5 minutes
let batchTimer: NodeJS.Timeout | null = null;

// ================= Local JSON Backup Functions =================

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log(`[${chalk.bold.magenta('SESSION')}] Created cache directory: ${CACHE_DIR}`);
    }
}

/**
 * Convert session Map to serializable object
 */
function sessionToSerializable(session: ListeningSession): any {
    return {
        ...session,
        participants: Array.from(session.participants.entries())
    };
}

/**
 * Convert serialized data back to session with Map
 */
function serializableToSession(data: any): ListeningSession {
    return {
        ...data,
        participants: new Map(data.participants || [])
    };
}

/**
 * Save all active sessions to local JSON file
 * Called periodically and on session updates
 */
export function saveSessionsToJson() {
    try {
        ensureCacheDir();
        
        const sessionsData: any[] = [];
        
        // Save active sessions
        activeSessions.forEach((session) => {
            sessionsData.push({
                type: 'active',
                ...sessionToSerializable(session)
            });
        });
        
        // Save pending writes
        pendingSessionWrites.forEach((session) => {
            // Avoid duplicates
            if (!sessionsData.find(s => s.sessionId === session.sessionId)) {
                sessionsData.push({
                    type: 'pending',
                    ...sessionToSerializable(session)
                });
            }
        });
        
        if (sessionsData.length === 0) {
            // No sessions to save, remove file if exists
            if (fs.existsSync(SESSION_CACHE_FILE)) {
                fs.unlinkSync(SESSION_CACHE_FILE);
            }
            return;
        }
        
        fs.writeFileSync(SESSION_CACHE_FILE, JSON.stringify(sessionsData, null, 2), 'utf-8');
        console.log(`[${chalk.bold.magenta('SESSION')}] Saved ${sessionsData.length} sessions to local JSON backup`);
    } catch (err) {
        console.error(`[${chalk.bold.redBright('SESSION')}] Failed to save sessions to JSON:`, err);
    }
}

/**
 * Load sessions from local JSON file
 * Called on bot startup
 */
export function loadSessionsFromJson(): { active: ListeningSession[], pending: ListeningSession[] } {
    const result = { active: [] as ListeningSession[], pending: [] as ListeningSession[] };
    
    try {
        if (!fs.existsSync(SESSION_CACHE_FILE)) {
            return result;
        }
        
        const data = JSON.parse(fs.readFileSync(SESSION_CACHE_FILE, 'utf-8'));
        
        if (!Array.isArray(data)) {
            console.warn(`[${chalk.bold.yellowBright('SESSION')}] Invalid session cache format`);
            return result;
        }
        
        for (const item of data) {
            const session = serializableToSession(item);
            if (item.type === 'active') {
                result.active.push(session);
            } else {
                result.pending.push(session);
            }
        }
        
        console.log(`[${chalk.bold.magenta('SESSION')}] Loaded ${result.active.length} active, ${result.pending.length} pending sessions from JSON backup`);
    } catch (err) {
        console.error(`[${chalk.bold.redBright('SESSION')}] Failed to load sessions from JSON:`, err);
    }
    
    return result;
}

/**
 * Restore sessions on bot startup
 * 1. Load from JSON cache
 * 2. Compare with Firebase for each guild (use newer based on timestamp)
 * 3. Merge any missing sessions
 * Should be called once when bot initializes
 */
export async function restoreSessionsOnStartup() {
    console.log(`[${chalk.bold.magenta('SESSION')}] Initializing session cache...`);
    
    // 1. Load read cache from JSON
    loadReadCacheFromJson();
    
    // 2. Compare with Firebase for guilds that have cached data
    if (isFirebaseInitialized() && sessionReadCache.size > 0) {
        const db = getFirestore();
        if (db) {
            console.log(`[${chalk.bold.magenta('SESSION')}] Comparing JSON cache with Firebase for ${sessionReadCache.size} guilds...`);
            
            for (const [guildId, cache] of sessionReadCache.entries()) {
                try {
                    // Get latest session from Firebase for this guild
                    const snapshot = await db.collection('playHistory')
                        .doc(guildId)
                        .collection('sessions')
                        .orderBy('startTime', 'desc')
                        .limit(1)
                        .get();
                    
                    if (!snapshot.empty) {
                        const latestFirebase = snapshot.docs[0].data();
                        const latestFirebaseTime = latestFirebase.lastUpdated?.toMillis?.() || latestFirebase.startTime || 0;
                        
                        // Check if Firebase has newer data
                        if (latestFirebaseTime > cache.lastFetched) {
                            console.log(`[${chalk.bold.magenta('SESSION')}] Guild ${guildId}: Firebase is newer, refreshing cache...`);
                            
                            // Fetch full list from Firebase
                            const fullSnapshot = await db.collection('playHistory')
                                .doc(guildId)
                                .collection('sessions')
                                .orderBy('startTime', 'desc')
                                .limit(cache.limit)
                                .get();
                            
                            const firebaseSessions = fullSnapshot.docs.map(doc => doc.data());
                            
                            // Update cache with Firebase data
                            sessionReadCache.set(guildId, {
                                sessions: firebaseSessions,
                                lastFetched: Date.now(),
                                limit: cache.limit
                            });
                        } else {
                            console.log(`[${chalk.bold.magenta('SESSION')}] Guild ${guildId}: JSON cache is up-to-date`);
                        }
                    }
                } catch (err) {
                    console.error(`[${chalk.bold.redBright('SESSION')}] Failed to compare Firebase for guild ${guildId}:`, err);
                }
            }
            
            // Save updated cache
            saveReadCacheToJson();
        }
    }
    
    console.log(`[${chalk.bold.magenta('SESSION')}] Session read cache initialized with ${sessionReadCache.size} guilds`);
    
    // 3. Load and restore pending session writes (for active sessions before crash)
    const { active, pending } = loadSessionsFromJson();
    
    // Restore active sessions (but mark as inactive since bot restarted)
    // They will be re-activated when music starts playing again
    for (const session of active) {
        // Mark as ended since we don't know the actual state
        session.isActive = false;
        session.endTime = session.endTime || Date.now();
        pendingSessionWrites.set(session.sessionId, session);
    }
    
    // Restore pending writes
    for (const session of pending) {
        pendingSessionWrites.set(session.sessionId, session);
    }
    
    // Flush restored sessions to Firebase
    if (pendingSessionWrites.size > 0) {
        console.log(`[${chalk.bold.magenta('SESSION')}] Flushing ${pendingSessionWrites.size} restored sessions to Firebase...`);
        flushSessionToFirebase().then(() => {
            // Clear the JSON backup after successful flush
            if (fs.existsSync(SESSION_CACHE_FILE)) {
                fs.unlinkSync(SESSION_CACHE_FILE);
                console.log(`[${chalk.bold.magenta('SESSION')}] Cleared local JSON backup after restore`);
            }
        });
    }
    
    // 4. Start graceful shutdown handler
    startSessionGracefulShutdown();
    
    console.log(`[${chalk.bold.greenBright('SESSION')}] Session cache fully initialized`);
}


/**
 * Start a new session or return existing active one
 */
export function startSession(guildId: string, channelId: string, guildName?: string): ListeningSession {
    let session = activeSessions.get(guildId);

    if (session && session.isActive) {
        // Update channel if changed
        if (session.channelId !== channelId) {
            session.channelId = channelId;
        }
        // Update guild name if provided and was empty
        if (guildName && !session.guildName) {
            session.guildName = guildName;
        }
        return session;
    }

    // Create new session
    const sessionId = `${guildId}-${Date.now()}`;
    session = {
        sessionId,
        guildId,
        guildName: guildName || 'Unknown Server',
        channelId,
        startTime: Date.now(),
        tracks: [],
        participants: new Map(),
        isActive: true,
        lastUpdated: Date.now()
    };

    activeSessions.set(guildId, session);
    startSessionBatchTimer(); // Ensure timer is running
    
    console.log(`[${chalk.bold.magenta('SESSION')}] Started new session ${sessionId} for guild ${guildId}`);
    return session;
}

/**
 * Update session with new track and current participants
 */
export function updateSession(
    guildId: string, 
    channelId: string,
    track: { title: string; author: string; uri: string; thumbnail?: string; duration: number; requesterAvatar?: string; requesterName?: string; requesterId?: string },
    members:  Map<string, GuildMember> | any[], // Discord.js Collection or Array
    guildName?: string
) {
    // Get or create session
    const session = startSession(guildId, channelId, guildName);

    // 1. Add Track
    session.tracks.push({
        title: track.title,
        author: track.author,
        uri: track.uri,
        thumbnail: track.thumbnail || '',
        duration: track.duration,
        playedAt: Date.now(),
        requesterAvatar: track.requesterAvatar,
        requesterName: track.requesterName
    });

    // 2. Update Participants from voice channel
    const memberList = Array.isArray(members) ? members : Array.from(members.values());
    let newParticipantsCount = 0;
    
    memberList.forEach((member: any) => {
        if (member.user.bot) return; // Ignore bots
        
        const userId = member.user.id;
        if (!session.participants.has(userId)) {
            session.participants.set(userId, {
                userId,
                username: member.user.username,
                avatarURL: member.user.avatarURL() || member.user.defaultAvatarURL,
                joinedAt: Date.now()
            });
            newParticipantsCount++;
        }
    });
    
    // 2.5 Add requester as participant (even if not in voice channel - for remote play)
    if (track.requesterId && !session.participants.has(track.requesterId)) {
        session.participants.set(track.requesterId, {
            userId: track.requesterId,
            username: track.requesterName || 'Unknown',
            avatarURL: track.requesterAvatar || '',
            joinedAt: Date.now()
        });
        newParticipantsCount++;
        console.log(`[${chalk.bold.magenta('SESSION')}] Added remote requester ${track.requesterId} as participant`);
    }

    session.lastUpdated = Date.now();
    
    // 3. Queue for write (Write-Behind)
    queueSessionWrite(session);
    
    // 3.5 Update read cache immediately (in-memory only)
    updateReadCacheWithSession(session);

    // 4. Broadcast Update via SSE
    if (broadcastFn) {
        // Convert Map to Array for JSON
        const sessionData = {
            ...session,
            participants: Array.from(session.participants.values())
        };
        broadcastFn(guildId, 'sessionUpdate', sessionData);
    }

    console.log(`[${chalk.bold.magenta('SESSION')}] Updated session ${session.sessionId}: +1 Track, +${newParticipantsCount} New Participants`);
    
    // 5. Broadcast active users update to admin panel
    broadcastActiveUsersUpdate();
}

/**
 * End a session
 */
export function endSession(guildId: string) {
    const session = activeSessions.get(guildId);
    if (!session || !session.isActive) return;

    session.isActive = false;
    session.endTime = Date.now();
    session.lastUpdated = Date.now();

    // Queue for batch write (Write-Behind - same as updateSession)
    queueSessionWrite(session);
    
    // Update read cache immediately (in-memory + JSON backup)
    updateReadCacheWithSession(session);
    
    // Note: Firebase flush happens on batch timer (5 min) or graceful shutdown
    // JSON backup protects against data loss
    
    if (broadcastFn) {
        const sessionData = {
            ...session,
            participants: Array.from(session.participants.values())
        };
        broadcastFn(guildId, 'sessionEnd', sessionData);
    }
    
    activeSessions.delete(guildId);
    console.log(`[${chalk.bold.magenta('SESSION')}] Ended session ${session.sessionId} for guild ${guildId}`);
    
    // Broadcast active users update to admin panel
    broadcastActiveUsersUpdate();
}

// ================= Persistence (Firebase) =================

// Throttle-based sync: Start timer on first update, DON'T reset on subsequent updates
// This guarantees flush within 5 minutes of first update (safer for frequent updates)
function startSessionBatchThrottle() {
    // If timer already running, don't reset - just let it continue
    if (batchTimer) {
        return; // Timer already counting, will flush on time
    }
    
    console.log(`[${chalk.bold.magenta('SESSION')}] Throttle timer started (flush in 5 min)`);
    
    // Start 5-minute countdown
    batchTimer = setTimeout(async () => {
        // Save to local JSON backup first (both session writes and read cache)
        saveSessionsToJson();
        saveReadCacheToJson();
        
        // Then flush to Firebase
        await flushSessionToFirebase();
        // Timer stops after flush (will restart on next update)
        batchTimer = null;
        console.log(`[${chalk.bold.magenta('SESSION')}] Throttle flush complete, timer stopped`);
    }, BATCH_INTERVAL);
}

// Legacy function name for compatibility
function startSessionBatchTimer() {
    startSessionBatchThrottle();
}

/**
 * Start graceful shutdown handler
 * Flushes all pending sessions before exit
 */
export function startSessionGracefulShutdown() {
    const cleanup = async () => {
        console.log(`[${chalk.bold.magenta('SESSION')}] Graceful shutdown: Flushing pending sessions...`);
        
        // Clear batch timer
        if (batchTimer) {
            clearTimeout(batchTimer);
            batchTimer = null;
        }
        
        // Save to JSON backup first
        saveSessionsToJson();
        saveReadCacheToJson();
        
        // Flush to Firebase
        await flushSessionToFirebase();
        
        console.log(`[${chalk.bold.magenta('SESSION')}] Graceful shutdown: Flush complete`);
    };
    
    // Listen to signals only once
    if (process.listenerCount('SIGTERM') === 0) {
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
        console.log(`[${chalk.bold.magenta('SESSION')}] Graceful shutdown handler registered`);
    }
}

// ================= Persistence (Firebase) =================

function queueSessionWrite(session: ListeningSession) {
    // Clone to prevent mutation issues during async write
    // Note: We only clone what we need for the write
    pendingSessionWrites.set(session.sessionId, session);
    
    // Save to local JSON backup immediately for crash recovery
    saveSessionsToJson(); 
    
    // Start throttle timer for Firebase flush (won't reset if already running)
    startSessionBatchThrottle();
}

export async function flushSessionToFirebase(sessionInput?: ListeningSession) {
    if (!isFirebaseInitialized()) return;
    const db = getFirestore();
    if (!db) return;

    // If specific session provided, flush it. Else flush all pending.
    const sessionsToFlush = sessionInput ? [sessionInput] : Array.from(pendingSessionWrites.values());
    
    if (sessionsToFlush.length === 0) return;

    const batch = db.batch();
    let opCount = 0;

    for (const session of sessionsToFlush) {
        const ref = db.collection('playHistory').doc(session.guildId).collection('sessions').doc(session.sessionId);
        
        // Convert Map to Array for storage
        const participantsArray = Array.from(session.participants.values());
        
        // Prepare data
        const data = {
            sessionId: session.sessionId,
            guildId: session.guildId,
            guildName: session.guildName || 'Unknown Server',
            channelId: session.channelId,
            startTime: session.startTime,
            endTime: session.endTime || null,
            isActive: session.isActive,
            trackCount: session.tracks.length,
            participantCount: participantsArray.length,
            // Store top 3-5 tracks for preview, or all? 
            // Firestore limit is 1MB. Storing all tracks for a long session (e.g. 100 songs) is fine.
            // But maybe we should store tracks in subcollection if it gets huge?
            // For now, array is fine for typical sessions (< 500 songs).
            tracks: session.tracks, 
            participants: participantsArray,
            lastUpdated: FieldValue.serverTimestamp()
        };

        batch.set(ref, data, { merge: true });
        opCount++;
        
        // Remove from pending if successful (optimistic)
        pendingSessionWrites.delete(session.sessionId);
    }

    if (opCount > 0) {
        try {
            await batch.commit();
            console.log(`[${chalk.bold.magenta('SESSION')}] Flushed ${opCount} sessions to Firebase`);
        } catch (err) {
            console.error(`[${chalk.bold.redBright('SESSION')}] Failed to flush sessions:`, err);
        }
    }
}

// ================= Getter for API (With Caching) =================

export async function getGuildSessions(guildId: string, limit: number = 20): Promise<any[]> {
    const now = Date.now();
    
    // 1. Check in-memory cache first (fastest)
    const cached = sessionReadCache.get(guildId);
    if (cached && (now - cached.lastFetched < SESSION_READ_CACHE_TTL) && cached.limit >= limit) {
        // Include current active session from memory if exists
        const activeSession = activeSessions.get(guildId);
        if (activeSession && activeSession.isActive) {
            const activeData = {
                ...activeSession,
                participants: Array.from(activeSession.participants.values())
            };
            // Check if active session is already in cache
            const hasActive = cached.sessions.some(s => s.sessionId === activeSession.sessionId);
            if (!hasActive) {
                return [activeData, ...cached.sessions].slice(0, limit);
            } else {
                // Update the active session in the result
                return cached.sessions.map(s => 
                    s.sessionId === activeSession.sessionId ? activeData : s
                ).slice(0, limit);
            }
        }
        return cached.sessions.slice(0, limit);
    }
    
    // 2. Fetch from Firebase
    if (!isFirebaseInitialized()) {
        // Return active session only if no Firebase
        const activeSession = activeSessions.get(guildId);
        if (activeSession) {
            return [{
                ...activeSession,
                participants: Array.from(activeSession.participants.values())
            }];
        }
        return [];
    }
    
    const db = getFirestore();
    if (!db) return [];

    try {
        const snapshot = await db.collection('playHistory')
            .doc(guildId)
            .collection('sessions')
            .orderBy('startTime', 'desc')
            .limit(limit)
            .get();

        const sessions = snapshot.docs.map(doc => doc.data());
        
        // 3. Update in-memory cache
        sessionReadCache.set(guildId, {
            sessions,
            lastFetched: now,
            limit
        });
        
        // 4. Save to JSON cache
        saveReadCacheToJson();
        
        // 5. Include active session from memory if not in Firebase yet
        const activeSession = activeSessions.get(guildId);
        if (activeSession && activeSession.isActive) {
            const activeData = {
                ...activeSession,
                participants: Array.from(activeSession.participants.values())
            };
            const hasActive = sessions.some(s => s.sessionId === activeSession.sessionId);
            if (!hasActive) {
                return [activeData, ...sessions].slice(0, limit);
            }
        }
        
        return sessions;
    } catch (err) {
        console.error(`[${chalk.bold.redBright('SESSION')}] Failed to fetch sessions:`, err);
        
        // Fallback to active session from memory
        const activeSession = activeSessions.get(guildId);
        if (activeSession) {
            return [{
                ...activeSession,
                participants: Array.from(activeSession.participants.values())
            }];
        }
        return [];
    }
}

/**
 * Initialize session cache on startup
 * Should be called from restoreSessionsOnStartup or separately
 */
export function initSessionReadCache() {
    loadReadCacheFromJson();
    console.log(`[${chalk.bold.magenta('SESSION')}] Session read cache initialized`);
}

// ================= Active Users for Admin Panel =================

// SSE clients for admin user status updates
const adminUserStatusClients: Set<any> = new Set();

/**
 * Register SSE client for admin user status updates
 */
export function addAdminUserStatusClient(res: any) {
    adminUserStatusClients.add(res);
}

/**
 * Remove SSE client
 */
export function removeAdminUserStatusClient(res: any) {
    adminUserStatusClients.delete(res);
}

/**
 * Get all currently active users from listening sessions
 */
export function getActiveUsers(): { userId: string; username: string; avatarURL: string; guildId: string; guildName: string; joinedAt: number }[] {
    const users: { userId: string; username: string; avatarURL: string; guildId: string; guildName: string; joinedAt: number }[] = [];
    const seenUsers = new Set<string>();
    
    activeSessions.forEach((session) => {
        if (!session.isActive) return;
        
        session.participants.forEach((participant) => {
            if (!seenUsers.has(participant.userId)) {
                seenUsers.add(participant.userId);
                users.push({
                    userId: participant.userId,
                    username: participant.username,
                    avatarURL: participant.avatarURL,
                    guildId: session.guildId,
                    guildName: session.guildName,
                    joinedAt: participant.joinedAt
                });
            }
        });
    });
    
    return users;
}

/**
 * Get active users count
 */
export function getActiveUsersCount(): number {
    const seenUsers = new Set<string>();
    
    activeSessions.forEach((session) => {
        if (!session.isActive) return;
        session.participants.forEach((participant) => {
            seenUsers.add(participant.userId);
        });
    });
    
    return seenUsers.size;
}

/**
 * Broadcast active users update to all admin SSE clients
 */
export function broadcastActiveUsersUpdate() {
    const activeUsers = getActiveUsers();
    const data = JSON.stringify({
        type: 'activeUsers',
        users: activeUsers,
        count: activeUsers.length,
        timestamp: Date.now()
    });
    
    adminUserStatusClients.forEach(res => {
        try {
            res.write(`data: ${data}\n\n`);
        } catch (e) {
            // Client disconnected
            adminUserStatusClients.delete(res);
        }
    });
}

