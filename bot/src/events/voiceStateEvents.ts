/**
 * Voice State Events Handler
 * Broadcasts voice channel updates via SSE when users join/leave voice channels
 */

import { VoiceState, ChannelType, VoiceChannel } from 'discord.js';
import { client } from '../index';
import chalk from 'chalk';
import { getBroadcast, getBroadcastToUser } from '../index';

// Track to avoid duplicate broadcasts within short time
const lastBroadcast = new Map<string, number>();
const BROADCAST_DEBOUNCE = 1000; // 1 second debounce

/**
 * Get voice channels list for a guild
 */
function getVoiceChannelsList(guildId: string) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];

    return guild.channels.cache
        .filter(channel => channel.type === ChannelType.GuildVoice)
        .map(channel => {
            const voiceChannel = channel as VoiceChannel;
            return {
                id: voiceChannel.id,
                name: voiceChannel.name,
                memberCount: voiceChannel.members.size,
                members: voiceChannel.members.map(m => ({
                    id: m.id,
                    username: m.user.username,
                    displayName: m.displayName,
                    avatar: m.user.displayAvatarURL(),
                })),
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Broadcast voice channels update
 */
function broadcastVoiceChannelsUpdate(guildId: string) {
    // Debounce to avoid spam
    const lastTime = lastBroadcast.get(guildId) || 0;
    if (Date.now() - lastTime < BROADCAST_DEBOUNCE) return;
    lastBroadcast.set(guildId, Date.now());

    const broadcast = getBroadcast();
    if (!broadcast) return;

    const channels = getVoiceChannelsList(guildId);
    broadcast(guildId, 'voiceChannelsUpdate', { channels });
    
    console.log(`[${chalk.bold.magentaBright('VOICE')}] Broadcasted channel update for guild ${guildId} (${channels.length} channels)`);
}

// Register voice state update event
if (client.listenerCount('voiceStateUpdate') === 0) {
    client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
        const guildId = newState.guild?.id || oldState.guild?.id;
        if (!guildId) return;

        // User joined, left, or switched voice channel
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        if (oldChannelId !== newChannelId) {
            // Voice channel state changed - broadcast update
            broadcastVoiceChannelsUpdate(guildId);

            const userId = newState.member?.id || oldState.member?.id;
            const isBotLeaving = userId === client.user?.id && oldChannelId && !newChannelId;

            // Special case: Bot LEFT voice channel completely (player may be destroyed)
            if (isBotLeaving) {
                console.log(`[${chalk.bold.yellowBright('BOT')}] บอทออกจากห้อง ${oldChannelId}`);
                
                const { canUserControlBot } = await import('../functions/guildSettings');
                const guild = client.guilds.cache.get(guildId);
                if (!guild) return;

                const oldChannel = guild.channels.cache.get(oldChannelId) as VoiceChannel | undefined;
                if (oldChannel && oldChannel.members) {
                    const broadcastToUser = getBroadcastToUser();
                    const broadcast = getBroadcast();
                    
                    for (const [memberId, member] of (oldChannel.members as any)) {
                        if (memberId === client.user?.id) continue; // Skip bot itself
                        
                        // Bot left the channel completely
                        // Since bot is no longer in any voice channel, users should see "Can Play"
                        // (they can start a new player by joining voice and playing)

                        // Broadcast to Guild SSE
                        if (broadcast) {
                            broadcast(guildId, 'permissionUpdate', {
                                userId: memberId,
                                canControl: true,
                                reason: 'Can Play'
                            });
                        }

                        // Broadcast to User SSE for Your Servers real-time updates
                        if (broadcastToUser) {
                            broadcastToUser(memberId, 'userPermissionUpdate', {
                                guildId: guildId,
                                isInVoice: false, // Bot left, so no longer in voice with bot
                                canControl: true,
                                reason: 'Can Play'
                            });
                        }
                    }
                    console.log(`[${chalk.bold.cyanBright('USER SSE')}] Sent bot-left updates to users in old channel ${oldChannelId}`);
                }
                return; // Don't continue to player check since bot left
            }

            // Check if bot has an active player
            const player = (client as any).manager?.players.get(guildId);
            if (player && player.voiceChannel) {
                const botChannelId = player.voiceChannel;
                const userId = newState.member?.id || oldState.member?.id;
                
                // Check if this is the BOT being moved
                const isBotMoving = userId === client.user?.id;

                if (isBotMoving) {
                    // Bot was moved to a different channel
                    // Need to update permissions for ALL users in both old and new channels
                    console.log(`[${chalk.bold.yellowBright('BOT')}] บอทถูกย้ายจากห้อง ${oldChannelId} → ${newChannelId}`);

                    const { canUserControlBot } = await import('../functions/guildSettings');
                    const broadcast = getBroadcast();
                    if (!broadcast) return;

                    const guild = client.guilds.cache.get(guildId);
                    if (!guild) return;

                    // Collect all permission updates for batch broadcast
                    const permissionUpdates: Array<{ userId: string; canControl: boolean; reason: string }> = [];

                    // Update permissions for users in OLD channel (lost permission)
                    if (oldChannelId) {
                        const oldChannel = guild.channels.cache.get(oldChannelId);
                        if (oldChannel && 'members' in oldChannel) {
                            for (const [memberId, member] of oldChannel.members) {
                                if (memberId === client.user?.id) continue; // Skip bot itself
                                
                                const permission = await canUserControlBot(
                                    client as any,
                                    guildId,
                                    memberId,
                                    oldChannelId
                                );

                                permissionUpdates.push({
                                    userId: memberId,
                                    canControl: permission.canControl,
                                    reason: permission.reason
                                });
                            }
                        }
                    }

                    // Update permissions for users in NEW channel (gained permission)
                    if (newChannelId) {
                        const newChannel = guild.channels.cache.get(newChannelId);
                        if (newChannel && 'members' in newChannel) {
                            for (const [memberId, member] of newChannel.members) {
                                if (memberId === client.user?.id) continue; // Skip bot itself
                                
                                const permission = await canUserControlBot(
                                    client as any,
                                    guildId,
                                    memberId,
                                    newChannelId
                                );

                                permissionUpdates.push({
                                    userId: memberId,
                                    canControl: permission.canControl,
                                    reason: permission.reason
                                });
                            }
                        }
                    }

                    // Batch broadcast all permission updates in one message (Guild SSE)
                    if (permissionUpdates.length > 0) {
                        broadcast(guildId, 'permissionBatchUpdate', {
                            users: permissionUpdates
                        });
                        console.log(`[${chalk.bold.cyanBright('PERMISSION')}] Batch broadcast permission update for ${permissionUpdates.length} users`);

                        // Also broadcast to each user's User SSE for Your Servers real-time updates
                        const broadcastToUser = getBroadcastToUser();
                        if (broadcastToUser) {
                            for (const update of permissionUpdates) {
                                // Determine if user is now in voice with bot
                                const isInVoiceWithBot = newChannelId ? 
                                    (guild.channels.cache.get(newChannelId) as any)?.members?.has(update.userId) : false;
                                
                                broadcastToUser(update.userId, 'userPermissionUpdate', {
                                    guildId: guildId,
                                    isInVoice: isInVoiceWithBot,
                                    canControl: update.canControl,
                                    reason: update.reason
                                });
                            }
                            console.log(`[${chalk.bold.cyanBright('USER SSE')}] Sent permission updates to ${permissionUpdates.length} users for guild ${guildId}`);
                        }
                    }
                } else {
                    // Regular user joined or left the bot's channel
                    const joinedBotChannel = oldChannelId !== botChannelId && newChannelId === botChannelId;
                    const leftBotChannel = oldChannelId === botChannelId && newChannelId !== botChannelId;

                    if ((joinedBotChannel || leftBotChannel) && userId) {
                        // Import canUserControlBot dynamically to avoid circular dependency
                        const { canUserControlBot } = await import('../functions/guildSettings');
                        
                        // Get updated permission for this user
                        const permission = await canUserControlBot(
                            client as any,
                            guildId,
                            userId,
                            newChannelId
                        );

                        // Broadcast permission update to this specific user
                        const broadcast = getBroadcast();
                        if (broadcast) {
                            broadcast(guildId, 'permissionUpdate', {
                                userId: userId,
                                canControl: permission.canControl,
                                reason: permission.reason
                            });

                            const action = joinedBotChannel ? 'เข้า' : 'ออกจาก';
                            console.log(`[${chalk.bold.cyanBright('PERMISSION')}] User ${userId} ${action}ห้องของบอท - canControl: ${permission.canControl} (${permission.reason})`);
                        }

                        // Also broadcast to User SSE for Your Servers real-time updates
                        const broadcastToUser = getBroadcastToUser();
                        if (broadcastToUser) {
                            broadcastToUser(userId, 'userPermissionUpdate', {
                                guildId: guildId,
                                isInVoice: joinedBotChannel,
                                canControl: permission.canControl,
                                reason: permission.reason
                            });
                            console.log(`[${chalk.bold.cyanBright('USER SSE')}] Sent permission update to user ${userId} for guild ${guildId}`);
                        }
                    }
                }
            }
        }
    });
    
    console.log(`[${chalk.bold.magentaBright('VOICE')}] Voice state event handler registered`);
}

// Register channel events for voice channel create/delete/update
if (client.listenerCount('channelCreate') === 0) {
    client.on('channelCreate', (channel) => {
        if (channel.type !== ChannelType.GuildVoice) return;
        broadcastVoiceChannelsUpdate(channel.guildId);
    });
}

if (client.listenerCount('channelDelete') === 0) {
    client.on('channelDelete', (channel) => {
        if (!('guildId' in channel)) return;
        if (channel.type !== ChannelType.GuildVoice) return;
        broadcastVoiceChannelsUpdate(channel.guildId);
    });
}

if (client.listenerCount('channelUpdate') === 0) {
    client.on('channelUpdate', (oldChannel, newChannel) => {
        if (!('guildId' in newChannel)) return;
        if (newChannel.type !== ChannelType.GuildVoice) return;
        // Only broadcast if name changed
        if (oldChannel.type === ChannelType.GuildVoice && 
            (oldChannel as VoiceChannel).name !== (newChannel as VoiceChannel).name) {
            broadcastVoiceChannelsUpdate(newChannel.guildId);
        }
    });
}

export { broadcastVoiceChannelsUpdate, getVoiceChannelsList };
