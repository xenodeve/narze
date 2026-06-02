export type LoopMode = 'off' | 'track' | 'queue';
export type TrackSource = 'youtube' | 'spotify' | 'soundcloud';
export type BotMode = 'connected' | 'standalone';

export interface Track {
  uri: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationMs: number;
  source: TrackSource;
  requesterId: string; // Discord user ID
}

export interface PlayerState {
  guildId: string;
  botMode: BotMode;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;       // 0–100
  loopMode: LoopMode;
  position: number;     // ms
  currentTrack: Track | null;
  queue: Track[];
  voiceChannelId: string | null;
}
