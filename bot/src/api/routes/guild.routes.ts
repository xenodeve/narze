import { Router, Request, Response } from 'express';
import { VoiceChannel } from 'discord.js';
import { clientBot } from '../../interfaces/client';
import { 
    getGuildSettings, 
    upsertGuildSettings, 
    setMusicChannel, 
    canUserControlBot,
    canUserViewBot,
    getUserVoiceChannel,
    getTextChannels 
} from '../../functions/guildSettings';
import { formatUserInfo } from '../utils/helpers';
import { broadcastToGuild } from '../utils/sse';

/**
 * Guild Routes
 * Endpoints: settings, member, channels, voice-channels, can-control
 */
export function createGuildRoutes(client: clientBot) {
    const router = Router();

    // Get guild settings
    router.get('/:guildId/settings', async (req: Request, res: Response) => {
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
    router.post('/:guildId/settings', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { musicChannelId, user } = req.body;
            
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Bot is not in this server.' });
            }
            
            let currentSettings = await getGuildSettings(guildId);
            
            if (!currentSettings) {
                console.log(`[API] 🔧 Creating guild settings for ${guild.name} (${guildId})`);
                currentSettings = await upsertGuildSettings({
                    guildId: guildId,
                    guildName: guild.name,
                    ownerId: guild.ownerId,
                    musicChannelId: undefined
                });
                
                if (!currentSettings) {
                    return res.status(500).json({ error: 'Failed to create guild settings' });
                }
            }

            const userId = user?.discordId;
            
            if (userId) {
                const isServerOwner = guild.ownerId === userId;
                const isBotOwner = currentSettings.ownerId === userId;
                
                if (!isServerOwner && !isBotOwner) {
                    return res.status(403).json({ error: 'Only the server owner or bot owner can update settings' });
                }
            }

            if (musicChannelId !== undefined) {
                await setMusicChannel(guildId, musicChannelId);
                console.log(`[API] 🔧 Music channel set to ${musicChannelId} for guild ${guildId} by ${formatUserInfo(user)}`);
            }

            const updatedSettings = await getGuildSettings(guildId);
            
            broadcastToGuild(guildId, 'settingsUpdate', updatedSettings);
            console.log(`[SSE] Broadcasted settingsUpdate for guild ${guildId}`);
            
            res.json({ success: true, settings: updatedSettings });
        } catch (error) {
            console.error('Error updating guild settings:', error);
            res.status(500).json({ error: 'Failed to update guild settings' });
        }
    });

    // Get member info by user ID
    router.get('/:guildId/member/:userId', async (req: Request, res: Response) => {
        try {
            const { guildId, userId } = req.params;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            const member = await guild.members.fetch(userId).catch(() => null);
            
            if (!member) {
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
    router.get('/:guildId/channels', async (req: Request, res: Response) => {
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
    router.get('/:guildId/voice-channels', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

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
                        members: members.filter(m => !m.isBot)
                    };
                })
                .sort((a, b) => {
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

    // Check if user can control the bot
    router.post('/:guildId/can-control', async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { user } = req.body;
            
            if (!user?.discordId) {
                return res.status(400).json({ error: 'User discordId is required' });
            }

            const viewResult = await canUserViewBot(client, guildId, user.discordId);
            
            if (!viewResult.canView) {
                return res.json({
                    canView: false,
                    canControl: false,
                    reason: viewResult.reason
                });
            }

            const userVoiceChannelId = await getUserVoiceChannel(client, guildId, user.discordId);
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

    return router;
}
