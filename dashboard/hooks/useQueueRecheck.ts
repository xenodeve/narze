'use client';

import { useEffect, useCallback } from 'react';
import { QueueRecheckManager } from '../services/QueueRecheckManager';
import { QueueSong } from '../types/queue.types';

export function useQueueRecheck(guildId: string | null) {
  const manager = QueueRecheckManager.getInstance();

  useEffect(() => {
    if (!guildId) return;

    // Optional: Initial recheck on mount
    manager.triggerRecheck(guildId, 0);
  }, [guildId]);

  const optimisticAdd = useCallback((song: QueueSong) => {
    if (!guildId) return;
    
    // Logic to add song optimistically
    // In a real app, we would update a simplified local store here
    // For now, we rely on the component's state and just trigger recheck
    
    // Schedule recheck to confirm
    manager.triggerRecheck(guildId, 1000);
  }, [guildId]);

  const scheduleRecheck = useCallback(() => {
    if (!guildId) return;
    manager.triggerRecheck(guildId, 1000);
  }, [guildId]);

  return { optimisticAdd, scheduleRecheck };
}
