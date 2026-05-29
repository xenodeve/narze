'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useSSE } from './useSSE';

interface ControlPermission {
  canView: boolean;
  canControl: boolean;
  reason: string;
  loading: boolean;
}

export function useControlPermission(guildId: string | null | undefined): ControlPermission {
  const { user } = useAuth();
  const [permission, setPermission] = useState<ControlPermission>({
    canView: false,
    canControl: false,
    reason: 'Checking...',
    loading: true
  });

  // Subscribe to SSE for real-time permission updates
  const { data: sseData } = useSSE(guildId || null);

  const checkPermission = useCallback(async () => {
    if (!guildId || !user?.discordId) {
      setPermission({
        canView: false,
        canControl: false,
        reason: user?.discordId ? 'No guild selected' : 'Not logged in',
        loading: false
      });
      return;
    }

    // Set loading true while checking
    setPermission(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`/api/guild/${guildId}/can-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { username: user.username, discordId: user.discordId }
        })
      });

      // Check if response is JSON (bot might return HTML error page if offline)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`[useControlPermission] Bot returned non-JSON response - bot may be offline`);
        setPermission({
          canView: false,
          canControl: false,
          reason: 'Bot appears to be offline',
          loading: false
        });
        return;
      }

      const data = await response.json();
      
      setPermission({
        canView: data.canView ?? false,
        canControl: data.canControl ?? false,
        reason: data.reason || 'Unknown',
        loading: false
      });
    } catch (error) {
      // Silent fail for network errors
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to check control permission:', error);
      }
      setPermission({
        canView: false,
        canControl: false,
        reason: 'Failed to check permission',
        loading: false
      });
    }
  }, [guildId, user?.discordId, user?.username]);

  // Listen to SSE permissionUpdate events for real-time updates
  useEffect(() => {
    if (!sseData || !user?.discordId) return;

    // Handle individual permission update (legacy)
    if (sseData.type === 'permissionUpdate') {
      if (sseData.data?.userId === user.discordId) {
        console.log(`[useControlPermission] Permission updated via SSE: canControl=${sseData.data.canControl}, reason=${sseData.data.reason}`);
        
        setPermission({
          canView: true,
          canControl: sseData.data.canControl ?? false,
          reason: sseData.data.reason || 'Unknown',
          loading: false
        });
      }
    }

    // Handle batch permission update (new)
    if (sseData.type === 'permissionBatchUpdate') {
      const users = sseData.data?.users;
      if (Array.isArray(users)) {
        const myPermission = users.find((u: any) => u.userId === user.discordId);
        if (myPermission) {
          console.log(`[useControlPermission] Permission updated via batch SSE: canControl=${myPermission.canControl}, reason=${myPermission.reason}`);
          
          setPermission({
            canView: true,
            canControl: myPermission.canControl ?? false,
            reason: myPermission.reason || 'Unknown',
            loading: false
          });
        }
      }
    }
  }, [sseData, user?.discordId]);

  // Check permission on mount and when dependencies change
  useEffect(() => {
    checkPermission();
    
    // Recheck every 60 seconds as fallback (reduced from 30s since SSE handles real-time)
    const interval = setInterval(checkPermission, 60000);
    return () => clearInterval(interval);
  }, [checkPermission]);

  return permission;
}
