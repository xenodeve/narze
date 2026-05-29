export type BotStatus = {
  state: 'online' | 'offline' | 'starting' | 'idle' | 'playing' | 'paused';
  uptime: number;
  guilds: number;
  lastUpdated: Date;
  version: string;
};

export type Track = {
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  position?: number;
  url: string;
  requestedBy: {
    id: string;
    username: string;
    avatar: string;
  };
};

export type BotData = {
  status: BotStatus;
  currentTrack: Track | null;
  queue: Track[];
};


export type User = {
  id: string;
  discordId: string;
  username: string;
  avatar: string;
  permissions: string[];
  createdAt: Date;
};

export type BotLog = {
  id: string;
  timestamp: Date;
  action: string;
  userId: string;
  details: Record<string, any>;
  guildId: string;
};

export type Stats = {
  id: string;
  date: Date;
  songsPlayed: number;
  commandsUsed: number;
  uniqueUsers: number;
  totalPlaytime: number;
};
