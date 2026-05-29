export interface SessionParticipant {
    userId: string;
    username: string;
    avatarURL: string;
    joinedAt: number;
}

export interface SessionTrack {
    title: string;
    author: string;
    uri: string;
    thumbnail: string;
    duration: number;
    playedAt: number;
    requesterAvatar?: string;
    requesterName?: string;
}

export interface ListeningSession {
    sessionId: string;
    guildId: string;
    guildName?: string;
    channelId: string;
    startTime: number;
    endTime?: number;
    tracks: SessionTrack[];
    participants: SessionParticipant[];
    isActive: boolean;
    trackCount: number;
    participantCount: number;
}
