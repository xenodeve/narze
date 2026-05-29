'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BotStatus } from '@/types/bot';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

export function useBotStatus() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isFirstLoad = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${BOT_API_URL}/api/status`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch bot status');
      }
      
      // Check if response is JSON (bot might return HTML error page if offline)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`[useBotStatus] Bot returned non-JSON response - bot may be offline`);
        throw new Error('Bot offline');
      }
      
      const data = await response.json();
      console.log('✅ Bot status fetched:', data);
      
      setStatus((prev) => {
        const newState = data.botOnline ? 'online' : 'offline';
        const newGuilds = data.guildCount || 0;
        const newUptime = data.uptime || 0;
        
        // ถ้าค่าสำคัญเหมือนกัน ไม่ต้อง update
        if (prev && 
            prev.state === newState && 
            prev.guilds === newGuilds &&
            Math.abs(prev.uptime - newUptime) < 15000) {
          return prev;
        }
        
        return {
          state: newState,
          uptime: newUptime,
          guilds: newGuilds,
          lastUpdated: new Date(data.timestamp),
          version: '1.0.0',
        };
      });
      setError(null);
    } catch (err: any) {
      // Silently handle network errors (bot offline) - don't spam console
      if (err?.name !== 'TypeError' && !err?.message?.includes('fetch')) {
        console.error('❌ Error fetching bot status:', err);
      }
      setError(err);
      setStatus((prev) => {
        if (prev?.state === 'offline') return prev;
        return {
          state: 'offline',
          uptime: 0,
          guilds: 0,
          lastUpdated: new Date(),
          version: '0.0.0',
        };
      });
    } finally {
      // Only set loading false on first load
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
    }
  }, []);

  useEffect(() => {
    console.log('🔄 Setting up bot status polling');
    
    // Fetch immediately
    fetchStatus();
    
    // Poll every 10 seconds
    const interval = setInterval(fetchStatus, 10000);

    return () => {
      console.log('🔌 Cleaning up bot status polling');
      clearInterval(interval);
    };
  }, [fetchStatus]);

  return { status, loading, error };
}
