'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Track } from '@/types/bot';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// Helper to create a stable key for comparison
function createQueueKey(queue: Track[]): string {
  return queue.map(t => `${t.title}|${t.artist}`).join('||');
}

function createTrackKey(track: Track | null): string {
  if (!track) return '';
  return `${track.title}|${track.artist}|${track.duration}`;
}

export function useQueue(guildId: string | null) {
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isFirstLoad = useRef(true);
  const prevQueueKey = useRef<string>('');
  const prevCurrentKey = useRef<string>('');

  const fetchQueue = useCallback(async () => {
    if (!guildId) {
      if (prevQueueKey.current !== '' || prevCurrentKey.current !== '') {
        setQueue([]);
        setCurrent(null);
        prevQueueKey.current = '';
        prevCurrentKey.current = '';
      }
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
      return;
    }

    try {
      const startTime = Date.now();
      const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[${requestId}] [API Request] GET ${BOT_API_URL}/api/queue/${guildId}`);
      
      const response = await fetch(`${BOT_API_URL}/api/queue/${guildId}`);
      const duration = Date.now() - startTime;
      console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms)`);
      
      if (response.status === 404) {
        if (prevQueueKey.current !== '' || prevCurrentKey.current !== '') {
          setQueue([]);
          setCurrent(null);
          prevQueueKey.current = '';
          prevCurrentKey.current = '';
        }
        if (isFirstLoad.current) {
          setLoading(false);
          isFirstLoad.current = false;
        }
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch queue');
      }
      
      // Check if response is JSON (bot might return HTML error page if offline)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`[useQueue] Bot returned non-JSON response - bot may be offline`);
        return;
      }
      
      const data = await response.json();
      console.log('✅ Queue fetched:', data);
      
      // Map current track
      if (data.current) {
        const newCurrent: Track = {
          title: data.current.title,
          artist: data.current.author || 'Unknown Artist',
          thumbnail: data.current.thumbnail || '',
          duration: data.current.duration || 0,
          url: data.current.uri || '',
          requestedBy: {
            id: '',
            username: data.current.requester || 'Unknown',
            avatar: '',
          },
        };
        const newCurrentKey = createTrackKey(newCurrent);
        if (prevCurrentKey.current !== newCurrentKey) {
          setCurrent(newCurrent);
          prevCurrentKey.current = newCurrentKey;
        }
      } else {
        if (prevCurrentKey.current !== '') {
          setCurrent(null);
          prevCurrentKey.current = '';
        }
      }
      
      // Map queue tracks
      const queueTracks: Track[] = (data.queue || []).map((track: any, index: number) => ({
        title: track.title,
        artist: track.author || 'Unknown Artist',
        thumbnail: track.thumbnail || '',
        duration: track.duration || 0,
        position: index + 1,
        url: track.uri || '',
        requestedBy: {
          id: '',
          username: track.requester || 'Unknown',
          avatar: '',
        },
      }));
      
      const newQueueKey = createQueueKey(queueTracks);
      if (prevQueueKey.current !== newQueueKey) {
        setQueue(queueTracks);
        prevQueueKey.current = newQueueKey;
      }
      
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching queue:', err);
      setError(err);
    } finally {
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
    }
  }, [guildId]);

  useEffect(() => {
    if (!guildId) return;
    
    // Reset on guild change
    isFirstLoad.current = true;
    prevQueueKey.current = '';
    prevCurrentKey.current = '';
    setLoading(true);
    
    console.log(`📋 Setting up queue polling for guild: ${guildId}`);
    
    // Fetch immediately
    fetchQueue();
    
    // Poll every 3 seconds
    const interval = setInterval(fetchQueue, 3000);

    return () => {
      console.log('🔌 Cleaning up queue polling');
      clearInterval(interval);
    };
  }, [guildId, fetchQueue]);

  return { queue, current, loading, error, refetch: fetchQueue };
}
