import { QueueSong, QueueState, QueueComparisonResult } from '../types/queue.types';
import { QueueMutex } from './QueueMutex';
import { GlobalRetryLimiter } from './RetryLimiter';

export class QueueRecheckManager {
  private static instance: QueueRecheckManager;
  
  private recheckTimeouts = new Map<string, NodeJS.Timeout>();
  private mutex = new QueueMutex();
  private retryLimiter = GlobalRetryLimiter.getInstance();
  
  // Cache for local queue state
  private localStates = new Map<string, QueueState>();

  private constructor() {}

  public static getInstance(): QueueRecheckManager {
    if (!QueueRecheckManager.instance) {
      QueueRecheckManager.instance = new QueueRecheckManager();
    }
    return QueueRecheckManager.instance;
  }

  /**
   * Initialize or update local queue state
   */
  public updateLocalState(guildId: string, songs: QueueSong[], revision?: number) {
    const currentState = this.localStates.get(guildId) || {
      guildId,
      revision: 0,
      songs: [],
      checksum: '',
      lastModified: 0
    };

    const newState: QueueState = {
      ...currentState,
      songs,
      revision: revision ?? (currentState.revision + 1),
      checksum: this.calculateChecksum(songs),
      lastModified: Date.now()
    };

    this.localStates.set(guildId, newState);
    return newState;
  }

  /**
   * Schedule a recheck (Debounced)
   */
  public triggerRecheck(guildId: string, delayMs: number = 1000) {
    const existing = this.recheckTimeouts.get(guildId);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      this.recheckQueue(guildId);
    }, delayMs);

    this.recheckTimeouts.set(guildId, timeout);
  }

  /**
   * Main recheck logic
   */
  public async recheckQueue(guildId: string): Promise<void> {
    // Acquire lock to prevent race conditions during reconcile
    const release = await this.mutex.acquire(guildId);
    
    try {
      const localState = this.localStates.get(guildId);
      if (!localState) {
        console.log('[QueueRecheck] No local state for guild', guildId);
        return;
      }

      console.log(`[QueueRecheck] Checking guild ${guildId} (Rev: ${localState.revision})`);

      // 1. Fetch Server Queue
      // Use limiter to prevent storm
      const serverData = await this.retryLimiter.executeWithLimit(guildId, async () => {
        const res = await fetch(`/api/player/${guildId}`);
        if (!res.ok) throw new Error('Failed to fetch queue');
        return await res.json();
      });

      // Transform server data to QueueSong[]
      const serverSongs: QueueSong[] = (serverData.queue || []).map((t: any, idx: number) => ({
        id: `${idx}`, // Server doesn't return ID? We might need to map by content
        videoId: t.info?.identifier || '',
        title: t.info?.title || 'Unknown',
        artist: t.info?.author || 'Unknown',
        duration: t.info?.length || 0,
        addedAt: 0,
        addedBy: 'server',
        opId: 'server_sync'
      }));

      // 2. Check Revision Consistency
      // If local revision changed while we were fetching, ABORT
      const currentLocalState = this.localStates.get(guildId);
      if (currentLocalState && currentLocalState.revision !== localState.revision) {
         console.warn('[QueueRecheck] Revision changed during fetch, aborting reconcile');
         // Reschedule recheck to ensure we eventually sync
         this.triggerRecheck(guildId, 500);
         return;
      }

      // 3. Compare
      const result = this.compareQueues(localState.songs, serverSongs);

      if (result.matches) {
        console.log('[QueueRecheck] Queue in sync ✅');
        return;
      }

      console.log('[QueueRecheck] Queue mismatch found:', result);

      // 4. Reconcile / Auto-Fix
      // Logic: Server is source of truth for order and existence
      // BUT: We keep pending optimistic updates that are NOT yet on server
      
      this.reconcile(guildId, result, serverSongs, localState);

    } catch (error) {
      console.error('[QueueRecheck] Failed:', error);
    } finally {
      release();
    }
  }

  private compareQueues(clientQueue: QueueSong[], serverQueue: QueueSong[]): QueueComparisonResult {
    // Simple length check first
    if (clientQueue.length !== serverQueue.length) {
      return { matches: false, missingInClient: [], missingInServer: [], revisionChanged: false, serverRevision: 0, clientRevision: 0 };
    }

    // Checksum check
    const clientSum = this.calculateChecksum(clientQueue);
    const serverSum = this.calculateChecksum(serverQueue);

    if (clientSum !== serverSum) {
       return { matches: false, missingInClient: [], missingInServer: [], revisionChanged: false, serverRevision: 0, clientRevision: 0 };
    }

    return { matches: true, missingInClient: [], missingInServer: [], revisionChanged: false, serverRevision: 0, clientRevision: 0 };
  }

  private reconcile(guildId: string, result: QueueComparisonResult, serverSongs: QueueSong[], localState: QueueState) {
    // Filter out locally pending songs (added < 10 secs ago)
    const now = Date.now();
    const pendingSongs = localState.songs.filter(s => 
      s.status === 'pending' && 
      s.pendingSince && 
      (now - s.pendingSince < 10000)
    );

    // If we have pending songs that are NOT in server yet, we should keep them conceptually
    // But for simplicity, we first sync with server state, then re-append pending if valid?
    // Actually, safer to just trust server state, except for very recent optimistic additions
    
    // For now, let's just update local state to match server (hard sync)
    // and let optimistic UI handle the 'pending' visual separate from the 'confirmed' queue
    
    // Emit event or callback to update UI
    // In a real app we might use an event emitter or store subscription
    console.log('[QueueRecheck] Hard syncing to server state');
    
    this.updateLocalState(guildId, serverSongs);
    
    // TODO: Trigger React state update via callback/store
    if ((window as any).__queueRecheckSync) {
        (window as any).__queueRecheckSync(serverSongs);
    }
  }

  private calculateChecksum(songs: QueueSong[]): string {
    // Simple hash of titles + length to detect changes
    // Ideally use IDs if available
    const stringData = songs.map(s => `${s.title}:${s.duration}`).join('|');
    let hash = 0;
    for (let i = 0; i < stringData.length; i++) {
        const char = stringData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}
