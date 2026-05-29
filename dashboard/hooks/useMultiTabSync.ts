'use client';

import { useEffect, useRef, useCallback } from 'react';

type BroadcastMessage = {
  type: string;
  payload: any;
  timestamp: number;
};

export function useMultiTabSync(channelName: string, onMessage: (msg: BroadcastMessage) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Create channel
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    // Handler
    channel.onmessage = (event) => {
      onMessage(event.data);
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [channelName, onMessage]);

  const broadcast = useCallback((type: string, payload: any) => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type,
        payload,
        timestamp: Date.now()
      });
    }
  }, []);

  return { broadcast };
}
