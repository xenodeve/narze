import { Response } from 'express';

// ===== Types =====

export interface SSEClientInfo {
    res: Response;
    userId?: string; // Discord user ID of the subscriber
}

export interface GuildQueueState {
    revision: number;
    sequence: number;
    lastModified: number;
}

// ===== SSE State Management =====

// Guild-level SSE subscriptions
export const sseClients = new Map<string, Set<SSEClientInfo>>();

// User-level SSE subscriptions (for server list real-time updates)
export const userSseClients = new Map<string, Set<Response>>();

// Track which guilds each user is subscribed to
export const userGuildSubscriptions = new Map<string, Set<string>>();

// Queue State Management for Recheck System
export const guildQueueStates = new Map<string, GuildQueueState>();

// ===== Queue State Functions =====

export function getQueueState(guildId: string): GuildQueueState {
    if (!guildQueueStates.has(guildId)) {
        guildQueueStates.set(guildId, {
            revision: 0,
            sequence: 0,
            lastModified: Date.now()
        });
    }
    return guildQueueStates.get(guildId)!;
}

export function incrementQueueRevision(guildId: string): number {
    const state = getQueueState(guildId);
    state.revision++;
    state.lastModified = Date.now();
    return state.revision;
}

// ===== Broadcast Functions =====

// Broadcast to a specific user's SSE connections
export function broadcastToUser(userId: string, event: string, data: any) {
    const clients = userSseClients.get(userId);
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify({
        type: event,
        userId,
        data,
        timestamp: Date.now()
    });

    clients.forEach(res => {
        try {
            res.write(`data: ${message}\n\n`);
        } catch (error) {
            console.log(`[UserSSE] Failed to send to client, will be cleaned up`);
        }
    });

    console.log(`[UserSSE] Broadcasted "${event}" to ${clients.size} client(s) for user ${userId}`);
}

// Broadcast guild update to all users subscribed to that guild
export function broadcastGuildUpdateToUsers(guildId: string, guildData: any) {
    userGuildSubscriptions.forEach((guilds, userId) => {
        if (guilds.has(guildId)) {
            broadcastToUser(userId, 'guildUpdate', {
                guildId,
                ...guildData
            });
        }
    });
}

// Broadcast function for SSE (main guild broadcast)
export function broadcastToGuild(guildId: string, event: string, data: any) {
    const clients = sseClients.get(guildId);
    
    // Attach sequence number only for queueUpdate events
    let sequence = 0;
    let revision = 0;

    if (event === 'queueUpdate') {
        const state = getQueueState(guildId);
        state.sequence++;
        sequence = state.sequence;
        revision = state.revision;
    }

    // Only send to guild clients if there are any
    if (clients && clients.size > 0) {
        const message = JSON.stringify({
            type: event,
            guildId,
            data,
            timestamp: Date.now(),
            sequence: sequence > 0 ? sequence : undefined,
            revision: revision > 0 ? revision : undefined
        });

        // For session events, filter by participant
        const isSessionEvent = event === 'sessionUpdate' || event === 'sessionEnd';
        let sentCount = 0;

        // Send to connected SSE clients
        clients.forEach(clientInfo => {
            try {
                // For session events, only send to participants
                if (isSessionEvent && clientInfo.userId) {
                    const participants = data.participants || [];
                    const isParticipant = participants.some((p: any) => p.userId === clientInfo.userId);
                    
                    if (!isParticipant) {
                        return; // Skip this client - not a participant
                    }
                }
                
                clientInfo.res.write(`data: ${message}\n\n`);
                sentCount++;
            } catch (error) {
                console.log(`[SSE] Failed to send to client, will be cleaned up`);
            }
        });

        if (event === 'queueUpdate') {
            console.log(`[SSE] Broadcasted "${event}" (Seq: ${sequence}, Rev: ${revision}) to ${sentCount} client(s)`);
        } else if (isSessionEvent) {
            console.log(`[SSE] Broadcasted "${event}" to ${sentCount}/${clients.size} participant(s) for guild ${guildId}`);
        } else {
            console.log(`[SSE] Broadcasted "${event}" to ${sentCount} client(s) for guild ${guildId}`);
        }
    }

    // Also notify User SSE subscribers about queue/player changes
    if (event === 'queueUpdate' || event === 'trackStart' || event === 'trackEnd' || event === 'queueEnd' || event === 'playerDestroy') {
        const queueLength = data.queueLength ?? data.queue?.length ?? 0;
        const isPlaying = event === 'trackStart' || 
            (event === 'trackEnd' && queueLength > 0) ||
            (event === 'queueUpdate' && data.playing !== false);
        
        const is247 = data.twentyFourSeven || false;
        
        broadcastGuildUpdateToUsers(guildId, {
            queueLength: event === 'queueEnd' ? 0 : queueLength,
            isPlaying: event === 'queueEnd' ? false : isPlaying,
            hasPlayer: event === 'playerDestroy' ? false : 
                       event === 'queueEnd' ? is247 : true
        });
    }
}
