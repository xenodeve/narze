import { Router, Request, Response } from 'express';
import { clientBot } from '../../interfaces/client';
import { formatUserInfo } from '../utils/helpers';
import { broadcastToGuild, incrementQueueRevision } from '../utils/sse';

/**
 * Queue Control Routes
 * Endpoints: clear, remove, shuffle, move, loop, 247
 */
export function createQueueRoutes(client: clientBot, checkControlPermission: any) {
    const router = Router();

    // Helper to format queue tracks
    const formatQueueTracks = (queue: any[]) => queue.map((track: any) => ({
        title: track.info?.title || 'Unknown',
        author: track.info?.author || 'Unknown Artist',
        duration: track.info?.length || 0,
        thumbnail: track.info?.artworkUrl || track.info?.thumbnail || undefined,
        requesterAvatar: track.info?.requester?.user?.displayAvatarURL?.() || track.info?.requester?.displayAvatarURL?.() || undefined,
        requesterName: track.info?.requester?.user?.username || track.info?.requester?.username || undefined,
    }));

    // Clear queue
    router.post('/:guildId/queue/clear', checkControlPermission, (req: Request, res: Response) => {
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
            
            incrementQueueRevision(guildId);
            broadcastToGuild(guildId, 'queueUpdate', { queue: [] });

            res.json({ success: true, message: 'Queue cleared' });
        } catch (error) {
            console.error('Error in queue/clear:', error);
            res.status(500).json({ error: 'Failed to clear queue', details: String(error) });
        }
    });

    // Remove track from queue by index
    router.delete('/:guildId/queue/:index', checkControlPermission, (req: Request, res: Response) => {
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
            
            incrementQueueRevision(guildId);
            broadcastToGuild(guildId, 'queueUpdate', { queue: formatQueueTracks(player.queue) });

            res.json({ 
                success: true, 
                message: 'Track removed',
                removedTrack: removedTrack ? {
                    title: removedTrack.info.title,
                    author: removedTrack.info.author
                } : null
            });
        } catch (error) {
            console.error('Error in queue/remove:', error);
            res.status(500).json({ error: 'Failed to remove track from queue', details: String(error) });
        }
    });

    // Shuffle queue
    router.post('/:guildId/queue/shuffle', checkControlPermission, (req: Request, res: Response) => {
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
            
            incrementQueueRevision(guildId);
            broadcastToGuild(guildId, 'queueUpdate', { queue: formatQueueTracks(player.queue) });

            res.json({ success: true, message: 'Queue shuffled' });
        } catch (error) {
            console.error('Error in queue/shuffle:', error);
            res.status(500).json({ error: 'Failed to shuffle queue', details: String(error) });
        }
    });

    // Move track in queue (reorder)
    router.post('/:guildId/queue/move', checkControlPermission, (req: Request, res: Response) => {
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

            if (from < 0 || from >= player.queue.length || to < 0 || to > player.queue.length) {
                console.log(`[API] ❌ Index out of range: from=${from}, to=${to}, queueLength=${player.queue.length}`);
                return res.status(400).json({ error: 'Invalid index' });
            }

            const [movedTrack] = player.queue.splice(from, 1);
            const adjustedTo = to > from ? to - 1 : to;
            player.queue.splice(adjustedTo, 0, movedTrack);

            console.log(`[API] ✅ Successfully moved track "${movedTrack?.info?.title || 'Unknown'}" from #${from + 1} to #${adjustedTo + 1}`);
            
            incrementQueueRevision(guildId);
            broadcastToGuild(guildId, 'queueUpdate', { queue: formatQueueTracks(player.queue) });

            res.json({ 
                success: true, 
                message: `Moved track from ${from} to ${adjustedTo}`,
                movedTrack: movedTrack ? {
                    title: movedTrack.info.title,
                    author: movedTrack.info.author
                } : null
            });
        } catch (error) {
            console.error('Error in queue/move:', error);
            res.status(500).json({ error: 'Failed to move track in queue', details: String(error) });
        }
    });

    // Toggle loop mode
    router.post('/:guildId/loop', checkControlPermission, (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { mode, user } = req.body;
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
            console.error('Error in loop:', error);
            res.status(500).json({ error: 'Failed to set loop mode', details: String(error) });
        }
    });

    // Toggle 24/7 mode (POST)
    router.post('/:guildId/247', checkControlPermission, (req: Request, res: Response) => {
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

            const currentState = (player as any).get('twentyFourSeven') || false;
            const newState = typeof enabled === 'boolean' ? enabled : !currentState;
            
            (player as any).set('twentyFourSeven', newState);
            
            broadcastToGuild(guildId, 'twentyFourSevenChange', { 
                enabled: newState,
                by: user?.username || 'Unknown'
            });

            console.log(`[API] ✅ Successfully set 24/7 mode to: ${newState} for guild: ${guildName}`);
            res.json({ success: true, enabled: newState });
        } catch (error) {
            console.error('Error in 247:', error);
            res.status(500).json({ error: 'Failed to set 24/7 mode', details: String(error) });
        }
    });

    // Get 24/7 mode status (GET)
    router.get('/:guildId/247', (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const player = client.manager.players.get(guildId);

            if (!player) {
                return res.json({ enabled: false, hasPlayer: false });
            }

            const enabled = (player as any).get('twentyFourSeven') || false;
            res.json({ enabled, hasPlayer: true });
        } catch (error) {
            console.error('Error in GET 247:', error);
            res.status(500).json({ error: 'Failed to get 24/7 mode status' });
        }
    });

    // Add track to queue (play) using Lavalink search
    router.post('/:guildId/play', checkControlPermission, async (req: Request, res: Response) => {
        try {
            if (!client.manager.initiated) {
                return res.status(503).json({ error: 'Bot manager not ready yet' });
            }

            const { guildId } = req.params;
            const { query, user, targetVoiceChannelId } = req.body;

            if (!query || !String(query).trim()) {
                return res.status(400).json({ error: 'Query is required' });
            }

            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            // Import required functions
            const { playerCreate } = await import('../../functions/lavalink/manager');
            const { getUserVoiceChannel, getGuildSettings } = await import('../../functions/guildSettings');

            // Fetch member & voice channel
            const member = user?.discordId
                ? await guild.members.fetch(user.discordId).catch(() => null)
                : null;
            
            // Get user's current voice channel
            const userVoiceChannelId = user?.discordId
                ? await getUserVoiceChannel(client, guildId, user.discordId)
                : null;
            
            let voiceChannel: any;

            // Check if player already exists and use its voice channel
            const existingPlayer = client.manager.players.get(guildId);
            if (existingPlayer && existingPlayer.voiceChannel) {
                const existingChannel = guild.channels.cache.get(existingPlayer.voiceChannel);
                if (existingChannel && existingChannel.isVoiceBased()) {
                    voiceChannel = existingChannel;
                }
            }
            
            // Case 1: User is in a voice channel - use that channel
            if (userVoiceChannelId) {
                voiceChannel = guild.channels.cache.get(userVoiceChannelId);
            }
            // Case 2: Owner/BotOwner provides targetVoiceChannelId
            else if (targetVoiceChannelId && user?.discordId) {
                const settings = await getGuildSettings(guildId);
                const isOwner = guild.ownerId === user.discordId || settings?.ownerId === user.discordId;
                if (isOwner) {
                    const targetChannel = guild.channels.cache.get(targetVoiceChannelId);
                    if (targetChannel && targetChannel.isVoiceBased()) {
                        voiceChannel = targetChannel;
                        console.log(`[API] 🎯 Owner selected voice channel: ${voiceChannel.name}`);
                    }
                }
            }
            // Case 3: No voice channel but existing player - owner can use existing
            else if (existingPlayer && user?.discordId) {
                const settings = await getGuildSettings(guildId);
                const isOwner = guild.ownerId === user.discordId || settings?.ownerId === user.discordId;
                if (isOwner && existingPlayer.voiceChannel) {
                    const existingChannel = guild.channels.cache.get(existingPlayer.voiceChannel);
                    if (existingChannel && existingChannel.isVoiceBased()) {
                        voiceChannel = existingChannel;
                        console.log(`[API] 🎯 Owner using existing player's voice channel: ${voiceChannel.name}`);
                    }
                }
            }

            if (!voiceChannel) {
                return res.status(400).json({ 
                    error: 'User must be in a voice channel',
                    requiresVoiceChannel: true,
                    canSelectChannel: user?.discordId ? 
                        (guild.ownerId === user.discordId || (await getGuildSettings(guildId))?.ownerId === user.discordId) 
                        : false
                });
            }

            // Resolve text channel from settings or fallback
            const settings = await getGuildSettings(guildId);
            let textChannel: any = null;

            if (settings?.musicChannelId) {
                const channel = guild.channels.cache.get(settings.musicChannelId);
                if (channel && channel.isTextBased() && !channel.isVoiceBased() && !channel.isThread()) {
                    textChannel = channel;
                }
            }

            if (!textChannel) {
                const fallback = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && !c.isVoiceBased() && !c.isThread());
                if (fallback && fallback.isTextBased() && !fallback.isVoiceBased() && !fallback.isThread()) {
                    textChannel = fallback;
                }
            }

            if (!textChannel) {
                return res.status(500).json({ error: 'No suitable text channel found' });
            }

            // Create or reuse player
            const player = playerCreate(guild, textChannel, voiceChannel);
            
            // Ensure player is connected before playing
            if (!player.connected) {
                await player.connect();
                console.log(`[API] 🔗 Connected player to voice channel: ${voiceChannel.name}`);
            }

            const queryStr = String(query);
            let searchQuery = queryStr;

            // Check if query is already a URL (YouTube, Spotify, SoundCloud, etc.)
            const urlMatch = queryStr.match(/https?:\/\/[^\s]+/i);
            
            if (urlMatch) {
                searchQuery = urlMatch[0];
                console.log(`[API] Detected URL in query, using directly: ${searchQuery}`);
            } else if (queryStr.includes('youtube.com') || queryStr.includes('youtu.be') || queryStr.includes('music.youtube.com')) {
                searchQuery = `https://${queryStr}`;
                console.log(`[API] Detected YouTube URL without protocol: ${searchQuery}`);
            } else {
                console.log(`[API] Text search query: ${searchQuery}`);
            }

            // Search & add track
            const result = await client.manager.resolve({
                query: searchQuery,
                requester: (member || undefined),
            } as any);

            if (!result || !Array.isArray(result.tracks) || result.tracks.length === 0) {
                return res.status(404).json({ error: 'No tracks found for this query' });
            }

            // Prefer first track; for playlist loadType add all
            let addedCount = 0;
            let firstTrack: any = null;

            if (result.loadType === 'playlist') {
                result.tracks.forEach((track: any, idx: number) => {
                    player.queue.add(track);
                    if (idx === 0) firstTrack = track;
                    addedCount += 1;
                });
            } else {
                firstTrack = result.tracks[0];
                player.queue.add(firstTrack);
                addedCount = 1;
            }

            const shouldStart = !player.playing && !player.paused;
            if (shouldStart) {
                // Set default volume (15%) on first play, same as play command
                if (player.volume === 100 && !(player as any).get('isVolumeChangeCommand')) {
                    const volumeDefault = 15;
                    player.setVolume(volumeDefault);
                    console.log(`[API] 🔊 Set default volume to ${volumeDefault}%`);
                }
                await player.play();
            }

            // Increment revision and broadcast queue update
            incrementQueueRevision(guildId);
            
            // Broadcast queue update to all SSE clients
            broadcastToGuild(guildId, 'queueUpdate', { queue: formatQueueTracks(player.queue) });
            console.log(`[SSE] Broadcasted queueUpdate for guild ${guildId} (Added ${addedCount} tracks)`);

            res.json({
                success: true,
                started: shouldStart,
                added: addedCount,
                track: firstTrack ? {
                    title: firstTrack.info?.title || 'Unknown',
                    author: firstTrack.info?.author || 'Unknown',
                    duration: firstTrack.info?.length || 0,
                    uri: firstTrack.info?.uri || '',
                    thumbnail: firstTrack.info?.thumbnail || null,
                } : null,
                queueLength: player.queue.length,
            });
        } catch (error) {
            console.error('Error in /api/guild/:guildId/play:', error);
            res.status(500).json({ error: 'Failed to play track', details: String(error) });
        }
    });

    return router;
}
