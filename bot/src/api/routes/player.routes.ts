import { Router, Request, Response } from 'express';
import { clientBot } from '../../interfaces/client';
import { formatUserInfo } from '../utils/helpers';
import { broadcastToGuild, incrementQueueRevision } from '../utils/sse';

/**
 * Player Control Routes
 * Endpoints: pause, resume, skip, skipto, playnow, previous, volume, seek
 */
export function createPlayerRoutes(client: clientBot, checkControlPermission: any) {
    const router = Router();

    // Pause player
    router.post('/:guildId/pause', checkControlPermission, (req: Request, res: Response) => {
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
            
            broadcastToGuild(guildId, 'playerPause', {
                paused: true,
                position: player.position,
                by: user?.username || 'Unknown'
            });
            
            res.json({ success: true, paused: true });
        } catch (error) {
            console.error('Error in pause:', error);
            res.status(500).json({ error: 'Failed to pause player', details: String(error) });
        }
    });

    // Resume player
    router.post('/:guildId/resume', checkControlPermission, (req: Request, res: Response) => {
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
            
            broadcastToGuild(guildId, 'playerResume', {
                paused: false,
                position: player.position,
                by: user?.username || 'Unknown'
            });
            
            res.json({ success: true, paused: false });
        } catch (error) {
            console.error('Error in resume:', error);
            res.status(500).json({ error: 'Failed to resume player', details: String(error) });
        }
    });

    // Skip track
    router.post('/:guildId/skip', checkControlPermission, (req: Request, res: Response) => {
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
            
            incrementQueueRevision(guildId);

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
            console.error('Error in skip:', error);
            res.status(500).json({ error: 'Failed to skip track', details: String(error) });
        }
    });

    // Skip to specific track in queue
    router.post('/:guildId/skipto', checkControlPermission, (req: Request, res: Response) => {
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
            
            for (let i = 0; i < index; i++) {
                queue.shift();
            }

            player.stop();

            console.log(`[API] ✅ Successfully skipped to track #${index + 1}: ${targetTrack}`);
            
            incrementQueueRevision(guildId);

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
            console.error('Error in skipto:', error);
            res.status(500).json({ error: 'Failed to skip to track', details: String(error) });
        }
    });

    // Play now - Move track to front of queue and skip current
    router.post('/:guildId/playnow', checkControlPermission, (req: Request, res: Response) => {
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
            
            broadcastToGuild(guildId, 'jumpToTrack', {
                fromIndex: index,
                trackTitle,
                by: user?.username || 'Unknown'
            });
            
            queue.splice(index, 1);
            queue.unshift(targetTrack);

            player.stop();
            
            setTimeout(() => {
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
            }, 600);

            console.log(`[API] ✅ Successfully playing now: ${trackTitle}`);
            res.json({ success: true, message: `Now playing: ${trackTitle}`, isJumpToTrack: true });
        } catch (error) {
            console.error('Error in playnow:', error);
            res.status(500).json({ error: 'Failed to play track now', details: String(error) });
        }
    });

    // Previous track (restart current or go back)
    router.post('/:guildId/previous', checkControlPermission, (req: Request, res: Response) => {
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
            
            // Always seek to beginning
            player.seek(0);
            
            // Broadcast seek event to all clients so they update their progress bars
            broadcastToGuild(guildId, 'playerSeek', {
                position: 0,
                by: user?.username || 'Unknown'
            });
            
            console.log(`[API] ✅ Successfully restarted track: ${currentTrack}`);
            res.json({ success: true, message: 'Track restarted' });
        } catch (error) {
            console.error('Error in previous:', error);
            res.status(500).json({ error: 'Failed to go to previous', details: String(error) });
        }
    });

    // Set volume
    router.post('/:guildId/volume', checkControlPermission, (req: Request, res: Response) => {
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
            
            broadcastToGuild(guildId, 'volumeChange', { 
                volume: volume,
                by: user?.username || 'Unknown'
            });
            
            console.log(`[API] ✅ Successfully set volume to ${volume}% for guild: ${guildName}`);
            res.json({ success: true, volume });
        } catch (error) {
            console.error('Error in volume:', error);
            res.status(500).json({ error: 'Failed to set volume', details: String(error) });
        }
    });

    // Seek to position
    router.post('/:guildId/seek', checkControlPermission, (req: Request, res: Response) => {
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
            
            broadcastToGuild(guildId, 'playerSeek', {
                position: seekPosition,
                by: user ? (user.username || 'Unknown User') : 'Unknown User'
            });
            
            res.json({ success: true, position: seekPosition });
        } catch (error) {
            console.error('Error in seek:', error);
            res.status(500).json({ error: 'Failed to seek', details: String(error) });
        }
    });

    return router;
}
