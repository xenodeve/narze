'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Track } from '@/types/bot';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

export function useCurrentTrack(guildId: string | null) {
  const [track, setTrack] = useState<Track | null>(null);
  const [position, setPosition] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isFirstLoad = useRef(true);
  const prevTrackRef = useRef<string | null>(null);

  const fetchCurrentTrack = useCallback(async () => {
    if (!guildId) {
      setTrack(null);
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
      return;
    }

    try {
      const startTime = Date.now();
      const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[${requestId}] [API Request] GET ${BOT_API_URL}/api/current-track/${guildId}`);
      
      const response = await fetch(`${BOT_API_URL}/api/current-track/${guildId}`);
      const duration = Date.now() - startTime;
      console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms)`);
      
      if (response.status === 404) {
        if (prevTrackRef.current !== null) {
          setTrack(null);
          setPosition(0);
          setPaused(false);
          prevTrackRef.current = null;
        }
        if (isFirstLoad.current) {
          setLoading(false);
          isFirstLoad.current = false;
        }
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch current track');
      }
      
      // Check if response is JSON (bot might return HTML error page if offline)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`[useCurrentTrack] Bot returned non-JSON response - bot may be offline`);
        return;
      }
      
      const data = await response.json();
      console.log('✅ Current track fetched:', data);
      
      if (data.track) {
        const newTrackKey = `${data.track.title}|${data.track.author}|${data.track.duration}`;
        
        // Only update track if it changed (new song)
        if (prevTrackRef.current !== newTrackKey) {
          setTrack({
            title: data.track.title,
            artist: data.track.author || 'Unknown Artist',
            thumbnail: data.track.thumbnail || '',
            duration: data.track.duration || 0,
            position: data.position || 0,
            url: data.track.uri || '',
            requestedBy: {
              id: '',
              username: data.track.requester || 'Unknown',
              avatar: '',
            },
          });
          prevTrackRef.current = newTrackKey;
        }
        
        // Position and paused state update more frequently
        setPosition((prev) => {
          const newPos = data.position || 0;
          // Only update if changed by more than 500ms (to avoid micro-updates)
          return Math.abs(prev - newPos) > 500 ? newPos : prev;
        });
        
        setPaused((prev) => {
          const newPaused = data.paused || false;
          return prev !== newPaused ? newPaused : prev;
        });
      } else {
        if (prevTrackRef.current !== null) {
          setTrack(null);
          prevTrackRef.current = null;
        }
      }
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching current track:', err);
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
    
    // Reset first load when guild changes
    isFirstLoad.current = true;
    prevTrackRef.current = null;
    setLoading(true);
    
    console.log(`🎵 Setting up current track polling for guild: ${guildId}`);
    
    // Fetch immediately
    fetchCurrentTrack();
    
    // Poll every 2 seconds
    const interval = setInterval(fetchCurrentTrack, 2000);

    return () => {
      console.log('🔌 Cleaning up current track polling');
      clearInterval(interval);
    };
  }, [guildId, fetchCurrentTrack]);

  return { track, position, paused, loading, error, refetch: fetchCurrentTrack };
}
