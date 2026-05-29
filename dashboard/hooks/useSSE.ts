'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';

interface SSEMessage {
  type: string;
  guildId: string;
  data: any;
  timestamp: number;
  sequence?: number;
  eventId?: number;
}

interface SSEConnection {
  eventSource: EventSource;
  subscribers: Set<(message: SSEMessage) => void>;
  lastSequence: number;
  reconnectTimeout: NodeJS.Timeout | null;
  reconnectAttempts: number;
}

// Global map of SSE connections - ONE per guildId, shared across all components
const globalConnections = new Map<string, SSEConnection>();
const maxReconnectAttempts = 5;

// Fetch fresh player state and create synthetic init message
async function fetchPlayerState(guildId: string): Promise<SSEMessage | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';
    const res = await fetch(`${baseUrl}/api/guild/${guildId}/player`);
    if (!res.ok) return null;
    
    const playerData = await res.json();
    return {
      type: 'init',
      guildId,
      data: {
        track: playerData?.track || null,
        current: playerData?.track || null,
        playing: playerData?.playing ?? false,
        position: playerData?.position || 0,
        volume: playerData?.volume || 15,
        twentyFourSeven: playerData?.twentyFourSeven || false,
        queue: playerData?.queue || [],
      },
      timestamp: Date.now(),
    };
  } catch (err) {
    console.warn('[SSE] Failed to fetch player state:', err);
    return null;
  }
}

function getOrCreateConnection(
  guildId: string,
  onMessage: (message: SSEMessage) => void,
  onConnect: () => void,
  onDisconnect: () => void,
  onInitialData: (message: SSEMessage) => void
): () => void {
  let connection = globalConnections.get(guildId);
  
  if (connection) {
    console.log(`[SSE Singleton] Reusing existing connection for guild ${guildId} (${connection.subscribers.size + 1} subscribers)`);
    connection.subscribers.add(onMessage);
    
    // If already connected, notify and fetch fresh state for this new subscriber
    if (connection.eventSource.readyState === EventSource.OPEN) {
      onConnect();
      
      // Fetch fresh state for this new subscriber
      console.log(`[SSE Singleton] Fetching fresh state for new subscriber on guild ${guildId}`);
      fetchPlayerState(guildId).then(initMessage => {
        if (initMessage) {
          console.log(`[SSE Singleton] Delivering init to new subscriber:`, initMessage.data.track?.title || 'No track');
          onInitialData(initMessage);
        }
      });
    }
    
    // Return unsubscribe function
    return () => {
      connection!.subscribers.delete(onMessage);
      console.log(`[SSE Singleton] Unsubscribed from guild ${guildId} (${connection!.subscribers.size} remaining)`);
      
      if (connection!.subscribers.size === 0) {
        setTimeout(() => {
          const conn = globalConnections.get(guildId);
          if (conn && conn.subscribers.size === 0) {
            console.log(`[SSE Singleton] Closing unused connection for guild ${guildId}`);
            conn.eventSource.close();
            if (conn.reconnectTimeout) clearTimeout(conn.reconnectTimeout);
            globalConnections.delete(guildId);
          }
        }, 1000);
      }
    };
  }
  
  // Create new connection
  const baseUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';
  const sseUrl = `${baseUrl}/api/guild/${guildId}/events`;
  
  console.log(`[SSE Singleton] Creating NEW connection for guild ${guildId}: ${sseUrl}`);
  
  const eventSource = new EventSource(sseUrl);
  connection = {
    eventSource,
    subscribers: new Set([onMessage]),
    lastSequence: 0,
    reconnectTimeout: null,
    reconnectAttempts: 0,
  };
  
  globalConnections.set(guildId, connection);
  
  eventSource.onopen = () => {
    console.log(`[SSE Singleton] ✅ Connected to guild ${guildId}`);
    const conn = globalConnections.get(guildId);
    if (conn) {
      conn.reconnectAttempts = 0;
    }
    onConnect();
  };
  
  eventSource.onmessage = (event) => {
    try {
      const message: SSEMessage = JSON.parse(event.data);
      
      // Skip heartbeat
      if (message.type === 'heartbeat') return;
      
      const conn = globalConnections.get(guildId);
      if (!conn) return;
      
      // Sequence check
      if (message.sequence) {
        if (message.sequence <= conn.lastSequence) {
          return; // Skip duplicate
        }
        conn.lastSequence = message.sequence;
      }
      
      // Notify all subscribers
      conn.subscribers.forEach(subscriber => {
        try {
          subscriber(message);
        } catch (e) {
          console.error('[SSE Singleton] Subscriber error:', e);
        }
      });
    } catch (err) {
      console.error('[SSE Singleton] Parse error:', err);
    }
  };
  
  const handleError = () => {
    console.warn(`[SSE Singleton] ⚠️ Connection error for guild ${guildId}`);
    onDisconnect();
    
    const conn = globalConnections.get(guildId);
    if (!conn) return;
    
    if (conn.reconnectAttempts >= maxReconnectAttempts) {
      console.warn(`[SSE Singleton] Max reconnect attempts reached for guild ${guildId} - bot may be offline`);
      conn.eventSource.close();
      globalConnections.delete(guildId);
      return;
    }
    
    if (conn.eventSource.readyState === EventSource.CLOSED) {
      const delay = Math.min(1000 * Math.pow(2, conn.reconnectAttempts), 30000);
      console.log(`[SSE Singleton] Reconnecting guild ${guildId} in ${delay}ms...`);
      
      conn.reconnectTimeout = setTimeout(() => {
        const oldConn = globalConnections.get(guildId);
        if (!oldConn || oldConn.subscribers.size === 0) return;
        
        // Create new EventSource
        const newEventSource = new EventSource(sseUrl);
        oldConn.eventSource = newEventSource;
        oldConn.reconnectAttempts++;
        oldConn.lastSequence = 0;
        
        newEventSource.onopen = eventSource.onopen;
        newEventSource.onmessage = eventSource.onmessage;
        newEventSource.onerror = handleError;
      }, delay);
    }
  };
  
  eventSource.onerror = handleError;
  
  // Return unsubscribe function
  return () => {
    const conn = globalConnections.get(guildId);
    if (!conn) return;
    
    conn.subscribers.delete(onMessage);
    console.log(`[SSE Singleton] Unsubscribed from guild ${guildId} (${conn.subscribers.size} remaining)`);
    
    if (conn.subscribers.size === 0) {
      setTimeout(() => {
        const c = globalConnections.get(guildId);
        if (c && c.subscribers.size === 0) {
          console.log(`[SSE Singleton] Closing unused connection for guild ${guildId}`);
          c.eventSource.close();
          if (c.reconnectTimeout) clearTimeout(c.reconnectTimeout);
          globalConnections.delete(guildId);
        }
      }, 1000);
    }
  };
}

/**
 * useSSE - Server-Sent Events hook for real-time updates
 * 
 * Uses a SINGLETON pattern - only ONE connection per guildId globally,
 * shared across all components. This prevents browser connection limit issues.
 * 
 * When joining an existing connection, fetches fresh state for the new subscriber.
 */
export function useSSE(guildId: string | null) {
  const [data, setData] = useState<SSEMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentGuildId = useRef<string | null>(null);
  const eventIdCounter = useRef(0);
  
  // Message queue for controlled delivery
  const messageQueueRef = useRef<SSEMessage[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (processingRef.current || messageQueueRef.current.length === 0) {
      return;
    }
    
    processingRef.current = true;
    const message = messageQueueRef.current.shift()!;
    
    flushSync(() => {
      setData(message);
    });
    
    if (messageQueueRef.current.length > 0) {
      setTimeout(() => {
        processingRef.current = false;
        processQueue();
      }, 16);
    } else {
      processingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Clear state when guild changes or becomes null
    if (currentGuildId.current !== guildId) {
      console.log(`[SSE Hook] Guild changed from ${currentGuildId.current} to ${guildId}`);
      setData(null);
      messageQueueRef.current = [];
      processingRef.current = false;
    }
    
    currentGuildId.current = guildId;
    
    if (!guildId) {
      setConnected(false);
      return;
    }
    
    const handleMessage = (message: SSEMessage) => {
      if (message.guildId === currentGuildId.current || message.type === 'init') {
        eventIdCounter.current++;
        const messageWithId = { ...message, eventId: eventIdCounter.current };
        messageQueueRef.current.push(messageWithId);
        processQueue();
      }
    };
    
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    
    // Called when joining an existing connection - delivers init directly
    const handleInitialData = (message: SSEMessage) => {
      eventIdCounter.current++;
      const messageWithId = { ...message, eventId: eventIdCounter.current };
      messageQueueRef.current.push(messageWithId);
      processQueue();
    };
    
    const unsubscribe = getOrCreateConnection(
      guildId,
      handleMessage,
      handleConnect,
      handleDisconnect,
      handleInitialData
    );
    
    return () => {
      unsubscribe();
      messageQueueRef.current = [];
      processingRef.current = false;
    };
  }, [guildId, processQueue]);

  return { data, connected, error };
}
