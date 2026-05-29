export interface QueueSong {
  id: string;          // Internal ID (temp or permanent)
  videoId: string;     // Source ID (e.g. YouTube ID)
  title: string;
  artist: string;
  duration: number;
  thumbnail?: string;
  addedAt: number;
  addedBy: string;     // User ID
  opId: string;        // ✅ Unique operation ID for dedup
  status?: 'pending' | 'confirmed' | 'failed';
  pendingSince?: number;
}

export interface QueueState {
  guildId: string;
  revision: number;    // ✅ Increments on change
  songs: QueueSong[];
  currentSong?: QueueSong | null;
  checksum: string;    // MD5 of song IDs
  lastModified: number;
}

export interface QueueComparisonResult {
  matches: boolean;
  missingInClient: QueueSong[];
  missingInServer: QueueSong[];
  revisionChanged: boolean;
  serverRevision: number;
  clientRevision: number;
}

export interface SSEQueueUpdate {
  type: 'queueUpdate';
  guildId: string;
  revision?: number;
  sequence?: number;
  data: {
    queue: any[]; // Raw queue from server
    // ... potentially other fields
  };
  timestamp: number;
}
