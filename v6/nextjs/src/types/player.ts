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
  requesterId: string;
}

export interface PlayerState {
  guildId: string;
  botMode: BotMode;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  loopMode: LoopMode;
  position: number;
  currentTrack: Track | null;
  queue: Track[];
  voiceChannelId: string | null;
}

export interface GuildInfo {
  guild_id: string;
  guild_role: 'member' | 'owner';
  guilds: { id: string; name: string } | null;
}
