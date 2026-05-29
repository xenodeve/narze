import express, { Request, Response } from 'express';
import cors from 'cors';
import { TextChannel, VoiceChannel, GuildMember } from 'discord.js';
import { clientBot } from '../interfaces/client';
import { 
    getGuildSettings, 
    upsertGuildSettings, 
    setMusicChannel, 
    canUserControlBot,
    canUserViewBot,
    getUserVoiceChannel,
    getTextChannels 
} from '../functions/guildSettings';
import { loadTracks, playerCreate } from '../functions/lavalink/manager';
import { fetchBillboardChart, getBillboardRecommendations, getBillboardTracks, getTopBillboardTracks, initBillboardCache, scheduleBillboardUpdates } from '../functions/cache/billboardCache';
import { isYouTubeMusicContent, getCacheStats as getYouTubeCategoryCacheStats } from '../functions/youtube/categoryCheck';
import { setBroadcastFunction, getCachedUserHistory, getCachedServerHistory, setUserHistoryCache, setServerHistoryCache, getCacheStats as getHistoryCacheStats } from '../functions/cache/historyCache';
import { getQueueCacheStats } from '../functions/cache/queueCache';
import { getUserCacheStats } from '../functions/cache/userCache';
import { 
    initPlaylistCache, 
    getCachedUserPlaylists, 
    getCachedPlaylist, 
    setUserPlaylistsCache, 
    addPlaylistToCache, 
    updatePlaylistInCache, 
    deletePlaylistFromCache,
    getPlaylistCacheStats,
    type Playlist,
    type PlaylistTrack
} from '../functions/cache/playlistCache';
import { getUserHistory, getServerHistory } from '../functions/history/playHistory';
import { getGuildSessions } from '../functions/history/ListeningSessionManager';
import { multiCategorySearch } from '../functions/search/searchService';
import { initSearchResultCache, shutdownSearchResultCache, SearchResultTrack, getSearchCacheStats } from '../functions/cache/searchResultCache';
import { initSpotifyArtistCache, shutdownSpotifyArtistCache, getArtistCacheStats } from '../functions/spotify/spotifyArtistCache';
import { initSpotifyAlbumCache, shutdownSpotifyAlbumCache, getCacheStats as getAlbumCacheStats } from '../functions/spotify/spotifyAlbumCache';
import { initYouTubeSearchCache, shutdownYouTubeSearchCache, getYouTubeCacheStats } from '../functions/youtube/youtubeSearchCache';
import { initYouTubeChannelCache, shutdownYouTubeChannelCache, getYouTubeChannelCacheStats } from '../functions/youtube/youtubeChannelCache';
import { registerRoutes } from './routes';
import { 
    broadcastToGuild, 
    broadcastToUser, 
    broadcastGuildUpdateToUsers,
    incrementQueueRevision,
    getQueueState,
    sseClients,
    userSseClients,
    userGuildSubscriptions,
    guildQueueStates,
    type SSEClientInfo,
    type GuildQueueState
} from './utils/sse';

// CPU Usage Tracking - need to compare two snapshots to get real-time usage
let previousCpuTimes: { idle: number; total: number }[] = [];
let currentCpuUsage = 0;

async function updateCpuUsage() {
    const os = await import('os');
    const cpus = os.cpus();
    
    if (previousCpuTimes.length === cpus.length) {
        let totalDiff = 0;
        let idleDiff = 0;
        
        cpus.forEach((cpu, i) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            const idle = cpu.times.idle;
            
            totalDiff += total - previousCpuTimes[i].total;
            idleDiff += idle - previousCpuTimes[i].idle;
        });
        
        if (totalDiff > 0) {
            currentCpuUsage = ((totalDiff - idleDiff) / totalDiff) * 100;
        }
    }
    
    // Update previous times
    previousCpuTimes = cpus.map(cpu => ({
        idle: cpu.times.idle,
        total: Object.values(cpu.times).reduce((a, b) => a + b, 0)
    }));
}

// Update CPU usage every second
setInterval(updateCpuUsage, 1000);
updateCpuUsage(); // Initial call


// Helper function to format user info for logging
function formatUserInfo(user?: { username?: string; discordId?: string }): string {
    if (!user || (!user.username && !user.discordId)) {
        return 'Unknown User';
    }
    return `${user.username || 'Unknown'}${user.discordId ? ` (${user.discordId})` : ''}`;
}


export function createAPIServer(client: clientBot) {
    const app = express();
    const PORT = process.env.API_PORT || 3001;

    // Initialize all caches on server startup
    initSearchResultCache();
    initSpotifyArtistCache();
    initSpotifyAlbumCache();
    initYouTubeSearchCache();
    initYouTubeChannelCache();

    // Register graceful shutdown handlers for caches
    const gracefulCacheShutdown = () => {
        console.log('\n[API] 💾 Graceful shutdown: Saving all caches...');
        shutdownSearchResultCache();
        shutdownSpotifyArtistCache();
        shutdownSpotifyAlbumCache();
        shutdownYouTubeSearchCache();
        shutdownYouTubeChannelCache();
        console.log('[API] ✅ All caches saved');
    };

    // Register once for SIGINT and SIGTERM
    process.once('SIGINT', gracefulCacheShutdown);
    process.once('SIGTERM', gracefulCacheShutdown);

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Register modular routes (player, queue, guild, charts, history, search, admin)
    registerRoutes(app, client, gracefulCacheShutdown);

    // Permission check middleware for player control endpoints
    const checkControlPermission = async (req: Request, res: Response, next: Function) => {
        const { guildId } = req.params;
        const { user } = req.body;
        
        // Skip permission check if no user info provided (for backwards compatibility)
        if (!user?.discordId) {
            console.log(`[API] ⚠️ No user discordId provided, skipping permission check`);
            return next();
        }

        try {
            const userVoiceChannelId = await getUserVoiceChannel(client, guildId, user.discordId);
            const permission = await canUserControlBot(client, guildId, user.discordId, userVoiceChannelId);

            if (!permission.canControl) {
                console.log(`[API] 🚫 Permission denied for ${formatUserInfo(user)}: ${permission.reason}`);
                return res.status(403).json({ 
                    error: 'Permission denied', 
                    reason: permission.reason 
                });
            }

            // User has permission, continue
            console.log(`[API] ✅ Permission granted for ${formatUserInfo(user)}: ${permission.reason}`);
            next();
        } catch (error) {
            console.error('Error checking permission:', error);
            // Allow on error for backwards compatibility
            next();
        }
    };

    // Health check endpoint
    app.get('/api/health', (req: Request, res: Response) => {
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString() 
        });
    });

    // ================= Admin API =================
    
    // Store logs for admin terminal
    const adminLogs: { timestamp: Date; level: string; message: string }[] = [];
    const MAX_LOGS = 1000;
    const adminLogClients = new Set<Response>();

    // Intercept console.log for admin terminal
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    const addLog = (level: string, ...args: any[]) => {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const logEntry = {
            timestamp: new Date(),
            level,
            message
        };
        
        adminLogs.push(logEntry);
        if (adminLogs.length > MAX_LOGS) {
            adminLogs.shift();
        }

        // Broadcast to SSE clients
        adminLogClients.forEach(res => {
            try {
                res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
            } catch (e) {
                // Client disconnected
            }
        });
    };

    console.log = (...args) => {
        originalConsoleLog.apply(console, args);
        addLog('info', ...args);
    };
    console.warn = (...args) => {
        originalConsoleWarn.apply(console, args);
        addLog('warn', ...args);
    };
    console.error = (...args) => {
        originalConsoleError.apply(console, args);
        addLog('error', ...args);
    };

    // Admin stats endpoint
    app.get('/api/admin/stats', async (req: Request, res: Response) => {
        try {
            const os = await import('os');
            
            // CPU usage - use the tracked real-time value
            const cpuUsage = currentCpuUsage;

            // Memory usage
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;

            // Get cache stats
            const fs = await import('fs');
            const path = await import('path');
            const CACHE_DIR = path.join(process.cwd(), 'cache');
            
            const searchStats = getSearchCacheStats();
            const artistStats = getArtistCacheStats();
            const albumStats = getAlbumCacheStats();
            const ytSearchStats = getYouTubeCacheStats();
            const ytChannelStats = getYouTubeChannelCacheStats();
            const historyStats = getHistoryCacheStats();
            const playlistStats = getPlaylistCacheStats();
            const queueStats = getQueueCacheStats();
            const userStats = getUserCacheStats();
            const ytCategoryStats = getYouTubeCategoryCacheStats();
            
            // Helper to get file size safely
            const getFileSize = (filePath: string): number => {
                try {
                    if (fs.existsSync(filePath)) {
                        return fs.statSync(filePath).size;
                    }
                } catch { /* ignore */ }
                return 0;
            };
            
            // Helper to count entries in a JSON cache file
            const countJsonEntries = (filePath: string): number => {
                try {
                    if (fs.existsSync(filePath)) {
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        if (Array.isArray(data)) return data.length;
                        if (typeof data === 'object' && data !== null) return Object.keys(data).length;
                    }
                } catch { /* ignore */ }
                return 0;
            };
            
            const cacheStats = [
                { name: 'Search Results', size: getFileSize(searchStats.cacheFile), items: searchStats.entries || countJsonEntries(searchStats.cacheFile) },
                { name: 'Spotify Artists', size: getFileSize(artistStats.cacheFile), items: artistStats.entries },
                { name: 'Spotify Albums', size: getFileSize(albumStats.cacheFile), items: albumStats.entries },
                { name: 'YouTube Search', size: getFileSize(ytSearchStats.cacheFile), items: ytSearchStats.entries || countJsonEntries(ytSearchStats.cacheFile) },
                { name: 'History Cache', size: getFileSize(path.join(CACHE_DIR, 'history-cache.json')), items: (historyStats.userCacheSize + historyStats.serverCacheSize) || countJsonEntries(path.join(CACHE_DIR, 'history-cache.json')) },
                { name: 'Playlist Cache', size: getFileSize(path.join(CACHE_DIR, 'playlist-cache.json')), items: playlistStats.totalPlaylists || countJsonEntries(path.join(CACHE_DIR, 'playlist-cache.json')) },
                { name: 'Queue Backup', size: getFileSize(queueStats.cacheFile), items: queueStats.guildCount || countJsonEntries(queueStats.cacheFile) },
                { name: 'User Cache', size: getFileSize(path.join(CACHE_DIR, 'users.json')), items: userStats.totalUsers || countJsonEntries(path.join(CACHE_DIR, 'users.json')) },
                { name: 'Billboard Charts', size: getFileSize(path.join(CACHE_DIR, 'billboard-charts.json')), items: countJsonEntries(path.join(CACHE_DIR, 'billboard-charts.json')) },
                { name: 'YouTube Categories', size: getFileSize(path.join(CACHE_DIR, 'youtube-categories.json')), items: ytCategoryStats.size || countJsonEntries(path.join(CACHE_DIR, 'youtube-categories.json')) },
                { name: 'Session Cache', size: getFileSize(path.join(CACHE_DIR, 'session-read-cache.json')), items: countJsonEntries(path.join(CACHE_DIR, 'session-read-cache.json')) },
            ];

            // Get network interfaces
            const networkInterfaces = os.networkInterfaces();
            const ips: string[] = [];
            for (const [name, nets] of Object.entries(networkInterfaces)) {
                if (nets) {
                    for (const net of nets) {
                        if (net.family === 'IPv4' && !net.internal) {
                            ips.push(`${name}: ${net.address}`);
                        }
                    }
                }
            }

            // Active players count
            const activePlayers = client.manager?.players?.size || 0;

            res.json({
                online: client.isReady(),
                ping: client.ws.ping,
                uptime: client.uptime || 0,
                guilds: client.guilds.cache.size,
                users: client.users.cache.size,
                activePlayers,
                cpu: cpuUsage,
                memory: {
                    used: usedMem,
                    total: totalMem,
                    percentage: (usedMem / totalMem) * 100
                },
                cache: cacheStats,
                ips,
                nodeVersion: process.version,
                platform: os.platform(),
                arch: os.arch()
            });
        } catch (error: any) {
            console.error('[Admin API] Error getting stats:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Admin logs SSE endpoint
    app.get('/api/admin/logs/events', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        // Send recent logs history
        const recentLogs = adminLogs.slice(-100);
        res.write(`data: ${JSON.stringify({ type: 'history', logs: recentLogs })}\n\n`);

        adminLogClients.add(res);
        console.log(`[Admin] Log SSE client connected (${adminLogClients.size} total)`);

        req.on('close', () => {
            adminLogClients.delete(res);
            console.log(`[Admin] Log SSE client disconnected (${adminLogClients.size} remaining)`);
        });
    });

    // Admin users status SSE endpoint (real-time active users)
    app.get('/api/admin/users/events', async (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        // Import session manager functions
        const { addAdminUserStatusClient, removeAdminUserStatusClient, getActiveUsers } = await import('../functions/history/ListeningSessionManager');

        // Send initial active users
        const activeUsers = getActiveUsers();
        res.write(`data: ${JSON.stringify({ type: 'activeUsers', users: activeUsers, count: activeUsers.length, timestamp: Date.now() })}\n\n`);

        // Register for updates
        addAdminUserStatusClient(res);
        console.log(`[Admin] User status SSE client connected`);

        req.on('close', () => {
            removeAdminUserStatusClient(res);
            console.log(`[Admin] User status SSE client disconnected`);
        });
    });

    // ================= Dashboard Presence Tracking =================
    
    // Track online dashboard users: discordId -> { username, avatarURL, connectedAt }
    const onlineDashboardUsers = new Map<string, { discordId: string; username: string; avatarURL: string; connectedAt: number }>();
    // SSE clients for admin to receive presence updates
    const dashboardPresenceAdminClients = new Set<Response>();
    
    // Get all online dashboard users
    const getOnlineDashboardUsers = () => Array.from(onlineDashboardUsers.values());
    
    // Broadcast presence update to admin clients
    const broadcastPresenceUpdate = () => {
        const users = getOnlineDashboardUsers();
        const data = JSON.stringify({
            type: 'dashboardPresence',
            users,
            count: users.length,
            timestamp: Date.now()
        });
        
        dashboardPresenceAdminClients.forEach(res => {
            try {
                res.write(`data: ${data}\n\n`);
            } catch (e) {
                dashboardPresenceAdminClients.delete(res);
            }
        });
    };

    // User presence SSE endpoint (called from dashboard when user is logged in)
    app.get('/api/presence/connect', (req: Request, res: Response) => {
        const discordId = req.query.discordId as string;
        const username = req.query.username as string || 'Unknown';
        const avatarURL = req.query.avatarURL as string || '';

        if (!discordId) {
            res.status(400).json({ error: 'discordId required' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        // Add user to online list
        onlineDashboardUsers.set(discordId, {
            discordId,
            username,
            avatarURL,
            connectedAt: Date.now()
        });

        console.log(`[Presence] User ${username} (${discordId}) connected to dashboard (${onlineDashboardUsers.size} online)`);
        
        // Broadcast update to admin panel
        broadcastPresenceUpdate();

        // Send heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
            } catch (e) {
                clearInterval(heartbeatInterval);
            }
        }, 30000);

        req.on('close', async () => {
            clearInterval(heartbeatInterval);
            onlineDashboardUsers.delete(discordId);
            console.log(`[Presence] User ${username} (${discordId}) disconnected from dashboard (${onlineDashboardUsers.size} online)`);
            
            // Update lastActive in userCache when user goes offline
            try {
                const { updateUserLastActive } = await import('../functions/cache/userCache');
                updateUserLastActive(discordId);
            } catch (e) {
                // Ignore if cache not ready
            }
            
            broadcastPresenceUpdate();
        });
    });

    // Admin endpoint to subscribe to dashboard presence updates
    app.get('/api/admin/presence/events', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        // Send initial data
        const users = getOnlineDashboardUsers();
        res.write(`data: ${JSON.stringify({ type: 'dashboardPresence', users, count: users.length, timestamp: Date.now() })}\n\n`);

        dashboardPresenceAdminClients.add(res);
        console.log(`[Admin] Presence SSE client connected (${dashboardPresenceAdminClients.size} total)`);

        req.on('close', () => {
            dashboardPresenceAdminClients.delete(res);
            console.log(`[Admin] Presence SSE client disconnected (${dashboardPresenceAdminClients.size} remaining)`);
        });
    });

    // Admin users cached endpoint (reads from bot's in-memory cache)
    app.get('/api/admin/users/cached', async (req: Request, res: Response) => {
        try {
            const { getUsersForAPI, getUserCacheStats } = await import('../functions/cache/userCache');
            const users = getUsersForAPI();
            const stats = getUserCacheStats();
            
            res.json({
                users,
                count: users.length,
                cacheStats: stats,
                timestamp: Date.now()
            });
        } catch (error: any) {
            console.error('[Admin API] Error getting cached users:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Admin users SSE endpoint (real-time cache updates)
    app.get('/api/admin/users/cached/events', async (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        const { addUserCacheSSEClient, removeUserCacheSSEClient, getUsersForAPI } = await import('../functions/cache/userCache');

        // Send initial users data
        const users = getUsersForAPI();
        res.write(`data: ${JSON.stringify({ type: 'userCacheUpdate', users, count: users.length, timestamp: Date.now() })}\n\n`);

        // Register for updates
        addUserCacheSSEClient(res);
        console.log(`[Admin] User cache SSE client connected`);

        req.on('close', () => {
            removeUserCacheSSEClient(res);
            console.log(`[Admin] User cache SSE client disconnected`);
        });
    });

    // ================= Non-duplicate endpoints below =================

    // Get user permissions for multiple guilds (for playlist guild selector)
    app.post('/api/guilds/user-permissions', async (req: Request, res: Response) => {
        try {
            const { userId, guildIds } = req.body;

            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }

            if (!guildIds || !Array.isArray(guildIds)) {
                return res.status(400).json({ error: 'guildIds array is required' });
            }

            const permissions: Record<string, {
                isOwner: boolean;
                isBotOwner: boolean;
                isInVoice: boolean;
                voiceChannelId: string | null;
                voiceChannelName: string | null;
                canPlay: boolean;
                reason: string;
            }> = {};

            for (const guildId of guildIds) {
                const guild = client.guilds.cache.get(guildId);
                
                if (!guild) {
                    permissions[guildId] = {
                        isOwner: false,
                        isBotOwner: false,
                        isInVoice: false,
                        voiceChannelId: null,
                        voiceChannelName: null,
                        canPlay: false,
                        reason: 'Guild not found'
                    };
                    continue;
                }

                // Check if user is guild owner
                const isOwner = guild.ownerId === userId;

                // Check if user is bot owner (who invited the bot)
                const settings = await getGuildSettings(guildId);
                const isBotOwner = settings?.ownerId === userId;

                // Get user's voice channel in this guild
                const member = guild.members.cache.get(userId);
                const voiceChannelId = member?.voice.channelId || null;
                const voiceChannel = voiceChannelId ? guild.channels.cache.get(voiceChannelId) : null;
                const voiceChannelName = voiceChannel?.name || null;
                const isInVoice = !!voiceChannelId;

                // Determine if user can play
                let canPlay = false;
                let reason = '';

                if (isOwner || isBotOwner) {
                    canPlay = true;
                    reason = isOwner ? 'Server Owner' : 'Bot Owner';
                } else if (isInVoice) {
                    canPlay = true;
                    reason = `In ${voiceChannelName}`;
                } else {
                    canPlay = false;
                    reason = 'Join voice channel to play';
                }

                permissions[guildId] = {
                    isOwner,
                    isBotOwner,
                    isInVoice,
                    voiceChannelId,
                    voiceChannelName,
                    canPlay,
                    reason
                };
            }

            res.json({ permissions });
        } catch (error) {
            console.error('Error in /api/guilds/user-permissions:', error);
            res.status(500).json({ error: 'Failed to get user permissions' });
        }
    });

    // Get all active players (current tracks across all guilds)
    app.get('/api/current-track', (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const players = client.manager.players;
            if (!players || players.size === 0) {
                return res.json({
                    count: 0,
                    tracks: []
                });
            }

            const activeTracks: any[] = [];
            
            players.forEach((player: any) => {
                if (player.current) {
                    activeTracks.push({
                        guildId: player.guildId,
                        guildName: client.guilds.cache.get(player.guildId)?.name || 'Unknown',
                        track: {
                            title: player.current.info.title,
                            author: player.current.info.author,
                            duration: player.current.info.length,
                            thumbnail: player.current.info.thumbnail,
                            uri: player.current.info.uri,
                            requester: player.current.info.requester
                        },
                        position: player.position,
                        paused: player.paused,
                        volume: player.volume,
                        playing: player.playing
                    });
                }
            });

            res.json({
                count: activeTracks.length,
                tracks: activeTracks
            });
        } catch (error) {
            console.error('Error in /api/current-track:', error);
            res.status(500).json({ error: 'Failed to get current tracks', details: String(error) });
        }
    });

    // Get current track for specific guild
    app.get('/api/current-track/:guildId', (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const player = client.manager.players.get(guildId);

            // Check if player exists and has a current track
            // Also check if player is actively playing or paused (not just has stale current track)
            const isActivePlayer = player && player.current && (player.playing || player.paused);

            if (!player) {
                return res.status(404).json({ error: 'No player in this guild' });
            }

            // Player exists but no active track (queue ended, but 24/7 keeps player alive)
            if (!isActivePlayer) {
                // Return player info without track (for 24/7 mode status)
                return res.json({ 
                    guildId: player.guildId,
                    guildName: client.guilds.cache.get(player.guildId)?.name || 'Unknown',
                    track: null,
                    position: 0,
                    paused: false,
                    volume: player.volume,
                    playing: false,
                    twentyFourSeven: (player as any).get('twentyFourSeven') || false
                });
            }

            const track = {
                guildId: player.guildId,
                guildName: client.guilds.cache.get(player.guildId)?.name || 'Unknown',
                track: {
                    title: player.current.info.title,
                    author: player.current.info.author,
                    duration: player.current.info.length,
                    thumbnail: player.current.info.thumbnail,
                    uri: player.current.info.uri,
                    requester: player.current.info.requester
                },
                position: player.position,
                paused: player.paused,
                volume: player.volume,
                playing: player.playing,
                twentyFourSeven: (player as any).get('twentyFourSeven') || false
            };

            res.json(track);
        } catch (error) {
            console.error('Error in /api/current-track/:guildId:', error);
            res.status(500).json({ error: 'Failed to get current track', details: String(error) });
        }
    });

    // Search tracks in a guild (uses Lavalink search)
    app.get('/api/guild/:guildId/search', async (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const query = (req.query.q as string) || (req.query.query as string) || '';
            const requesterId = req.query.userId as string | undefined;

            if (!query.trim()) {
                return res.status(400).json({ error: 'Query is required' });
            }

            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            const member = requesterId
                ? await guild.members.fetch(requesterId).catch(() => null)
                : null;

            // Use manager.resolve like play command does (uses defaultSearchPlatform from config)
            const result = await client.manager.resolve({
                query,
                requester: member || undefined,
            } as any);

            if (!result || !Array.isArray(result.tracks)) {
                return res.json({ tracks: [] });
            }

            // Check if result is a playlist
            const isPlaylist = result.loadType === 'playlist' && result.playlistInfo;
            let playlistInfo = null;
            
            if (isPlaylist) {
                // Get playlist thumbnail using the main function from play.ts logic
                const { getPlaylistThumbnailMain, isPlaylistUrl } = await import('../functions/youtube/index');
                const { validateAndConvertThumbnail } = await import('../functions/lavalink/thumbnailValidator');
                
                let playlistThumbnail: string | null = null;
                const firstTrackThumbnail = result.tracks[0]?.info?.thumbnail;
                
                try {
                    // Use the main playlist thumbnail function with fallback
                    playlistThumbnail = await getPlaylistThumbnailMain(query, firstTrackThumbnail, {
                        method: 'auto',
                        fallbackToVideo: true,
                        highQuality: true
                    });
                } catch (error) {
                    console.error('Error fetching playlist thumbnail:', error);
                    // Fallback to first track thumbnail
                    playlistThumbnail = await validateAndConvertThumbnail(firstTrackThumbnail);
                }
                
                playlistInfo = {
                    name: result.playlistInfo.name,
                    trackCount: result.tracks.length,
                    thumbnail: playlistThumbnail,
                    url: query
                };
                
                console.log(`[API] 📋 Playlist detected: "${playlistInfo.name}" with ${playlistInfo.trackCount} tracks`);
            }

            // Process tracks and check YouTube category for music content
            // For playlists, return all tracks. For search results, limit to 10.
            const tracksData = isPlaylist ? result.tracks : result.tracks.slice(0, 10);
            const tracks = await Promise.all(tracksData.map(async (track: any) => {
                const uri = track.info?.uri || '';
                const source = track.info?.sourceName || 'unknown';
                const identifier = track.info?.identifier || '';
                
                // Basic source detection
                const isSpotify = source === 'spotify' || uri.includes('spotify.com');
                const isYouTube = source === 'youtube' || uri.includes('youtube.com') || uri.includes('youtu.be');
                const isFromYTMusicUrl = uri.includes('music.youtube.com');
                
                // For YouTube content, check if it's music using YouTube Data API
                // This uses categoryId = 10 (Music) and other indicators
                let isMusicContent = isSpotify || isFromYTMusicUrl;
                
                if (isYouTube && identifier && !isFromYTMusicUrl) {
                    // Check YouTube API for categoryId (costs 1 quota unit per video)
                    // Results are cached for 24 hours to minimize API usage
                    try {
                        isMusicContent = await isYouTubeMusicContent(identifier);
                    } catch (error) {
                        // On error, assume it's a video (safer default)
                        isMusicContent = false;
                    }
                }
                
                // For YouTube, generate appropriate thumbnail based on content type
                let thumbnail = track.info?.thumbnail || null;
                if (isYouTube && identifier) {
                    if (isMusicContent) {
                        // Music content - use square-ish thumbnail
                        thumbnail = `https://i.ytimg.com/vi/${identifier}/sddefault.jpg`;
                    } else {
                        // Video content - 16:9 thumbnail
                        thumbnail = `https://img.youtube.com/vi/${identifier}/mqdefault.jpg`;
                    }
                }
                
                return {
                    title: track.info?.title || 'Unknown',
                    author: track.info?.author || 'Unknown',
                    duration: track.info?.length || 0,
                    uri,
                    thumbnail,
                    identifier,
                    source,
                    // Additional metadata for frontend
                    isVideo: isYouTube && !isMusicContent, // Only true if YouTube AND not music
                    isAudioOnly: isSpotify || isMusicContent, // Music content from any source
                    isMusicContent, // Explicit flag for music content
                };
            }));

            res.json({ 
                tracks,
                isPlaylist,
                playlistInfo
            });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/search:', error);
            res.status(500).json({ error: 'Failed to search tracks' });
        }
    });

    // Check if guild has an active player
    app.get('/api/guild/:guildId/player/status', (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const player = client.manager.players.get(guildId);

            if (!player) {
                return res.json({ 
                    hasPlayer: false,
                    guildId 
                });
            }

            // Check if player is connected to a voice channel
            const isConnected = player.connected || player.voiceChannel;

            res.json({
                hasPlayer: true,
                isConnected: !!isConnected,
                voiceChannel: player.voiceChannel,
                guildId
            });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/player/status:', error);
            res.status(500).json({ error: 'Failed to get player status' });
        }
    });

    // Join a voice channel (special permission: just requires guild membership, not voice channel)
    app.post('/api/guild/:guildId/join', async (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const { channelId, user } = req.body;
            const userInfo = formatUserInfo(user);

            // Permission check: user must be a guild member
            if (user?.discordId) {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) {
                    return res.status(404).json({ error: 'Guild not found' });
                }
                
                const member = guild.members.cache.get(user.discordId);
                if (!member) {
                    // Try to fetch from API
                    try {
                        await guild.members.fetch(user.discordId);
                    } catch {
                        return res.status(403).json({ 
                            error: 'Permission denied', 
                            reason: 'Not a member of this server' 
                        });
                    }
                }
                
                console.log(`[API] ✅ Join permission granted for ${userInfo} (guild member)`);
            }

            if (!channelId) {
                return res.status(400).json({ error: 'Channel ID is required' });
            }

            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            const voiceChannel = guild.channels.cache.get(channelId);
            if (!voiceChannel || voiceChannel.type !== 2) { // 2 = GUILD_VOICE
                return res.status(404).json({ error: 'Voice channel not found' });
            }

            // Create or get existing player
            let player = client.manager.players.get(guildId);
            if (!player) {
                // Get guild settings to use configured music channel
                const settings = await getGuildSettings(guildId);
                const textChannelId = settings?.musicChannelId || channelId;
                
                player = client.manager.createConnection({
                    guildId,
                    voiceChannel: channelId,
                    textChannel: textChannelId, // Use configured music channel or fallback to voice channel
                    deaf: true,
                });
                
                console.log(`[API] Using text channel: ${textChannelId} (from ${settings?.musicChannelId ? 'settings' : 'voice channel fallback'})`);
            } else {
                // Update voice channel if player exists
                player.voiceChannel = channelId;
            }

            // Connect if not connected
            if (!player.connected) {
                player.connect();
            }

            console.log(`[API] Bot joined voice channel: ${voiceChannel.name} in ${guild.name} ${userInfo}`);

            res.json({ 
                success: true, 
                message: `Joined ${voiceChannel.name}`,
                voiceChannel: {
                    id: channelId,
                    name: voiceChannel.name
                }
            });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/join:', error);
            res.status(500).json({ error: 'Failed to join voice channel', details: String(error) });
        }
    });

    // Get queue for specific guild
    app.get('/api/queue/:guildId', (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const player = client.manager.players.get(guildId);

            if (!player) {
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            const queue = {
                guildId: player.guildId,
                guildName: client.guilds.cache.get(player.guildId)?.name || 'Unknown',
                current: player.current ? {
                    title: player.current.info.title,
                    author: player.current.info.author,
                    duration: player.current.info.length,
                    thumbnail: player.current.info.thumbnail,
                    uri: player.current.info.uri,
                    requester: player.current.info.requester
                } : null,
                queue: player.queue.map((track: any) => ({
                    title: track.info.title,
                    author: track.info.author,
                    duration: track.info.length,
                    thumbnail: track.info.artworkUrl || track.info.thumbnail,
                    uri: track.info.uri,
                    requester: track.info.requester,
                    requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                    requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                })),
                queueLength: player.queue.length,
                position: player.position,
                paused: player.paused,
                volume: player.volume,
                loop: player.loop,
                playing: player.playing
            };

            res.json(queue);
        } catch (error) {
            console.error('Error in /api/queue/:guildId:', error);
            res.status(500).json({ error: 'Failed to get queue', details: String(error) });
        }
    });

    // Clear queue for specific guild
    app.post('/api/guild/:guildId/queue/clear', checkControlPermission, async (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const userInfo = formatUserInfo(req.body?.user);
            const player = client.manager.players.get(guildId);

            if (!player) {
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (!player.queue || player.queue.size === 0) {
                return res.status(400).json({ error: 'Queue is already empty' });
            }

            const queueSize = player.queue.size;
            await player.queue.clear();

            console.log(`[API] Queue cleared: ${queueSize} tracks removed ${userInfo}`);

            // Broadcast queue update
            incrementQueueRevision(guildId);
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: [],
                queueLength: 0,
                current: player.current ? {
                    title: player.current.info.title,
                    author: player.current.info.author,
                    duration: player.current.info.length,
                    thumbnail: player.current.info.thumbnail,
                } : null,
            });

            res.json({ success: true, message: `Cleared ${queueSize} tracks from queue` });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/queue/clear:', error);
            res.status(500).json({ error: 'Failed to clear queue', details: String(error) });
        }
    });

    // Move track in queue
    app.post('/api/guild/:guildId/queue/move', checkControlPermission, async (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const { from, to } = req.body;
            const userInfo = formatUserInfo(req.body?.user);
            const player = client.manager.players.get(guildId);

            if (!player) {
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (from === undefined || to === undefined) {
                return res.status(400).json({ error: 'from and to positions are required' });
            }

            if (from < 0 || from >= player.queue.size || to < 0 || to >= player.queue.size) {
                return res.status(400).json({ error: 'Invalid from or to position' });
            }

            // Move track in queue
            const [track] = player.queue.splice(from, 1);
            player.queue.splice(to, 0, track);

            console.log(`[API] Track moved from ${from} to ${to} ${userInfo}`);

            // Broadcast queue update
            incrementQueueRevision(guildId);
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: player.queue.map((t: any, i: number) => ({
                    id: `${i}`,
                    title: t.info.title,
                    author: t.info.author,
                    duration: t.info.length,
                    thumbnail: t.info.artworkUrl || t.info.thumbnail,
                    requesterName: t.info?.requester?.user?.username || t.info?.requester?.username,
                    requesterAvatar: t.info?.requester?.user?.displayAvatarURL?.() || t.info?.requester?.displayAvatarURL?.(),
                })),
                queueLength: player.queue.size,
            });

            res.json({ success: true, message: `Moved track from position ${from} to ${to}` });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/queue/move:', error);
            res.status(500).json({ error: 'Failed to move track', details: String(error) });
        }
    });

    // Shuffle queue
    app.post('/api/guild/:guildId/queue/shuffle', checkControlPermission, async (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const userInfo = formatUserInfo(req.body?.user);
            const player = client.manager.players.get(guildId);

            if (!player) {
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (!player.queue || player.queue.size < 2) {
                return res.status(400).json({ error: 'Need at least 2 tracks to shuffle' });
            }

            // Fisher-Yates shuffle
            for (let i = player.queue.size - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [player.queue[i], player.queue[j]] = [player.queue[j], player.queue[i]];
            }

            console.log(`[API] Queue shuffled: ${player.queue.size} tracks ${userInfo}`);

            // Broadcast queue update
            incrementQueueRevision(guildId);
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: player.queue.map((t: any, i: number) => ({
                    id: `${i}`,
                    title: t.info.title,
                    author: t.info.author,
                    duration: t.info.length,
                    thumbnail: t.info.artworkUrl || t.info.thumbnail,
                    requesterName: t.info?.requester?.user?.username || t.info?.requester?.username,
                    requesterAvatar: t.info?.requester?.user?.displayAvatarURL?.() || t.info?.requester?.displayAvatarURL?.(),
                })),
                queueLength: player.queue.size,
            });

            res.json({ success: true, message: `Shuffled ${player.queue.size} tracks` });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/queue/shuffle:', error);
            res.status(500).json({ error: 'Failed to shuffle queue', details: String(error) });
        }
    });


    // Get user history (Global)
    app.get('/api/user/:userId/history', async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ error: 'UserId is required' });
            }

            const tracks = await getUserHistory(userId);
            res.json({ tracks });
        } catch (error) {
            console.error('Error in /api/user/:userId/history:', error);
            res.status(500).json({ error: 'Failed to get user history' });
        }
    });

    // Get server history
    app.get('/api/guild/:guildId/history', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            if (!guildId) {
                return res.status(400).json({ error: 'GuildId is required' });
            }

            const tracks = await getServerHistory(guildId);
            res.json({ tracks });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/history:', error);
            res.status(500).json({ error: 'Failed to get server history' });
        }
    });

    // ========== Admin Guild Detail Endpoints ==========
    
    // Admin: Get guild info
    app.get('/api/admin/guild/:guildId/info', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            res.json({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ size: 128 }) || null,
                banner: guild.bannerURL({ size: 512 }) || null,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                createdAt: guild.createdTimestamp,
                description: guild.description || null,
                features: guild.features,
                channels: {
                    text: guild.channels.cache.filter(c => c.type === 0).size,
                    voice: guild.channels.cache.filter(c => c.type === 2).size,
                    category: guild.channels.cache.filter(c => c.type === 4).size
                }
            });
        } catch (error: any) {
            console.error('[API] Error getting guild info:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Admin: Get text channels
    app.get('/api/admin/guild/:guildId/text-channels', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            // Channel types:
            // 0 = Text channel
            // 10 = News thread
            // 11 = Public thread  
            // 12 = Private thread
            const textChannelTypes = [0, 10, 11, 12];

            // Get text channels and threads
            const textChannels = guild.channels.cache
                .filter(c => textChannelTypes.includes(c.type))
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    isThread: c.type === 10 || c.type === 11 || c.type === 12,
                    parentId: c.parentId,
                    parentName: c.parent?.name || null,
                    position: c.type === 0 ? c.position : 999 // Threads don't have position, put at end
                }))
                .sort((a, b) => {
                    // Sort: text channels first by position, then threads
                    if (a.isThread !== b.isThread) {
                        return a.isThread ? 1 : -1;
                    }
                    return a.position - b.position;
                });

            res.json({ channels: textChannels });
        } catch (error: any) {
            console.error('[API] Error getting text channels:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Admin: Get channel messages (chat history)
    app.get('/api/admin/guild/:guildId/messages/:channelId', async (req: Request, res: Response) => {
        try {
            const { guildId, channelId } = req.params;
            const limit = parseInt(req.query.limit as string) || 50;
            
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            // Try to get channel from cache first, then fetch if needed (for threads)
            let channel = guild.channels.cache.get(channelId) as TextChannel;
            
            // If not in cache, try to fetch it (threads might not be cached)
            if (!channel) {
                try {
                    const fetchedChannel = await client.channels.fetch(channelId);
                    if (fetchedChannel) {
                        channel = fetchedChannel as TextChannel;
                    }
                } catch (fetchError) {
                    console.log(`[API] Could not fetch channel ${channelId}:`, fetchError);
                }
            }

            // Support text channel (0) and thread channels (10, 11, 12)
            const validChannelTypes = [0, 10, 11, 12];
            if (!channel || !validChannelTypes.includes(channel.type)) {
                return res.status(404).json({ error: 'Text channel or thread not found' });
            }

            // Fetch messages
            const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });
            
            const formattedMessages = await Promise.all(messages.map(async msg => {
                // Parse user mentions from message
                const mentions = msg.mentions.users.map(u => ({
                    id: u.id,
                    username: u.username,
                    avatar: u.avatarURL({ size: 32 }) || u.defaultAvatarURL
                }));

                // Also extract mentions from embed descriptions
                for (const embed of msg.embeds) {
                    if (embed.description) {
                        const embedMentionMatches = embed.description.match(/<@!?(\d+)>/g) || [];
                        for (const match of embedMentionMatches) {
                            const userId = match.replace(/<@!?(\d+)>/, '$1');
                            // Check if already in mentions
                            if (!mentions.find(m => m.id === userId)) {
                                try {
                                    const member = await guild.members.fetch(userId).catch(() => null);
                                    if (member) {
                                        mentions.push({
                                            id: userId,
                                            username: member.user.username,
                                            avatar: member.user.avatarURL({ size: 32 }) || member.user.defaultAvatarURL
                                        });
                                    } else {
                                        const user = await client.users.fetch(userId).catch(() => null);
                                        if (user) {
                                            mentions.push({
                                                id: userId,
                                                username: user.username,
                                                avatar: user.avatarURL({ size: 32 }) || user.defaultAvatarURL
                                            });
                                        }
                                    }
                                } catch {
                                    // Keep going if can't resolve
                                }
                            }
                        }
                    }
                }

                // Parse role mentions
                const mentionedRoles = msg.mentions.roles.map(r => ({
                    id: r.id,
                    name: r.name,
                    color: r.hexColor
                }));

                // Helper to determine file type category
                const getFileType = (contentType: string | null, name: string): string => {
                    if (!contentType) {
                        const ext = name.split('.').pop()?.toLowerCase();
                        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
                        if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext || '')) return 'video';
                        if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext || '')) return 'audio';
                        if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext || '')) return 'document';
                        return 'file';
                    }
                    if (contentType.startsWith('image/')) return 'image';
                    if (contentType.startsWith('video/')) return 'video';
                    if (contentType.startsWith('audio/')) return 'audio';
                    if (contentType.includes('pdf') || contentType.includes('document')) return 'document';
                    return 'file';
                };

                // Format attachments with full details
                const attachments = msg.attachments.map(a => ({
                    id: a.id,
                    name: a.name,
                    url: a.url,
                    proxyURL: a.proxyURL, // CDN URL for download
                    size: a.size, // bytes
                    contentType: a.contentType,
                    fileType: getFileType(a.contentType, a.name || ''),
                    width: a.width || null, // for images/videos
                    height: a.height || null,
                    spoiler: a.spoiler || false
                }));

                // Format embeds
                const embeds = await Promise.all(msg.embeds.map(async e => {
                    // Resolve mentions in description
                    let description = e.description || null;
                    // Keep the raw <@ID> format - frontend will parse and style mentions
                    
                    return {
                        type: e.data.type,
                        title: e.title || null,
                        description,
                        url: e.url || null,
                        color: e.color || null,
                        provider: e.provider ? {
                            name: e.provider.name,
                            url: e.provider.url
                        } : null,
                        author: e.author ? {
                            name: e.author.name,
                            iconURL: e.author.iconURL
                        } : null,
                        thumbnail: e.thumbnail?.url || null,
                        image: e.image?.url || null,
                        video: e.video?.url || null
                    };
                }));

                return {
                    id: msg.id,
                    content: msg.content,
                    author: {
                        id: msg.author.id,
                        username: msg.author.username,
                        avatar: msg.author.avatarURL({ size: 64 }) || msg.author.defaultAvatarURL,
                        bot: msg.author.bot
                    },
                    timestamp: msg.createdTimestamp,
                    mentions,
                    mentionedRoles,
                    attachments,
                    embeds,
                    reactions: msg.reactions.cache.map(r => ({
                        emoji: r.emoji.name || r.emoji.id,
                        count: r.count
                    })),
                    // Fetch reference message for reply display
                    replyTo: msg.reference?.messageId ? (() => {
                        const refMsg = messages.find(m => m.id === msg.reference?.messageId);
                        if (!refMsg) {
                            return {
                                messageId: msg.reference.messageId,
                                author: null,
                                content: '[Message not loaded]',
                                mentions: []
                            };
                        }
                        return {
                            messageId: refMsg.id,
                            author: {
                                username: refMsg.author.username,
                                avatar: refMsg.author.avatarURL({ size: 32 }) || refMsg.author.defaultAvatarURL
                            },
                            content: refMsg.content?.substring(0, 100) || '[Media/Embed]',
                            mentions: refMsg.mentions.users.map(u => ({
                                id: u.id,
                                username: u.username
                            }))
                        };
                    })() : null,
                    // Thread info if this message started a thread
                    thread: msg.thread ? {
                        id: msg.thread.id,
                        name: msg.thread.name,
                        messageCount: msg.thread.messageCount || 0,
                        lastActivityAt: msg.thread.archiveTimestamp || msg.thread.createdTimestamp,
                        archived: msg.thread.archived || false
                    } : null
                };
            }));
            
            // Sort by timestamp after all promises resolve
            formattedMessages.sort((a, b) => a.timestamp - b.timestamp); // Oldest first

            res.json({ 
                messages: formattedMessages,
                channel: {
                    id: channel.id,
                    name: channel.name
                }
            });
        } catch (error: any) {
            console.error('[API] Error getting messages:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ========== Playlist Fetch API (for Import feature) ==========
    // Fetch playlist data from Spotify/YouTube using Lavalink without adding to queue
    app.post('/api/playlist/fetch', async (req: Request, res: Response) => {
        try {
            const { url } = req.body;
            
            if (!url || typeof url !== 'string') {
                return res.status(400).json({ error: 'URL is required' });
            }

            console.log(`[API] 📋 Fetching playlist info for: ${url}`);

            // Check if Lavalink manager is ready
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Music service is not ready. Please try again later.' });
            }

            // Resolve the URL using Lavalink
            const result = await client.manager.resolve({
                query: url,
                requester: undefined,
            } as any);

            if (!result) {
                return res.status(404).json({ error: 'Could not resolve the playlist URL' });
            }

            if (result.loadType === 'error') {
                return res.status(400).json({ error: 'Failed to load playlist', details: result.exception?.message });
            }

            if (result.loadType === 'empty' || result.loadType === 'no_results') {
                return res.status(404).json({ error: 'Playlist not found or is empty' });
            }

            // Determine platform from URL
            let platform: 'spotify' | 'youtube' | 'unknown' = 'unknown';
            if (url.includes('spotify.com')) {
                platform = 'spotify';
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                platform = 'youtube';
            }

            // Build response based on load type
            if (result.loadType === 'playlist') {
                // DEBUG: Log full track object to find albumName
                if (result.tracks.length > 0) {
                    const firstTrack = result.tracks[0];
                    console.log(`[API DEBUG] ========== TRACK OBJECT ANALYSIS ==========`);
                    console.log(`[API DEBUG] Full track keys:`, Object.keys(firstTrack));
                    console.log(`[API DEBUG] track.info keys:`, Object.keys(firstTrack.info || {}));
                    console.log(`[API DEBUG] track.info:`, JSON.stringify(firstTrack.info, null, 2));
                    
                    // Check for album in different possible locations
                    console.log(`[API DEBUG] ---------- ALBUM SEARCH ----------`);
                    console.log(`[API DEBUG] track.album:`, firstTrack.album);
                    console.log(`[API DEBUG] track.albumName:`, firstTrack.albumName);
                    console.log(`[API DEBUG] track.info.album:`, firstTrack.info?.album);
                    console.log(`[API DEBUG] track.info.albumName:`, firstTrack.info?.albumName);
                    console.log(`[API DEBUG] track.info.albumUrl:`, firstTrack.info?.albumUrl);
                    console.log(`[API DEBUG] track.pluginInfo:`, JSON.stringify(firstTrack.pluginInfo, null, 2));
                    console.log(`[API DEBUG] track.userData:`, JSON.stringify(firstTrack.userData, null, 2));
                    console.log(`[API DEBUG] ============================================`);
                }
                
                // Full playlist - extract track data including album info
                const nowIso = new Date().toISOString();
                
                // For Spotify playlists, fetch album info from Spotify API
                let spotifyAlbumData: Map<string, any> | null = null;
                if (platform === 'spotify') {
                    try {
                        const { getPlaylist: getSpotifyPlaylist, extractPlaylistId } = await import('../functions/spotify/spotifyClient');
                        const { getAlbumInfo, setAlbumInfoBatch, getMissingTrackIds, initSpotifyAlbumCache } = await import('../functions/spotify/spotifyAlbumCache');
                        
                        // Initialize cache if not already
                        initSpotifyAlbumCache();
                        
                        const playlistId = extractPlaylistId(url);
                        if (playlistId) {
                            console.log(`[API] 🎵 Fetching album info from Spotify API...`);
                            const spotifyPlaylist = await getSpotifyPlaylist(playlistId);
                            
                            if (spotifyPlaylist && spotifyPlaylist.tracks.items) {
                                spotifyAlbumData = new Map();
                                const cacheEntries = new Map();
                                
                                for (const item of spotifyPlaylist.tracks.items) {
                                    if (item.track && item.track.id) {
                                        const albumInfo = {
                                            albumName: item.track.album?.name || undefined,
                                            albumReleaseDate: item.track.album?.release_date || undefined,
                                            albumArtUrl: item.track.album?.images?.[0]?.url || undefined,
                                            addedAt: item.added_at || undefined,
                                        };
                                        spotifyAlbumData.set(item.track.id, albumInfo);
                                        cacheEntries.set(item.track.id, albumInfo);
                                    }
                                }
                                
                                // Cache the album info
                                setAlbumInfoBatch(cacheEntries);
                                console.log(`[API] ✅ Got album info for ${spotifyAlbumData.size} tracks from Spotify API`);
                            }
                        }
                    } catch (error) {
                        console.error(`[API] ⚠️ Failed to fetch album info from Spotify:`, error);
                        // Continue without album info
                    }
                }
                
                // Map tracks with album info from Spotify or fallback
                const tracks = result.tracks.map((track: any, index: number) => {
                    // Try to get album info from Spotify data using track identifier
                    let album: string | undefined = undefined;
                    let addedAt: string = nowIso;
                    
                    // Debug first track matching
                    if (index === 0 && spotifyAlbumData) {
                        console.log(`[API DEBUG] Track identifier: "${track.info?.identifier}"`);
                        console.log(`[API DEBUG] Spotify data keys:`, Array.from(spotifyAlbumData.keys()).slice(0, 5));
                        console.log(`[API DEBUG] Match found:`, spotifyAlbumData.has(track.info?.identifier));
                    }
                    
                    if (spotifyAlbumData && track.info?.identifier) {
                        const albumInfo = spotifyAlbumData.get(track.info.identifier);
                        if (albumInfo) {
                            album = albumInfo.albumName;
                            addedAt = albumInfo.addedAt || nowIso;
                        }
                    }
                    
                    // Fallback to Lavalink data
                    if (!album) {
                        album = track.info?.album || track.info?.albumName || track.info?.albumTitle || undefined;
                    }
                    
                    return {
                        title: track.info?.title || 'Unknown',
                        artist: track.info?.author || 'Unknown Artist',
                        duration: track.info?.length || 0,
                        thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                        uri: track.info?.uri || undefined,
                        album,
                        addedAt,
                    };
                });
                
                // Debug: Log first track's album info after mapping
                if (tracks.length > 0) {
                    console.log(`[API DEBUG] ========== MAPPED TRACK DATA ==========`);
                    console.log(`[API DEBUG] First track title: "${tracks[0].title}"`);
                    console.log(`[API DEBUG] First track album: "${tracks[0].album}"`);
                    console.log(`[API DEBUG] First track addedAt: "${tracks[0].addedAt}"`);
                    console.log(`[API DEBUG] ============================================`);
                }

                // Get proper playlist name from playlistInfo (not playlist)
                const playlistName = result.playlistInfo?.name || 'Unknown Playlist';
                
                // Get proper playlist thumbnail using the same function as search and play.ts
                const { getPlaylistThumbnailMain } = await import('../functions/youtube/index');
                const { validateAndConvertThumbnail } = await import('../functions/lavalink/thumbnailValidator');
                
                let playlistThumbnail: string | null = null;
                const firstTrackThumbnail = result.tracks[0]?.info?.thumbnail;
                
                try {
                    // Use the main playlist thumbnail function with fallback
                    playlistThumbnail = await getPlaylistThumbnailMain(url, firstTrackThumbnail, {
                        method: 'auto',
                        fallbackToVideo: true,
                        highQuality: true
                    });
                } catch (error) {
                    console.error('Error fetching playlist thumbnail:', error);
                    // Fallback to first track thumbnail
                    playlistThumbnail = await validateAndConvertThumbnail(firstTrackThumbnail);
                }
                
                // Try to extract owner/author from first track for Spotify, or from playlistInfo
                let playlistOwner = 'Unknown';
                const playlistInfoAny = result.playlistInfo as any;
                if (platform === 'spotify') {
                    // For Spotify playlists, try to get owner from playlistInfo or use first track author as fallback
                    playlistOwner = playlistInfoAny?.author || tracks[0]?.artist || 'Unknown';
                } else {
                    // For YouTube playlists
                    playlistOwner = playlistInfoAny?.author || 'Unknown';
                }

                console.log(`[API] ✅ Fetched playlist: "${playlistName}" by "${playlistOwner}" with ${tracks.length} tracks`);

                res.json({
                    success: true,
                    loadType: 'playlist',
                    platform,
                    playlist: {
                        name: playlistName,
                        thumbnail: playlistThumbnail,
                        trackCount: tracks.length,
                        owner: playlistOwner,
                    },
                    tracks,
                });
            } else if (result.loadType === 'track' || result.loadType === 'search') {
                // Single track or search result
                const track = result.tracks[0];
                if (!track) {
                    return res.status(404).json({ error: 'No track found' });
                }

                console.log(`[API] ✅ Fetched single track: "${track.info?.title}"`);

                res.json({
                    success: true,
                    loadType: 'track',
                    platform,
                    tracks: [{
                        title: track.info?.title || 'Unknown',
                        artist: track.info?.author || 'Unknown Artist',
                        duration: track.info?.length || 0,
                        thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                        uri: track.info?.uri || undefined,
                    }],
                });
            } else {
                return res.status(400).json({ 
                    error: 'Unsupported content type', 
                    loadType: result.loadType 
                });
            }
        } catch (error: any) {
            console.error('[API] ❌ Error fetching playlist:', error);
            res.status(500).json({ 
                error: 'Failed to fetch playlist', 
                message: error.message || 'Unknown error' 
            });
        }
    });

    // ========== Playlist CRUD APIs (with High-Performance Cache) ==========
    
    // GET /api/playlists - Get user's playlists (cache first, then Firebase)
    app.get('/api/playlists', async (req: Request, res: Response) => {
        try {
            const userId = req.query.userId as string;
            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }

            // Try cache first (instant)
            let playlists = getCachedUserPlaylists(userId);
            
            if (playlists) {
                console.log(`[API] 📋 Returning ${playlists.length} playlists from cache for user ${userId}`);
                return res.json({ playlists, source: 'cache' });
            }

            // Cache miss - fetch from Firebase
            console.log(`[API] 📋 Cache miss, fetching from Firebase for user ${userId}`);
            const { getFirestore, isFirebaseInitialized } = await import('../lib/firebase');
            
            if (!isFirebaseInitialized()) {
                return res.status(503).json({ error: 'Firebase not initialized' });
            }

            const db = getFirestore();
            if (!db) {
                return res.status(503).json({ error: 'Firebase database not available' });
            }

            const snapshot = await db.collection('playlists').where('userId', '==', userId).get();
            
            playlists = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    userId: data.userId,
                    name: data.name,
                    description: data.description || '',
                    thumbnail: data.thumbnail || '',
                    trackCount: data.trackCount || 0,
                    tracks: data.tracks || [],
                    sourcePlatform: data.sourcePlatform,
                    sourceUrl: data.sourceUrl,
                    createdAt: data.createdAt?.toDate?.() || data.createdAt,
                    updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                } as Playlist;
            });

            // Sort by createdAt desc
            playlists.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            // Update cache
            setUserPlaylistsCache(userId, playlists);

            res.json({ playlists, source: 'firebase' });
        } catch (error: any) {
            console.error('[API] ❌ Error fetching playlists:', error);
            res.status(500).json({ error: 'Failed to fetch playlists', message: error.message });
        }
    });

    // POST /api/playlists - Create a new playlist
    app.post('/api/playlists', async (req: Request, res: Response) => {
        try {
            const { userId, name, description, thumbnail, tracks, sourcePlatform, sourceUrl } = req.body;

            if (!userId || !name) {
                return res.status(400).json({ error: 'userId and name are required' });
            }

            // Generate ID
            const playlistId = `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();

            const playlist: Playlist = {
                id: playlistId,
                userId,
                name,
                description: description || '',
                thumbnail: thumbnail || tracks?.[0]?.thumbnail || '',
                trackCount: tracks?.length || 0,
                tracks: tracks || [],
                sourcePlatform: sourcePlatform || undefined,
                sourceUrl: sourceUrl || undefined,
                createdAt: now,
                updatedAt: now,
            };

            // Add to cache (will be batched to Firebase)
            addPlaylistToCache(playlist);

            console.log(`[API] ✅ Created playlist "${name}" with ${playlist.trackCount} tracks (cached, pending Firebase)`);

            res.json({ success: true, playlist });
        } catch (error: any) {
            console.error('[API] ❌ Error creating playlist:', error);
            res.status(500).json({ error: 'Failed to create playlist', message: error.message });
        }
    });

    // GET /api/playlists/:id - Get single playlist
    app.get('/api/playlists/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            // Try cache first
            let playlist = getCachedPlaylist(id);

            if (playlist) {
                console.log(`[API] 📋 Returning playlist "${playlist.name}" from cache`);
                return res.json({ playlist, source: 'cache' });
            }

            // Cache miss - fetch from Firebase
            const { getFirestore, isFirebaseInitialized } = await import('../lib/firebase');
            
            if (!isFirebaseInitialized()) {
                return res.status(503).json({ error: 'Firebase not initialized' });
            }

            const db = getFirestore();
            if (!db) {
                return res.status(503).json({ error: 'Firebase database not available' });
            }

            const doc = await db.collection('playlists').doc(id).get();

            if (!doc.exists) {
                return res.status(404).json({ error: 'Playlist not found' });
            }

            const data = doc.data()!;
            playlist = {
                id: doc.id,
                userId: data.userId,
                name: data.name,
                description: data.description || '',
                thumbnail: data.thumbnail || '',
                trackCount: data.trackCount || 0,
                tracks: data.tracks || [],
                sourcePlatform: data.sourcePlatform,
                sourceUrl: data.sourceUrl,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            };

            res.json({ playlist, source: 'firebase' });
        } catch (error: any) {
            console.error('[API] ❌ Error fetching playlist:', error);
            res.status(500).json({ error: 'Failed to fetch playlist', message: error.message });
        }
    });

    // PUT /api/playlists/:id - Update playlist
    app.put('/api/playlists/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            updatePlaylistInCache(id, updates);

            console.log(`[API] ✅ Updated playlist ${id} (cached, pending Firebase)`);
            res.json({ success: true });
        } catch (error: any) {
            console.error('[API] ❌ Error updating playlist:', error);
            res.status(500).json({ error: 'Failed to update playlist', message: error.message });
        }
    });

    // DELETE /api/playlists/:id - Delete playlist
    app.delete('/api/playlists/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            deletePlaylistFromCache(id);

            console.log(`[API] ✅ Deleted playlist ${id} (cached, pending Firebase)`);
            res.json({ success: true });
        } catch (error: any) {
            console.error('[API] ❌ Error deleting playlist:', error);
            res.status(500).json({ error: 'Failed to delete playlist', message: error.message });
        }
    });

    // GET /api/playlists/stats - Get cache statistics
    app.get('/api/playlist-stats', (req: Request, res: Response) => {
        const stats = getPlaylistCacheStats();
        res.json(stats);
    });

    // NOTE: /api/guild/:guildId/play endpoint moved to queue.routes.ts

    // Get all guilds the bot is in (with optional player info)
    // If userId is provided, only return guilds where user is a member
    app.get('/api/guilds', async (req: Request, res: Response) => {
        try {
            const userId = req.query.userId as string | undefined;
            const allGuilds: any[] = [];
            const players = client.manager.initiated ? client.manager.players : new Map();
            
            // Loop through all guilds the bot is in
            for (const [guildId, guild] of client.guilds.cache) {
                const player = players.get(guild.id);
                
                // If userId is provided, check if user is a member of this guild
                let canView = true;
                let canControl = false;
                let isOwner = false;
                let isInVoiceWithBot = false;
                let userVoiceChannelId: string | null = null;
                
                if (userId) {
                    // Check if user is in this guild
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) {
                        canView = false;
                    } else {
                        // User is a member - they can always view
                        canView = true;
                        userVoiceChannelId = member.voice.channelId || null;
                        
                        // Get guild settings to check if user is bot owner
                        const settings = await getGuildSettings(guildId);
                        const isServerOwner = guild.ownerId === userId;
                        const isBotOwner = settings?.ownerId === userId;
                        
                        if (isServerOwner || isBotOwner) {
                            // Owner can always control
                            canControl = true;
                            isOwner = true;
                        } else if (player) {
                            // Player exists - check if user is in same voice channel as bot
                            const botVoiceChannel = player.voiceChannel;
                            
                            if (userVoiceChannelId && userVoiceChannelId === botVoiceChannel) {
                                canControl = true;
                                isInVoiceWithBot = true;
                            }
                        } else {
                            // No player - user can control if they're in a voice channel
                            // (they can start playback and bot will join their channel)
                            if (userVoiceChannelId) {
                                canControl = true;
                            }
                        }
                    }
                }
                
                if (canView) {
                    allGuilds.push({
                        guildId: guild.id,
                        guildName: guild.name,
                        guildIcon: guild.iconURL() || null,
                        memberCount: guild.memberCount || 0,
                        hasPlayer: !!player,
                        isPlaying: player ? !!player.current : false,
                        queueLength: player?.queue?.length || 0,
                        isOwner,
                        isInVoiceWithBot,
                        canControl,
                        userVoiceChannelId
                    });
                }
            }

            // Sort: guilds with active players first, then by name
            allGuilds.sort((a, b) => {
                if (a.isPlaying !== b.isPlaying) return b.isPlaying ? 1 : -1;
                if (a.hasPlayer !== b.hasPlayer) return b.hasPlayer ? 1 : -1;
                return a.guildName.localeCompare(b.guildName);
            });

            res.json({
                count: allGuilds.length,
                guilds: allGuilds
            });
        } catch (error) {
            console.error('Error in /api/guilds:', error);
            res.status(500).json({ error: 'Failed to get guilds', details: String(error) });
        }
    });

    // ========== Guild Settings Endpoints ==========

    // Get guild settings
    app.get('/api/guild/:guildId/settings', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const settings = await getGuildSettings(guildId);
            
            if (!settings) {
                return res.status(404).json({ error: 'Guild settings not found' });
            }

            res.json(settings);
        } catch (error) {
            console.error('Error getting guild settings:', error);
            res.status(500).json({ error: 'Failed to get guild settings' });
        }
    });

    // Update guild settings
    app.post('/api/guild/:guildId/settings', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { musicChannelId, user } = req.body;
            
            // Get guild from Discord
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Bot is not in this server.' });
            }
            
            // Get current settings to ensure we have ownerId
            let currentSettings = await getGuildSettings(guildId);
            
            // If no settings exist, create them with the server owner as bot owner
            if (!currentSettings) {
                console.log(`[API] 🔧 Creating guild settings for ${guild.name} (${guildId})`);
                currentSettings = await upsertGuildSettings({
                    guildId: guildId,
                    guildName: guild.name,
                    ownerId: guild.ownerId, // Use server owner as default bot owner
                    musicChannelId: undefined
                });
                
                if (!currentSettings) {
                    return res.status(500).json({ error: 'Failed to create guild settings' });
                }
            }

            // Check if user has permission to update settings (only owner or server owner)
            const userId = user?.discordId;
            
            if (userId) {
                const isServerOwner = guild.ownerId === userId;
                const isBotOwner = currentSettings.ownerId === userId;
                
                if (!isServerOwner && !isBotOwner) {
                    return res.status(403).json({ error: 'Only the server owner or bot owner can update settings' });
                }
            }

            // Update music channel
            if (musicChannelId !== undefined) {
                await setMusicChannel(guildId, musicChannelId);
                console.log(`[API] 🔧 Music channel set to ${musicChannelId} for guild ${guildId} by ${formatUserInfo(user)}`);
            }

            const updatedSettings = await getGuildSettings(guildId);
            
            // Broadcast settings update to all connected SSE clients
            broadcastToGuild(guildId, 'settingsUpdate', updatedSettings);
            console.log(`[SSE] Broadcasted settingsUpdate for guild ${guildId}`);
            
            res.json({ success: true, settings: updatedSettings });
        } catch (error) {
            console.error('Error updating guild settings:', error);
            res.status(500).json({ error: 'Failed to update guild settings' });
        }
    });

    // Get member info by user ID
    app.get('/api/guild/:guildId/member/:userId', async (req: Request, res: Response) => {
        try {
            const { guildId, userId } = req.params;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            const member = await guild.members.fetch(userId).catch(() => null);
            
            if (!member) {
                // Try to fetch user directly if not a member
                const user = await client.users.fetch(userId).catch(() => null);
                if (user) {
                    return res.json({
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName || user.username,
                        avatar: user.displayAvatarURL() || null,
                        isMember: false
                    });
                }
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                id: member.id,
                username: member.user.username,
                displayName: member.displayName || member.user.username,
                nickname: member.nickname || null,
                avatar: member.displayAvatarURL() || null,
                isMember: true
            });
        } catch (error) {
            console.error('Error getting member info:', error);
            res.status(500).json({ error: 'Failed to get member info' });
        }
    });

    // Get available text channels for a guild
    app.get('/api/guild/:guildId/channels', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const channels = await getTextChannels(client, guildId);
            res.json({ channels });
        } catch (error) {
            console.error('Error getting channels:', error);
            res.status(500).json({ error: 'Failed to get channels' });
        }
    });

    // Get available voice channels for a guild with members info
    app.get('/api/guild/:guildId/voice-channels', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            // Get all voice channels (type 2 = GUILD_VOICE, type 13 = GUILD_STAGE_VOICE)
            const voiceChannels = guild.channels.cache
                .filter(channel => channel.isVoiceBased())
                .map(channel => {
                    const voiceChannel = channel as VoiceChannel;
                    const members = voiceChannel.members.map(member => ({
                        id: member.id,
                        username: member.user.username,
                        displayName: member.displayName || member.user.username,
                        avatar: member.displayAvatarURL({ size: 64 }) || member.user.displayAvatarURL({ size: 64 }),
                        isBot: member.user.bot
                    }));

                    return {
                        id: channel.id,
                        name: channel.name,
                        type: channel.type,
                        memberCount: members.length,
                        members: members.filter(m => !m.isBot) // Filter out bots
                    };
                })
                .sort((a, b) => {
                    // Sort: channels with members first, then by name
                    if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
                    return a.name.localeCompare(b.name);
                });

            console.log(`[API] 🎤 Voice channels requested for guild: ${guild.name} (${guildId}) - Found ${voiceChannels.length} channels`);
            res.json({ channels: voiceChannels });
        } catch (error) {
            console.error('Error getting voice channels:', error);
            res.status(500).json({ error: 'Failed to get voice channels' });
        }
    });

    // Check if user can control the bot (also returns canView)
    app.post('/api/guild/:guildId/can-control', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            
            if (!user?.discordId) {
                return res.status(400).json({ error: 'User discordId is required' });
            }

            // Check view permission first
            const viewResult = await canUserViewBot(client, guildId, user.discordId);
            
            // If user can't view, they definitely can't control
            if (!viewResult.canView) {
                return res.json({
                    canView: false,
                    canControl: false,
                    reason: viewResult.reason
                });
            }

            // Get user's voice channel
            const userVoiceChannelId = await getUserVoiceChannel(client, guildId, user.discordId);
            
            // Check control permission
            const controlResult = await canUserControlBot(client, guildId, user.discordId, userVoiceChannelId);
            
            res.json({
                canView: true,
                canControl: controlResult.canControl,
                reason: controlResult.reason
            });
        } catch (error) {
            console.error('Error checking control permission:', error);
            res.status(500).json({ error: 'Failed to check permission' });
        }
    });

    // ========== Player Control Endpoints ==========
    // All these endpoints use checkControlPermission middleware

    // Pause player
    app.post('/api/guild/:guildId/pause', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] ⏸️ Pause requested for guild: ${guildName} (${guildId}) by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            player.pause(true);
            console.log(`[API] ✅ Successfully paused player for guild: ${guildName}`);
            
            // Broadcast pause event to all SSE clients
            broadcastToGuild(guildId, 'playerPause', {
                paused: true,
                position: player.position,
                by: user?.username || 'Unknown'
            });
            
            res.json({ success: true, paused: true });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/pause:', error);
            res.status(500).json({ error: 'Failed to pause player', details: String(error) });
        }
    });

    // Resume player
    app.post('/api/guild/:guildId/resume', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] ▶️ Resume requested for guild: ${guildName} (${guildId}) by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            player.pause(false);
            console.log(`[API] ✅ Successfully resumed player for guild: ${guildName}`);
            
            // Broadcast resume event to all SSE clients
            broadcastToGuild(guildId, 'playerResume', {
                paused: false,
                position: player.position,
                by: user?.username || 'Unknown'
            });
            
            res.json({ success: true, paused: false });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/resume:', error);
            res.status(500).json({ error: 'Failed to resume player', details: String(error) });
        }
    });

    // Skip track
    app.post('/api/guild/:guildId/skip', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] ⏭️ Skip requested for guild: ${guildName} (${guildId}) by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            const skippedTrack = player.current?.info?.title || 'Unknown';
            player.stop();
            console.log(`[API] ✅ Successfully skipped track: ${skippedTrack}`);
            
            // Increment revision and broadcast queue update
            incrementQueueRevision(guildId);

            // Broadcast queue update (queue shifts)
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: player.queue.map((track: any) => ({
                    title: track.info?.title || 'Unknown',
                    author: track.info?.author || 'Unknown Artist',
                    duration: track.info?.length || 0,
                    thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                    requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                    requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                }))
            });

            res.json({ success: true, message: 'Track skipped' });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/skip:', error);
            res.status(500).json({ error: 'Failed to skip track', details: String(error) });
        }
    });

    // Skip to specific track in queue
    app.post('/api/guild/:guildId/skipto', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { index, user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] ⏩ SkipTo requested for guild: ${guildName} (${guildId}), index: ${index} by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (typeof index !== 'number' || index < 0) {
                console.log(`[API] ❌ Invalid index: ${index}`);
                return res.status(400).json({ error: 'Index must be a non-negative number' });
            }

            const queue = player.queue;
            
            if (index >= queue.length) {
                console.log(`[API] ❌ Index out of range: ${index} >= ${queue.length}`);
                return res.status(400).json({ error: 'Index out of range', queueLength: queue.length });
            }

            const targetTrack = queue[index]?.info?.title || 'Unknown';
            
            // Remove all tracks before the target index
            for (let i = 0; i < index; i++) {
                queue.shift();
            }

            // Stop current track to play the next one (which is now at index 0)
            player.stop();

            console.log(`[API] ✅ Successfully skipped to track #${index + 1}: ${targetTrack}`);
            
            // Increment revision and broadcast queue update
            incrementQueueRevision(guildId);

            // Broadcast queue update
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: player.queue.map((track: any) => ({
                    title: track.info?.title || 'Unknown',
                    author: track.info?.author || 'Unknown Artist',
                    duration: track.info?.length || 0,
                    thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                    requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                    requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                }))
            });

            res.json({ success: true, message: `Skipped to track at position ${index + 1}` });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/skipto:', error);
            res.status(500).json({ error: 'Failed to skip to track', details: String(error) });
        }
    });

    // Play now - Move track to front of queue and skip current
    app.post('/api/guild/:guildId/playnow', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { index, user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] ▶️ PlayNow requested for guild: ${guildName} (${guildId}), index: ${index} by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (typeof index !== 'number' || index < 0) {
                console.log(`[API] ❌ Invalid index: ${index}`);
                return res.status(400).json({ error: 'Index must be a non-negative number' });
            }

            const queue = player.queue;
            
            if (index >= queue.length) {
                console.log(`[API] ❌ Index out of range: ${index} >= ${queue.length}`);
                return res.status(400).json({ error: 'Index out of range', queueLength: queue.length });
            }

            const targetTrack = queue[index];
            const trackTitle = targetTrack?.info?.title || 'Unknown';
            
            // Broadcast "jumpToTrack" BEFORE modifying queue
            // This tells frontend to start animation and block SSE updates
            broadcastToGuild(guildId, 'jumpToTrack', {
                fromIndex: index,
                trackTitle,
                by: user?.username || 'Unknown'
            });
            
            // Remove track from current position
            queue.splice(index, 1);
            
            // Insert at the front of queue (position 0)
            queue.unshift(targetTrack);

            // Stop current track to play the next one (which is now the selected track)
            player.stop();
            
            // Broadcast delayed queue update after animation should be complete
            setTimeout(() => {
                // Increment revision for playnow
                incrementQueueRevision(guildId);

                broadcastToGuild(guildId, 'queueUpdate', {
                    queue: queue.map((track: any) => ({
                        title: track.info?.title || 'Unknown',
                        author: track.info?.author || 'Unknown Artist',
                        duration: track.info?.length || 0,
                        thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                        requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                        requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                    }))
                });
            }, 600); // Wait for frontend animation to complete

            console.log(`[API] ✅ Successfully playing now: ${trackTitle}`);
            res.json({ success: true, message: `Now playing: ${trackTitle}`, isJumpToTrack: true });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/playnow:', error);
            res.status(500).json({ error: 'Failed to play track now', details: String(error) });
        }
    });

    // Previous track (restart current or go back)
    app.post('/api/guild/:guildId/previous', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] ⏮️ Previous requested for guild: ${guildName} (${guildId}) by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            const currentTrack = player.current?.info?.title || 'Unknown';
            
            // If position > 3 seconds, restart current track
            if (player.position > 3000) {
                player.seek(0);
                console.log(`[API] ✅ Successfully restarted track: ${currentTrack}`);
                res.json({ success: true, message: 'Track restarted' });
            } else {
                // Otherwise, seek to 0 (no history tracking in basic implementation)
                player.seek(0);
                console.log(`[API] ✅ Successfully restarted track from beginning: ${currentTrack}`);
                res.json({ success: true, message: 'Track restarted from beginning' });
            }
        } catch (error) {
            console.error('Error in /api/guild/:guildId/previous:', error);
            res.status(500).json({ error: 'Failed to go to previous', details: String(error) });
        }
    });

    // Set volume
    app.post('/api/guild/:guildId/volume', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { volume, user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] 🔊 Volume requested for guild: ${guildName} (${guildId}), volume: ${volume} by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (typeof volume !== 'number' || volume < 0 || volume > 100) {
                console.log(`[API] ❌ Invalid volume: ${volume}`);
                return res.status(400).json({ error: 'Volume must be a number between 0 and 100' });
            }

            player.setVolume(volume);
            
            // Broadcast volume change to all clients via SSE
            broadcastToGuild(guildId, 'volumeChange', { 
                volume: volume,
                by: user?.username || 'Unknown'
            });
            
            console.log(`[API] ✅ Successfully set volume to ${volume}% for guild: ${guildName}`);
            res.json({ success: true, volume });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/volume:', error);
            res.status(500).json({ error: 'Failed to set volume', details: String(error) });
        }
    });

    // Seek to position
    app.post('/api/guild/:guildId/seek', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { position, user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] ⏱️ Seek requested for guild: ${guildName} (${guildId}), position: ${position}ms by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (!player.current) {
                console.log(`[API] ❌ No track currently playing for guild: ${guildName}`);
                return res.status(400).json({ error: 'No track currently playing' });
            }

            if (typeof position !== 'number' || position < 0) {
                console.log(`[API] ❌ Invalid position: ${position}`);
                return res.status(400).json({ error: 'Position must be a positive number in milliseconds' });
            }

            const duration = player.current.info.length;
            const seekPosition = Math.min(position, duration);
            
            player.seek(seekPosition);
            const mins = Math.floor(seekPosition / 60000);
            const secs = Math.floor((seekPosition % 60000) / 1000);
            console.log(`[API] ✅ Successfully seeked to ${mins}:${String(secs).padStart(2, '0')} for guild: ${guildName}`);
            
            // Broadcast seek event to update all clients
            broadcastToGuild(guildId, 'playerSeek', {
                position: seekPosition,
                by: user ? (user.username || 'Unknown User') : 'Unknown User'
            });
            
            res.json({ success: true, position: seekPosition });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/seek:', error);
            res.status(500).json({ error: 'Failed to seek', details: String(error) });
        }
    });

    // ========== Queue Control Endpoints ==========

    // Clear queue
    app.post('/api/guild/:guildId/queue/clear', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] 🗑️ Clear queue requested for guild: ${guildName} (${guildId}) by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            const queueLength = player.queue.length;
            player.queue.clear();
            console.log(`[API] ✅ Successfully cleared ${queueLength} tracks from queue for guild: ${guildName}`);
            
            // Increment revision and broadcast queue update
            incrementQueueRevision(guildId);

            // Broadcast queue update
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: []
            });

            res.json({ success: true, message: 'Queue cleared' });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/queue/clear:', error);
            res.status(500).json({ error: 'Failed to clear queue', details: String(error) });
        }
    });

    // Remove track from queue by index
    app.delete('/api/guild/:guildId/queue/:index', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId, index } = req.params;
            const { user } = req.body;
            const trackIndex = parseInt(index, 10);
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] 🗑️ Remove track requested for guild: ${guildName} (${guildId}), index: ${trackIndex} by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (isNaN(trackIndex) || trackIndex < 0 || trackIndex >= player.queue.length) {
                console.log(`[API] ❌ Invalid track index: ${trackIndex}`);
                return res.status(400).json({ error: 'Invalid track index' });
            }

            const removedTrack = player.queue.splice(trackIndex, 1)[0];
            console.log(`[API] ✅ Successfully removed track: ${removedTrack?.info?.title || 'Unknown'}`);
            
            // Increment revision and broadcast queue update
            incrementQueueRevision(guildId);

            // Broadcast queue update
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: player.queue.map((track: any) => ({
                    title: track.info?.title || 'Unknown',
                    author: track.info?.author || 'Unknown Artist',
                    duration: track.info?.length || 0,
                    thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                    requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                    requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                }))
            });

            res.json({ 
                success: true, 
                message: 'Track removed',
                removedTrack: removedTrack ? {
                    title: removedTrack.info.title,
                    author: removedTrack.info.author
                } : null
            });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/queue/:index:', error);
            res.status(500).json({ error: 'Failed to remove track from queue', details: String(error) });
        }
    });

    // Shuffle queue
    app.post('/api/guild/:guildId/queue/shuffle', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] 🔀 Shuffle queue requested for guild: ${guildName} (${guildId}) by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            const queueLength = player.queue.length;
            player.queue.shuffle();
            console.log(`[API] ✅ Successfully shuffled ${queueLength} tracks for guild: ${guildName}`);
            
            // Increment revision and broadcast queue update
            incrementQueueRevision(guildId);

            // Broadcast queue update
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: player.queue.map((track: any) => ({
                    title: track.info?.title || 'Unknown',
                    author: track.info?.author || 'Unknown Artist',
                    duration: track.info?.length || 0,
                    thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                    requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                    requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                }))
            });

            res.json({ success: true, message: 'Queue shuffled' });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/queue/shuffle:', error);
            res.status(500).json({ error: 'Failed to shuffle queue', details: String(error) });
        }
    });

    // Move track in queue (reorder)
    app.post('/api/guild/:guildId/queue/move', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { from, to, user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] 📋 Move track requested for guild: ${guildName} (${guildId}), from: ${from}, to: ${to} by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (typeof from !== 'number' || typeof to !== 'number') {
                console.log(`[API] ❌ Invalid from/to values: from=${from}, to=${to}`);
                return res.status(400).json({ error: 'from and to must be numbers' });
            }

            // Validate indices - allow to = queue.length for appending to end
            if (from < 0 || from >= player.queue.length || to < 0 || to > player.queue.length) {
                console.log(`[API] ❌ Index out of range: from=${from}, to=${to}, queueLength=${player.queue.length}`);
                return res.status(400).json({ error: 'Invalid index' });
            }

            // Remove track from old position
            const [movedTrack] = player.queue.splice(from, 1);
            
            // Adjust target index if it was after the removed item
            const adjustedTo = to > from ? to - 1 : to;
            
            // Insert at new position
            player.queue.splice(adjustedTo, 0, movedTrack);

            console.log(`[API] ✅ Successfully moved track "${movedTrack?.info?.title || 'Unknown'}" from #${from + 1} to #${adjustedTo + 1}`);
            
            // Increment revision and broadcast queue update
            incrementQueueRevision(guildId);

            // Broadcast queue update
            broadcastToGuild(guildId, 'queueUpdate', {
                queue: player.queue.map((track: any) => ({
                    title: track.info?.title || 'Unknown',
                    author: track.info?.author || 'Unknown Artist',
                    duration: track.info?.length || 0,
                    thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                    requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                    requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                }))
            });

            res.json({ 
                success: true, 
                message: `Moved track from ${from} to ${adjustedTo}`,
                movedTrack: movedTrack ? {
                    title: movedTrack.info.title,
                    author: movedTrack.info.author
                } : null
            });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/queue/move:', error);
            res.status(500).json({ error: 'Failed to move track in queue', details: String(error) });
        }
    });

    // Toggle loop mode
    app.post('/api/guild/:guildId/loop', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { mode, user } = req.body; // 'none' | 'track' | 'queue'
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] 🔁 Loop mode requested for guild: ${guildName} (${guildId}), mode: ${mode || 'toggle'} by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            if (mode && !['none', 'track', 'queue'].includes(mode)) {
                console.log(`[API] ❌ Invalid loop mode: ${mode}`);
                return res.status(400).json({ error: 'Invalid loop mode. Use: none, track, or queue' });
            }

            // Toggle through modes if no mode specified
            if (!mode) {
                const currentLoop = player.loop;
                if (currentLoop === 'none') {
                    player.setLoop('track');
                } else if (currentLoop === 'track') {
                    player.setLoop('queue');
                } else {
                    player.setLoop('none');
                }
            } else {
                player.setLoop(mode);
            }

            console.log(`[API] ✅ Successfully set loop mode to: ${player.loop} for guild: ${guildName}`);
            res.json({ success: true, loop: player.loop });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/loop:', error);
            res.status(500).json({ error: 'Failed to set loop mode', details: String(error) });
        }
    });

    // Toggle 24/7 mode
    app.post('/api/guild/:guildId/247', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { enabled, user } = req.body;
            const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
            console.log(`[API] 🌙 24/7 mode requested for guild: ${guildName} (${guildId}), enabled: ${enabled} by ${formatUserInfo(user)}`);
            
            const player = client.manager.players.get(guildId);

            if (!player) {
                console.log(`[API] ❌ No player found for guild: ${guildName}`);
                return res.status(404).json({ error: 'No player found for this guild' });
            }

            // Toggle or set explicitly
            const currentState = (player as any).get('twentyFourSeven') || false;
            const newState = typeof enabled === 'boolean' ? enabled : !currentState;
            
            (player as any).set('twentyFourSeven', newState);
            
            // Broadcast 24/7 change to all clients via SSE
            broadcastToGuild(guildId, 'twentyFourSevenChange', { 
                enabled: newState,
                by: user?.username || 'Unknown'
            });

            console.log(`[API] ✅ Successfully set 24/7 mode to: ${newState} for guild: ${guildName}`);
            res.json({ success: true, enabled: newState });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/247:', error);
            res.status(500).json({ error: 'Failed to set 24/7 mode', details: String(error) });
        }
    });

    // Get 24/7 mode status
    app.get('/api/guild/:guildId/247', (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const player = client.manager.players.get(guildId);

            if (!player) {
                return res.json({ enabled: false, hasPlayer: false });
            }

            const enabled = (player as any).get('twentyFourSeven') || false;
            res.json({ enabled, hasPlayer: true });
        } catch (error) {
            console.error('Error in GET /api/guild/:guildId/247:', error);
            res.status(500).json({ error: 'Failed to get 24/7 mode status' });
        }
    });

    // ========== Billboard Top Charts Endpoint ==========

    // Get Billboard Top Charts (cached, updates every 3 days)
    app.get('/api/charts/billboard', async (req: Request, res: Response) => {
        try {
            const forceRefresh = req.query.refresh === 'true';
            const limit = parseInt(req.query.limit as string) || 100;
            const offset = parseInt(req.query.offset as string) || 0;
            
            // If force refresh, fetch from API
            if (forceRefresh) {
                const chart = await fetchBillboardChart(true);
                if (!chart) {
                    return res.status(503).json({ error: 'Billboard chart data not available' });
                }
                
                const tracks = chart.tracks.slice(offset, offset + limit);
                
                return res.json({
                    success: true,
                    lastUpdated: chart.lastUpdated,
                    date: chart.date,
                    chart: chart.chart,
                    total: chart.tracks.length,
                    count: tracks.length,
                    tracks
                });
            }
            
            // Otherwise, get from cache (no API call)
            const tracks = getBillboardTracks(limit, offset);
            const chart = await fetchBillboardChart(false); // Check cache
            
            if (!chart) {
                return res.status(503).json({ error: 'Billboard chart data not available' });
            }

            res.json({
                success: true,
                lastUpdated: chart.lastUpdated,
                date: chart.date,
                chart: chart.chart,
                total: chart.tracks.length,
                count: tracks.length,
                tracks
            });
        } catch (error) {
            console.error('Error in /api/charts/billboard:', error);
            res.status(500).json({ error: 'Failed to get Billboard chart', details: String(error) });
        }
    });

    // Get Billboard recommendations formatted for player
    app.get('/api/charts/billboard/recommendations', async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const recommendations = await getBillboardRecommendations(limit);
            
            res.json({
                success: true,
                count: recommendations.length,
                tracks: recommendations
            });
        } catch (error) {
            console.error('Error in /api/charts/billboard/recommendations:', error);
            res.status(500).json({ error: 'Failed to get Billboard recommendations', details: String(error) });
        }
    });

    // ========== SSE (Server-Sent Events) Endpoint ==========
    // Real-time updates for player state - more efficient than WebSocket
    // Uses one-way server-to-client communication
    app.get('/api/guild/:guildId/events', (req: Request, res: Response) => {
        const { guildId } = req.params;
        const guildName = client.guilds.cache.get(guildId)?.name || 'Unknown';
        
        // console.log(`[SSE] Client connecting for guild: ${guildName} (${guildId})`);

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        
        // Prevent timeout
        req.socket.setTimeout(0);
        req.socket.setNoDelay(true);
        req.socket.setKeepAlive(true);

        // Add client to subscriptions with userId for secure session filtering
        const userId = req.query.userId as string | undefined;
        const clientInfo: SSEClientInfo = { res, userId };
        
        if (!sseClients.has(guildId)) {
            sseClients.set(guildId, new Set());
        }
        sseClients.get(guildId)!.add(clientInfo);

        console.log(`[SSE] ✅ Client connected for guild: ${guildName} (${sseClients.get(guildId)!.size} total clients)`);

        // Send initial state immediately
        const player = client.manager.initiated ? client.manager.players.get(guildId) : null;
        
        // Only show track if player is actually playing or paused (not if queue ended)
        const hasActiveTrack = player && player.current && (player.playing || player.paused);
        
        const initData = {
            type: 'init',
            guildId,
            data: hasActiveTrack ? {
                track: {
                    title: player.current.info.title,
                    author: player.current.info.author,
                    duration: player.current.info.length,
                    thumbnail: player.current.info.thumbnail,
                    uri: player.current.info.uri,
                    requester: player.current.info.requester,
                    requesterAvatar: player.current.info.requester?.user?.displayAvatarURL?.() || player.current.info.requester?.displayAvatarURL?.() || undefined,
                    requesterName: player.current.info.requester?.user?.username || player.current.info.requester?.username || undefined,
                },
                position: player.position,
                paused: player.paused,
                volume: player.volume,
                playing: player.playing,
                loop: player.loop,
                queueLength: player.queue.length,
                twentyFourSeven: (player as any).get('twentyFourSeven') || false,
                queue: player.queue.map((track: any) => ({
                    title: track.info?.title || 'Unknown',
                    author: track.info?.author || 'Unknown Artist',
                    duration: track.info?.length || 0,
                    thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
                    requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
                    requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
                }))
            } : {
                track: null,
                playing: false,
                paused: false,
                volume: player?.volume || 100,
                position: 0,
                queue: [],
                twentyFourSeven: player ? ((player as any).get('twentyFourSeven') || false) : false
            },
            timestamp: Date.now()
        };

        res.write(`data: ${JSON.stringify(initData)}\n\n`);

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
            } catch (error) {
                clearInterval(heartbeatInterval);
            }
        }, 30000);

        // Clean up on disconnect
        req.on('close', () => {
            clearInterval(heartbeatInterval);
            const clients = sseClients.get(guildId);
            if (clients) {
                clients.delete(clientInfo);
                if (clients.size === 0) {
                    sseClients.delete(guildId);
                }
            }
            console.log(`[SSE] Client disconnected from guild: ${guildName} (${sseClients.get(guildId)?.size || 0} remaining)`);
        });
    });

    // ========== User SSE Endpoint (for Server List real-time updates) ==========
    app.get('/api/user/:userId/events', async (req: Request, res: Response) => {
        const { userId } = req.params;
        
        console.log(`[UserSSE] Client connecting for user: ${userId}`);

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        
        // Prevent timeout
        req.socket.setTimeout(0);
        req.socket.setNoDelay(true);
        req.socket.setKeepAlive(true);

        // Add client to user subscriptions
        if (!userSseClients.has(userId)) {
            userSseClients.set(userId, new Set());
        }
        userSseClients.get(userId)!.add(res);

        console.log(`[UserSSE] ✅ Client connected for user: ${userId} (${userSseClients.get(userId)!.size} total clients)`);

        // Build initial guild list for this user
        const allGuilds: any[] = [];
        const players = client.manager.initiated ? client.manager.players : new Map();
        const userGuilds = new Set<string>();
        
        for (const [guildId, guild] of client.guilds.cache) {
            const player = players.get(guild.id);
            
            // Check if user is a member of this guild
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;
            
            userGuilds.add(guildId);
            
            const userVoiceChannelId = member.voice.channelId || null;
            const settings = await getGuildSettings(guildId);
            const isServerOwner = guild.ownerId === userId;
            const isBotOwner = settings?.ownerId === userId;
            
            let canControl = false;
            let isInVoiceWithBot = false;
            
            if (isServerOwner || isBotOwner) {
                canControl = true;
            } else if (player) {
                const botVoiceChannel = player.voiceChannel;
                if (userVoiceChannelId && userVoiceChannelId === botVoiceChannel) {
                    canControl = true;
                    isInVoiceWithBot = true;
                }
            } else if (userVoiceChannelId) {
                canControl = true;
            }
            
            allGuilds.push({
                guildId: guild.id,
                guildName: guild.name,
                guildIcon: guild.iconURL() || null,
                memberCount: guild.memberCount || 0,
                hasPlayer: !!player,
                isPlaying: player ? !!player.current : false,
                queueLength: player?.queue?.length || 0,
                isOwner: isServerOwner || isBotOwner,
                isInVoiceWithBot,
                canControl,
                userVoiceChannelId
            });
        }

        // Sort: guilds with active players first, then by name
        allGuilds.sort((a, b) => {
            if (a.isPlaying !== b.isPlaying) return b.isPlaying ? 1 : -1;
            if (a.hasPlayer !== b.hasPlayer) return b.hasPlayer ? 1 : -1;
            return a.guildName.localeCompare(b.guildName);
        });

        // Store user's guild subscriptions for efficient broadcasting
        userGuildSubscriptions.set(userId, userGuilds);

        // Send initial data
        const initData = {
            type: 'userInit',
            userId,
            data: {
                guilds: allGuilds,
                count: allGuilds.length
            },
            timestamp: Date.now()
        };

        res.write(`data: ${JSON.stringify(initData)}\n\n`);

        // Send heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
            } catch (error) {
                clearInterval(heartbeatInterval);
            }
        }, 30000);

        // Clean up on disconnect
        req.on('close', () => {
            clearInterval(heartbeatInterval);
            const clients = userSseClients.get(userId);
            if (clients) {
                clients.delete(res);
                if (clients.size === 0) {
                    userSseClients.delete(userId);
                    userGuildSubscriptions.delete(userId);
                }
            }
            console.log(`[UserSSE] Client disconnected for user: ${userId} (${userSseClients.get(userId)?.size || 0} remaining)`);
        });
    });

    // Get guild sessions (Phase 3 History Redesign)
    app.get('/api/guild/:guildId/sessions', async (req, res) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
            const sessions = await getGuildSessions(req.params.guildId, limit);
            res.json({ sessions });
        } catch (error) {
            console.error('Error fetching sessions:', error);
            res.status(500).json({ error: 'Failed to fetch sessions' });
        }
    });

    // Get sessions for ALL guilds a user is in (optimized for History page)
    app.get('/api/user/:userId/sessions', async (req, res) => {
        try {
            const { userId } = req.params;
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
            
            // Get all guilds user is in - must use fetch, not just cache
            const userGuilds: string[] = [];
            
            // Check each guild the bot is in
            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    // First check cache
                    if (guild.members.cache.has(userId)) {
                        userGuilds.push(guildId);
                        continue;
                    }
                    
                    // If not in cache, try to fetch (this is more reliable)
                    const member = await guild.members.fetch({ user: userId, force: false }).catch(() => null);
                    if (member) {
                        userGuilds.push(guildId);
                    }
                } catch {
                    // User not in this guild, skip
                }
            }
            
            if (userGuilds.length === 0) {
                return res.json({ sessions: [], guilds: [] });
            }
            
            // Fetch sessions from all guilds in parallel (using cache)
            // Fetch 200 per guild to ensure we get all sessions (same as admin)
            const promises = userGuilds.map(guildId => 
                getGuildSessions(guildId, 200).catch(() => [])
            );
            
            const results = await Promise.all(promises);
            
            // Flatten, filter by user participation, and sort by startTime
            const allSessions = results.flat()
                .filter((session: any) => {
                    // Check if user is in participants array
                    if (!session.participants || !Array.isArray(session.participants)) {
                        return false;
                    }
                    return session.participants.some((p: any) => p.userId === userId);
                })
                .sort((a: any, b: any) => b.startTime - a.startTime);
            
            // Get guild info
            const guilds = userGuilds.map(guildId => {
                const guild = client.guilds.cache.get(guildId);
                return {
                    guildId,
                    name: guild?.name || 'Unknown',
                    icon: guild?.icon || null
                };
            });
            
            res.json({ sessions: allSessions, guilds });
        } catch (error) {
            console.error('Error fetching user sessions:', error);
            res.status(500).json({ error: 'Failed to fetch user sessions' });
        }
    });

    // Start server
    const server = app.listen(PORT, async () => {
        console.log(`🚀 API Server running on http://localhost:${PORT}`);
        console.log(`📡 Guild SSE endpoint: /api/guild/:guildId/events`);
        console.log(`👤 User SSE endpoint: /api/user/:userId/events`);
        
        // Initialize Billboard cache on startup
        await initBillboardCache();
        
        // Initialize Playlist cache on startup
        initPlaylistCache();
        
        // Initialize YouTube search cache on startup
        initYouTubeSearchCache();
        
        // Schedule automatic updates every 3 days
        scheduleBillboardUpdates();
    });

    // Attach broadcast functions to server object for external access
    (server as any).broadcast = broadcastToGuild;
    (server as any).broadcastToUser = broadcastToUser;

    // Connect broadcast function to historyCache and ListeningSessionManager for SSE updates
    setBroadcastFunction(broadcastToGuild);
    import('../functions/history/ListeningSessionManager').then(({ setSessionBroadcastFunction }) => {
        setSessionBroadcastFunction(broadcastToGuild);
    });

    return server;
}
