'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import { ChevronLeft, Clock, Music, Users, Calendar } from 'lucide-react';
import { FastAverageColor } from 'fast-average-color';
import Image from 'next/image';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// ================= Types =================

interface SessionTrack {
    title: string;
    author: string;
    uri: string;
    thumbnail?: string;
    duration: number;
    requesterName?: string;
    requesterAvatar?: string;
}

interface SessionParticipant {
    userId: string;
    username: string;
    avatarURL?: string;
}

interface Session {
    sessionId: string;
    guildId: string;
    guildName?: string;
    guildIcon?: string;
    startTime: number;
    endTime?: number;
    isActive?: boolean;
    tracks: SessionTrack[];
    participants: SessionParticipant[];
}

// ================= Helper Functions =================

function formatDate(ms: number): string {
    const date = new Date(ms);
    return date.toLocaleString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function formatTime(ms: number): string {
    const date = new Date(ms);
    return date.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatTotalDuration(tracks: SessionTrack[]): number {
    const totalMs = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    return Math.floor(totalMs / 60000);
}

// ================= Main Component =================

export default function AdminSessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = use(params);
    const router = useRouter();

    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dominantColor, setDominantColor] = useState<string | null>(null);

    // Fetch session data - search all guilds
    useEffect(() => {
        async function fetchSession() {
            try {
                // Use admin endpoint to search all guilds
                const res = await fetch(`${BOT_API_URL}/api/admin/session/${sessionId}`);

                if (!res.ok) {
                    throw new Error('Session not found');
                }

                const data = await res.json();
                setSession(data.session);
            } catch (err: any) {
                console.warn('[AdminSessionDetail] Error fetching session (bot may be offline):', err?.message);
                setError(err.message || 'Failed to load session');
            } finally {
                setLoading(false);
            }
        }

        fetchSession();
    }, [sessionId]);

    // Extract dominant color from thumbnail
    useEffect(() => {
        const thumbnail = session?.tracks[0]?.thumbnail;
        if (!thumbnail) {
            setDominantColor(null);
            return;
        }

        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = thumbnail;

        img.onload = () => {
            try {
                const fac = new FastAverageColor();
                const color = fac.getColor(img, { algorithm: 'dominant' });
                setDominantColor(color.hex);
            } catch (e) {
                console.error('Failed to extract color:', e);
            }
        };
    }, [session?.tracks]);

    // Loading state
    if (loading) {
        return (
            <div className="relative animate-pulse">
                <div className="absolute -top-8 -left-8 -right-8 h-96 bg-gradient-to-b from-purple-900/20 to-transparent opacity-40" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-end gap-6 mb-8">
                    <div className="w-48 h-48 rounded-xl bg-white/10" />
                    <div className="flex-1 space-y-4">
                        <div className="h-4 w-24 bg-white/10 rounded" />
                        <div className="h-8 w-64 bg-white/10 rounded" />
                        <div className="h-4 w-48 bg-white/10 rounded" />
                    </div>
                </div>
                <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-16 bg-white/5 rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    // Error state
    if (error || !session) {
        return (
            <div className="text-center py-12">
                <Music className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-4">{error || 'Session not found'}</p>
                <button onClick={() => router.back()} className="text-purple-400 hover:text-purple-300">
                    ← Back
                </button>
            </div>
        );
    }

    const sessionDuration = session.endTime
        ? session.endTime - session.startTime
        : Date.now() - session.startTime;

    const totalMinutes = formatTotalDuration(session.tracks);

    return (
        <div className="animate-fadeIn">
            {/* Dynamic colored background */}
            <div
                className="absolute -top-8 -left-8 -right-8 h-96 opacity-40 pointer-events-none transition-colors duration-500"
                style={{
                    background: dominantColor
                        ? `linear-gradient(to bottom, ${dominantColor}, transparent)`
                        : 'linear-gradient(to bottom, rgb(88, 28, 135), transparent)'
                }}
            />

            {/* Header */}
            <div className="relative z-10">
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
                >
                    <ChevronLeft className="w-5 h-5" />
                    <span>Back</span>
                </button>

                <div className="flex flex-col md:flex-row md:items-end gap-6 mb-8">
                    {/* Thumbnail */}
                    <div className="relative w-48 h-48 rounded-xl overflow-hidden shadow-2xl flex-shrink-0">
                        {session.tracks[0]?.thumbnail ? (
                            <Image
                                src={session.tracks[0].thumbnail}
                                alt="Session"
                                fill
                                className="object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                <Music className="h-20 w-20 text-white/50" />
                            </div>
                        )}
                        {/* Live badge */}
                        {session.isActive && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-500 text-white text-xs font-medium">
                                Live
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                            Session History
                        </p>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            {formatDate(session.startTime)}
                        </h1>

                        {/* Server name */}
                        {session.guildName && (
                            <div className="flex items-center gap-2 mb-3">
                                {session.guildIcon && (
                                    <Image
                                        src={session.guildIcon}
                                        alt={session.guildName}
                                        width={20}
                                        height={20}
                                        className="rounded-full"
                                    />
                                )}
                                <span className="text-slate-400">{session.guildName}</span>
                            </div>
                        )}

                        <div className="flex items-center gap-4 text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                                <Music className="h-4 w-4" />
                                {session.tracks.length} songs
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {totalMinutes} min
                            </span>
                            <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {session.participants?.length || 0} participants
                            </span>
                        </div>

                        {/* Participants */}
                        {session.participants && session.participants.length > 0 && (
                            <div className="flex items-center gap-2 mt-4">
                                <div className="flex -space-x-2">
                                    {session.participants.slice(0, 6).map((p, i) => (
                                        <div key={p.userId || i} className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-[#0d0d0d]">
                                            {p.avatarURL ? (
                                                <Image src={p.avatarURL} alt={p.username} width={32} height={32} className="object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-purple-600 flex items-center justify-center text-white text-xs font-medium">
                                                    {p.username?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {session.participants.length > 6 && (
                                        <div className="w-8 h-8 rounded-full ring-2 ring-[#0d0d0d] bg-white/10 flex items-center justify-center text-xs text-slate-400">
                                            +{session.participants.length - 6}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Track List */}
            <div className="card-surface rounded-xl overflow-hidden">
                {/* Header */}
                <div className="hidden md:grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_80px] gap-4 px-4 py-3 text-xs text-slate-500 uppercase tracking-wider border-b border-white/10">
                    <span className="text-center">#</span>
                    <span>Title</span>
                    <span>Requested by</span>
                    <span className="text-right">
                        <Clock className="h-4 w-4 inline" />
                    </span>
                </div>

                {/* Tracks */}
                {session.tracks.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No tracks in this session</p>
                    </div>
                ) : (
                    session.tracks.map((track, index) => (
                        <div
                            key={`${track.uri}-${index}`}
                            className="grid grid-cols-[40px_minmax(0,1fr)_80px] md:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_80px] gap-4 px-4 py-3 hover:bg-white/5 transition-colors items-center"
                        >
                            {/* Track Number */}
                            <div className="flex items-center justify-center">
                                <span className="text-slate-400 text-sm">{index + 1}</span>
                            </div>

                            {/* Track Info */}
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="relative w-10 h-10 flex-shrink-0">
                                    <div className="w-full h-full rounded overflow-hidden bg-white/10">
                                        {track.thumbnail ? (
                                            <Image
                                                src={track.thumbnail}
                                                alt={track.title}
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Music className="w-4 h-4 text-slate-500" />
                                            </div>
                                        )}
                                    </div>
                                    {/* Requester avatar badge */}
                                    {track.requesterAvatar && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-slate-900 overflow-hidden">
                                            <Image
                                                src={track.requesterAvatar}
                                                alt={track.requesterName || ''}
                                                width={16}
                                                height={16}
                                                className="object-cover"
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-medium text-white truncate">{track.title}</p>
                                    <p className="text-sm text-slate-400 truncate">{track.author}</p>
                                </div>
                            </div>

                            {/* Requester - Hidden on mobile */}
                            <div className="hidden md:block text-slate-400 text-sm truncate">
                                {track.requesterName || 'Unknown'}
                            </div>

                            {/* Duration */}
                            <div className="text-slate-400 text-sm text-right tabular-nums">
                                {formatDuration(track.duration)}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
