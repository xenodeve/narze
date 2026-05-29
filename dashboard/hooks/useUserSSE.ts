'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface Guild {
  guildId: string;
  guildName: string;
  guildIcon?: string;
  memberCount?: number;
  hasPlayer?: boolean;
  isPlaying?: boolean;
  queueLength?: number;
  isOwner?: boolean;
  isInVoiceWithBot?: boolean;
  canControl?: boolean;
  userVoiceChannelId?: string | null;
}

interface UserSSEMessage {
  type: string;
  userId: string;
  data: any;
  timestamp: number;
}

/**
 * useUserSSE - Server-Sent Events hook for user-level updates
 * 
 * Used for real-time server list updates across all guilds the user is in.
 * Receives:
 * - userInit: Initial guild list on connection
 * - guildUpdate: When queue/player changes in any subscribed guild
 * - heartbeat: Keep-alive every 30 seconds
 */
export function useUserSSE(userId: string | null) {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const eventSource = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const currentUserId = useRef<string | null>(null);
  const maxReconnectAttempts = 5;

  const cleanup = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    
    if (eventSource.current) {
      eventSource.current.close();
      eventSource.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!userId) return;

    cleanup();
    
    currentUserId.current = userId;
    reconnectAttempts.current = 0;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';
      const sseUrl = `${baseUrl}/api/user/${userId}/events`;
      
      console.log(`[UserSSE] 📡 Connecting to ${sseUrl}`);
      
      eventSource.current = new EventSource(sseUrl);

      eventSource.current.onopen = () => {
        console.log(`[UserSSE] ✅ Connected`);
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      eventSource.current.onmessage = (event) => {
        try {
          const message: UserSSEMessage = JSON.parse(event.data);
          
          // Skip heartbeat messages
          if (message.type === 'heartbeat') {
            return;
          }
          
          console.log(`[UserSSE] 📨 Message: type=${message.type}`);
          
          if (message.type === 'userInit') {
            // Initial guild list
            setGuilds(message.data.guilds || []);
            setLoading(false);
          } else if (message.type === 'guildUpdate') {
            // Update specific guild
            setGuilds(prev => prev.map(guild => {
              if (guild.guildId === message.data.guildId) {
                return {
                  ...guild,
                  queueLength: message.data.queueLength ?? guild.queueLength,
                  isPlaying: message.data.isPlaying ?? guild.isPlaying,
                  hasPlayer: message.data.hasPlayer ?? guild.hasPlayer,
                };
              }
              return guild;
            }));
          } else if (message.type === 'userPermissionUpdate') {
            // Real-time permission update when user joins/leaves voice channel
            setGuilds(prev => prev.map(guild => {
              if (guild.guildId === message.data.guildId) {
                return {
                  ...guild,
                  isInVoiceWithBot: message.data.isInVoice ?? guild.isInVoiceWithBot,
                  canControl: message.data.canControl ?? guild.canControl,
                };
              }
              return guild;
            }));
            console.log(`[UserSSE] 🔄 Permission updated for guild ${message.data.guildId}: isInVoice=${message.data.isInVoice}, canControl=${message.data.canControl}`);
          }
        } catch (err) {
          console.error(`[UserSSE] ❌ Failed to parse message:`, err);
        }
      };

      eventSource.current.onerror = () => {
        console.warn(`[UserSSE] ⚠️ Connection error`);
        setConnected(false);

        if (reconnectAttempts.current >= maxReconnectAttempts) {
          cleanup();
          setError('Max reconnection attempts reached');
          return;
        }

        if (eventSource.current?.readyState === EventSource.CLOSED) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[UserSSE] 🔄 Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          cleanup();
          reconnectTimeout.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };
    } catch (err: any) {
      console.error('[UserSSE] ❌ Failed to create connection:', err.message || err);
      setError(err.message || 'Failed to create SSE connection');
    }
  }, [userId, cleanup]);

  useEffect(() => {
    if (userId) {
      setLoading(true);
      setGuilds([]);
      connect();
    } else {
      cleanup();
      setConnected(false);
      setGuilds([]);
      setLoading(false);
    }

    return () => {
      cleanup();
    };
  }, [userId, connect, cleanup]);

  return { guilds, connected, error, loading };
}
