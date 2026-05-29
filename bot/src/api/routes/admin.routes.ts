import { Router, Request, Response } from 'express';
import { clientBot } from '../../interfaces/client';
import { getGuildSessions } from '../../functions/history/ListeningSessionManager';
import { getUserHistory } from '../../functions/history/playHistory';

/**
 * Admin Routes
 * Endpoints: restart, shutdown, admin user sessions/history
 */
export function createAdminRoutes(client: clientBot, gracefulShutdownFn: () => void) {
    const router = Router();

    // Admin restart
    router.post('/admin/restart', (_req: Request, res: Response) => {
        console.log('[Admin] Restart requested');
        res.json({ success: true, message: 'Restart initiated' });
        
        setTimeout(() => {
            gracefulShutdownFn();
            process.exit(0);
        }, 1000);
    });

    // Admin shutdown
    router.post('/admin/shutdown', (_req: Request, res: Response) => {
        console.log('[Admin] Shutdown requested');
        res.json({ success: true, message: 'Shutdown initiated' });
        
        setTimeout(() => {
            gracefulShutdownFn();
            process.exit(0);
        }, 1000);
    });

    // Admin: Get user sessions across all guilds
    router.get('/admin/user/:userId/sessions', async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            const limit = parseInt(req.query.limit as string) || 500;
            
            const allSessions: any[] = [];
            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    const guildSessions = await getGuildSessions(guildId, 200);
                    
                    const userSessions = guildSessions
                        .filter((s: any) => s.participants?.some((p: any) => p.userId === userId))
                        .map((s: any) => ({
                            ...s,
                            guildName: s.guildName || guild.name || 'Unknown Server',
                            startTime: typeof s.startTime === 'number' ? s.startTime : s.startTime?.toMillis?.() || Date.now(),
                            endTime: typeof s.endTime === 'number' ? s.endTime : s.endTime?.toMillis?.() || undefined,
                            trackCount: s.trackCount || s.tracks?.length || 0
                        }));
                    
                    allSessions.push(...userSessions);
                } catch (e) {
                    // Skip this guild on error
                }
            }

            const sortedSessions = allSessions
                .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                .slice(0, limit);

            res.json({ sessions: sortedSessions, total: sortedSessions.length });
        } catch (error: any) {
            console.error('[API] Error getting admin user sessions:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Admin: Get user play history
    router.get('/admin/user/:userId/history', async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            const limit = parseInt(req.query.limit as string) || 500;
            const sortBy = (req.query.sortBy as string) === 'lastPlayedAt' ? 'lastPlayedAt' : 'playCount';

            const allTracks = await getUserHistory(userId, limit, sortBy);

            const history = allTracks.map((track: any) => ({
                id: track.id,
                title: track.title,
                artist: track.artist,
                duration: track.duration,
                playedAt: track.lastPlayedAt,
                source: track.source,
                playCount: track.playCount,
                thumbnail: track.thumbnail
            }));

            res.json({ history, total: allTracks.length });
        } catch (error: any) {
            console.error('[API] Error getting admin user history:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Admin: Get single session by ID
    router.get('/admin/session/:sessionId', async (req: Request, res: Response) => {
        try {
            const { sessionId } = req.params;
            
            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    const guildSessions = await getGuildSessions(guildId, 500);
                    const foundSession = guildSessions.find((s: any) => s.sessionId === sessionId);
                    
                    if (foundSession) {
                        const session = {
                            ...foundSession,
                            guildId,
                            guildName: foundSession.guildName || guild.name || 'Unknown Server',
                            guildIcon: guild.iconURL({ size: 64 }) || null
                        };
                        return res.json({ session });
                    }
                } catch (e) {
                    // Skip on error
                }
            }
            
            res.status(404).json({ error: 'Session not found' });
        } catch (error: any) {
            console.error('[API] Error getting admin session:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Bot status endpoint
    router.get('/status', (_req: Request, res: Response) => {
        try {
            const status = {
                botOnline: client.isReady(),
                botUser: client.user?.tag || 'Unknown',
                guildCount: client.guilds.cache.size,
                uptime: client.uptime,
                timestamp: new Date().toISOString()
            };
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get bot status' });
        }
    });

    // Get all guilds list (admin)
    router.get('/admin/guilds', (_req: Request, res: Response) => {
        try {
            const guilds = client.guilds.cache.map(guild => ({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL(),
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                hasPlayer: client.manager?.players?.has(guild.id) || false,
                joinedAt: guild.joinedAt
            }));
            
            res.json({ guilds, total: guilds.length });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
