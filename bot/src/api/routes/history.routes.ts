import { Router, Request, Response } from 'express';
import { clientBot } from '../../interfaces/client';
import { getUserHistory, getServerHistory } from '../../functions/history/playHistory';
import { getGuildSessions } from '../../functions/history/ListeningSessionManager';

/**
 * History Routes  
 * Endpoints: user history, guild history, sessions
 */
export function createHistoryRoutes(client: clientBot) {
    const router = Router();

    // Get user history (Global) - uses /api/user/:userId/history
    router.get('/user/:userId/history', async (req: Request, res: Response) => {
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
    router.get('/guild/:guildId/history', async (req: Request, res: Response) => {
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

    // Get guild sessions
    router.get('/guild/:guildId/sessions', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
            const sessions = await getGuildSessions(guildId, limit);
            res.json({ sessions });
        } catch (error) {
            console.error('Error fetching sessions:', error);
            res.status(500).json({ error: 'Failed to fetch sessions' });
        }
    });

    // Get sessions for ALL guilds a user is in
    router.get('/user/:userId/sessions', async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
            
            const userGuilds: string[] = [];
            
            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    if (guild.members.cache.has(userId)) {
                        userGuilds.push(guildId);
                        continue;
                    }
                    
                    const member = await guild.members.fetch({ user: userId, force: false }).catch(() => null);
                    if (member) {
                        userGuilds.push(guildId);
                    }
                } catch {
                    // User not in this guild
                }
            }

            if (userGuilds.length === 0) {
                return res.json({ sessions: [] });
            }

            // Get sessions from all user's guilds
            const allSessions: any[] = [];
            
            for (const guildId of userGuilds) {
                const sessions = await getGuildSessions(guildId, limit);
                const guild = client.guilds.cache.get(guildId);
                
                for (const session of sessions) {
                    allSessions.push({
                        ...session,
                        guildId,
                        guildName: guild?.name || 'Unknown Server',
                        guildIcon: guild?.iconURL() || null
                    });
                }
            }

            // Sort by startTime descending and limit
            allSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
            const limitedSessions = allSessions.slice(0, limit);

            res.json({ sessions: limitedSessions });
        } catch (error) {
            console.error('Error fetching user sessions:', error);
            res.status(500).json({ error: 'Failed to fetch user sessions' });
        }
    });

    return router;
}
