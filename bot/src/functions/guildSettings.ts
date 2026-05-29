import { PrismaClient } from '../lib/prisma';
import { Guild, GuildMember, VoiceBasedChannel } from 'discord.js';
import { clientBot } from '../interfaces/client';

const prisma = new PrismaClient();

export interface GuildSettingsData {
    guildId: string;
    guildName?: string;
    ownerId: string;
    musicChannelId?: string;
}

/**
 * Get guild settings from database
 */
export async function getGuildSettings(guildId: string): Promise<GuildSettingsData | null> {
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId }
        });
        return settings;
    } catch (error) {
        console.error('Error getting guild settings:', error);
        return null;
    }
}

/**
 * Create or update guild settings
 */
export async function upsertGuildSettings(data: GuildSettingsData): Promise<GuildSettingsData | null> {
    try {
        const settings = await prisma.guildSettings.upsert({
            where: { guildId: data.guildId },
            update: {
                guildName: data.guildName,
                ownerId: data.ownerId,
                musicChannelId: data.musicChannelId,
            },
            create: {
                guildId: data.guildId,
                guildName: data.guildName,
                ownerId: data.ownerId,
                musicChannelId: data.musicChannelId,
            }
        });
        return settings;
    } catch (error) {
        console.error('Error upserting guild settings:', error);
        return null;
    }
}

/**
 * Update music channel for a guild
 */
export async function setMusicChannel(guildId: string, channelId: string | null): Promise<boolean> {
    try {
        await prisma.guildSettings.update({
            where: { guildId },
            data: { musicChannelId: channelId }
        });
        return true;
    } catch (error) {
        console.error('Error setting music channel:', error);
        return false;
    }
}

/**
 * Check if a user can VIEW the bot status in a guild
 * - Any member of the guild can view
 * - Returns false if user is not in the guild
 */
export async function canUserViewBot(
    client: clientBot,
    guildId: string,
    userId: string
): Promise<{ canView: boolean; reason: string }> {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return { canView: false, reason: 'Guild not found' };
        }

        // Check if user is a member of the guild (use cache for speed, avoid Discord API call)
        const member = guild.members.cache.get(userId);
        if (!member) {
            return { canView: false, reason: 'Not a member of this server' };
        }

        return { canView: true, reason: 'Guild member' };
    } catch (error) {
        console.error('Error checking user view permission:', error);
        return { canView: false, reason: 'Error checking permissions' };
    }
}

/**
 * Check if a user can CONTROL the bot in a guild
 * - Owner (who invited the bot) can always control
 * - Guild owner (Discord server owner) can always control
 * - If no active player: user in any voice channel can add songs (bot will join their channel)
 * - If player exists: user must be in the same voice channel as the bot
 */
export async function canUserControlBot(
    client: clientBot,
    guildId: string,
    userId: string,
    userVoiceChannelId?: string | null
): Promise<{ canControl: boolean; reason: string }> {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return { canControl: false, reason: 'Guild not found' };
        }

        // Check if user is a member of the guild first (use cache for speed, avoid Discord API call)
        const member = guild.members.cache.get(userId);
        if (!member) {
            return { canControl: false, reason: 'Not a member of this server' };
        }

        // Check if user is the Discord server owner
        if (guild.ownerId === userId) {
            return { canControl: true, reason: 'Server owner' };
        }

        // Get guild settings from database
        const settings = await getGuildSettings(guildId);
        
        // Check if user is the bot owner (who invited the bot)
        if (settings && settings.ownerId === userId) {
            return { canControl: true, reason: 'Bot owner in this guild' };
        }

        // Check if there's an active player
        const player = client.manager.players.get(guildId);
        
        // If no active player, user can control if they're in a voice channel
        // (bot will join their voice channel when they add a song)
        if (!player) {
            if (userVoiceChannelId) {
                return { canControl: true, reason: 'No active player - can start playback' };
            }
            return { canControl: false, reason: 'Join a voice channel to start playback' };
        }

        // Player exists - check if user is in the same voice channel as the bot
        const botVoiceChannelId = player.voiceChannel;
        
        if (!userVoiceChannelId) {
            return { canControl: false, reason: 'You must be in a voice channel to control the bot' };
        }

        if (botVoiceChannelId === userVoiceChannelId) {
            return { canControl: true, reason: 'In same voice channel' };
        }

        return { canControl: false, reason: 'You must be in the same voice channel as the bot' };
    } catch (error) {
        console.error('Error checking user control permission:', error);
        return { canControl: false, reason: 'Error checking permissions' };
    }
}

/**
 * Get user's voice channel in a guild
 */
export async function getUserVoiceChannel(
    client: clientBot,
    guildId: string,
    userId: string
): Promise<string | null> {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return null;

        // Use cache instead of fetch for faster response (avoid Discord API call)
        const member = guild.members.cache.get(userId);
        if (!member) return null;

        return member.voice.channelId || null;
    } catch (error) {
        console.error('Error getting user voice channel:', error);
        return null;
    }
}

/**
 * Get all text channels in a guild (for music channel selection)
 */
export async function getTextChannels(client: clientBot, guildId: string) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return [];

        const channels = guild.channels.cache
            .filter(channel => channel.isTextBased() && !channel.isVoiceBased() && !channel.isThread())
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type
            }));

        return channels;
    } catch (error) {
        console.error('Error getting text channels:', error);
        return [];
    }
}
