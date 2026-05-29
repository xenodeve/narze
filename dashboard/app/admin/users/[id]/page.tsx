'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    User,
    Music,
    Clock,
    Calendar,
    ListMusic,
    RefreshCw,
    Play,
    Users
} from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface UserDetail {
    discordId: string;
    username: string;
    avatar?: string;
    createdAt: Date;
    lastActive?: Date;
    playCount: number;
}

interface PlayHistory {
    id: string;
    title: string;
    artist: string;
    playedAt: Date;
    duration: number;
    source: string;
    thumbnail?: string;
}

interface SessionTrack {
    title: string;
    artist: string;
    thumbnail?: string;
}

interface SessionParticipant {
    userId: string;
    username: string;
    avatarURL?: string;
}

interface Session {
    sessionId: string;
    guildId: string;
    guildName: string;
    startTime: number;
    endTime?: number;
    trackCount: number;
    tracks: SessionTrack[];
    participants: SessionParticipant[];
    isActive?: boolean;
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [user, setUser] = useState<UserDetail | null>(null);
    const [history, setHistory] = useState<PlayHistory[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'history' | 'sessions'>('history');
    const [isOnline, setIsOnline] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    const fetchUserData = async () => {
        try {
            setLoading(true);

            let userData: UserDetail | null = null;

            // Try to fetch user from Firebase first (document ID has discord_ prefix)
            try {
                const userDoc = await getDoc(doc(db, 'users', `discord_${id}`));

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    userData = {
                        discordId: data.discordId || id,
                        username: data.username || 'Unknown',
                        avatar: data.avatar
                            ? `https://cdn.discordapp.com/avatars/${data.discordId}/${data.avatar}.png`
                            : undefined,
                        createdAt: data.createdAt?.toDate() || new Date(),
                        lastActive: data.lastActive?.toDate(),
                        playCount: data.playCount || 0
                    };
                }
            } catch (firebaseError) {
                console.warn('Could not fetch user from Firebase');
            }

            // Fallback: If Firebase didn't return user, try bot cache
            if (!userData) {
                // Fallback: Try to get user from bot's user cache
                try {
                    const botUserRes = await fetch(`${BOT_API_URL}/api/admin/users/cached`);
                    if (botUserRes.ok) {
                        const botData = await botUserRes.json();
                        const cachedUser = botData.users?.find((u: any) => u.discordId === id);
                        if (cachedUser) {
                            userData = {
                                discordId: cachedUser.discordId || id,
                                username: cachedUser.username || 'Unknown',
                                avatar: cachedUser.avatar
                                    ? (cachedUser.avatar.startsWith('http')
                                        ? cachedUser.avatar
                                        : `https://cdn.discordapp.com/avatars/${cachedUser.discordId}/${cachedUser.avatar}.png`)
                                    : undefined,
                                createdAt: cachedUser.createdAt ? new Date(cachedUser.createdAt) : new Date(),
                                lastActive: cachedUser.lastActive ? new Date(cachedUser.lastActive) : undefined,
                                playCount: cachedUser.playCount || 0
                            };
                        }
                    }
                } catch (e) {
                    console.warn('Could not fetch user from bot cache');
                }
            }

            // Fetch all play history using admin endpoint (can view any user)
            let historyData: any[] = [];
            try {
                const historyRes = await fetch(`${BOT_API_URL}/api/admin/user/${id}/history?limit=500&sortBy=lastPlayedAt`);
                if (historyRes.ok) {
                    const result = await historyRes.json();
                    historyData = result.history || [];
                    setHistory(historyData);

                    // Update user data with calculated values from history
                    if (userData) {
                        // playCount = total unique tracks in history
                        userData.playCount = historyData.length;
                        // lastActive = most recent track's playedAt
                        if (historyData.length > 0 && historyData[0].playedAt) {
                            userData.lastActive = new Date(historyData[0].playedAt);
                        }
                    }
                }
            } catch (e) {
                console.warn('Could not fetch play history');
            }

            setUser(userData);


            // Fetch sessions using admin endpoint (can view any user across all guilds)
            try {
                const sessionsRes = await fetch(`${BOT_API_URL}/api/admin/user/${id}/sessions?limit=500`);
                if (sessionsRes.ok) {
                    const sessionsData = await sessionsRes.json();
                    setSessions(sessionsData.sessions || []);
                }
            } catch (e) {
                console.warn('Could not fetch sessions');
            }

            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) {
            fetchUserData();
        }
    }, [id]);

    // SSE connection for real-time presence (check if this user is online)
    useEffect(() => {
        if (!id) return;

        const eventSource = new EventSource(`${BOT_API_URL}/api/admin/presence/events`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'dashboardPresence') {
                    const isUserOnline = data.users.some((u: { discordId: string }) => u.discordId === id);
                    setIsOnline(isUserOnline);
                }
            } catch (e) {
                // Ignore parse errors
            }
        };

        eventSource.onerror = () => {
            // Reconnect handled by browser
        };

        return () => {
            eventSource.close();
        };
    }, [id]);

    const formatDuration = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatSessionDate = (ms: number) => {
        const date = new Date(ms);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today, ' + date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        } else if (diffDays === 1) {
            return 'Yesterday, ' + date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        } else if (diffDays < 7) {
            return date.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
        }
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatSessionDuration = (ms: number) => {
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes} min`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="space-y-6">
                <Link href="/admin/users" className="flex items-center gap-2 text-slate-400 hover:text-white">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Users
                </Link>
                <div className="text-center py-12 text-slate-400">
                    User not found
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Back link */}
            <Link href="/admin/users" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back to Users
            </Link>

            {/* Error */}
            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    {error}
                </div>
            )}

            {/* User Header */}
            <div className="card-surface p-6 rounded-xl">
                <div className="flex items-center gap-4">
                    {user.avatar ? (
                        <Image
                            src={user.avatar}
                            alt={user.username}
                            width={80}
                            height={80}
                            className="rounded-xl"
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-xl bg-slate-700 flex items-center justify-center text-white text-2xl font-bold">
                            {user.username.charAt(0)}
                        </div>
                    )}
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-white">{user.username}</h1>
                        <p className="text-slate-400 font-mono text-sm">{user.discordId}</p>

                        <div className="flex items-center gap-6 mt-3">
                            <span className="flex items-center gap-1.5 text-sm text-slate-400">
                                <Calendar className="w-4 h-4" />
                                Joined {user.createdAt.toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-slate-400">
                                <Music className="w-4 h-4" />
                                {user.playCount} plays
                            </span>
                            {user.lastActive && (
                                <span className={`flex items-center gap-1.5 text-sm ${isOnline ? 'text-green-400' : 'text-slate-400'}`}>
                                    {isOnline ? (
                                        <>
                                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                            Online now
                                        </>
                                    ) : (
                                        <>
                                            <Clock className="w-4 h-4" />
                                            Last active {user.lastActive.toLocaleDateString()}
                                        </>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'history'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                >
                    <Music className="w-4 h-4" />
                    Play History ({history.length})
                </button>
                <button
                    onClick={() => setActiveTab('sessions')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'sessions'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                >
                    <ListMusic className="w-4 h-4" />
                    Sessions ({sessions.length})
                </button>
            </div>

            {/* Content */}
            {activeTab === 'history' ? (
                <div className="card-surface rounded-xl overflow-hidden">
                    {history.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            No play history found
                        </div>
                    ) : (
                        <>
                            <table className="w-full">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-slate-400 font-medium">Track</th>
                                        <th className="text-left px-6 py-4 text-slate-400 font-medium">Duration</th>
                                        <th className="text-left px-6 py-4 text-slate-400 font-medium">Played</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((track, i) => (
                                        <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {track.thumbnail ? (
                                                        <Image
                                                            src={track.thumbnail}
                                                            alt={track.title}
                                                            width={48}
                                                            height={48}
                                                            className="rounded-lg object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center">
                                                            <Music className="w-5 h-5 text-slate-500" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-white">{track.title}</p>
                                                        <p className="text-sm text-slate-400">{track.artist}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-400">
                                                {formatDuration(track.duration)}
                                            </td>
                                            <td className="px-6 py-4 text-slate-400 text-sm">
                                                {new Date(track.playedAt).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {sessions.length === 0 ? (
                        <div className="col-span-full card-surface p-12 rounded-xl text-center text-slate-400">
                            No sessions found
                        </div>
                    ) : (
                        sessions.map((session) => {
                            const thumbnail = session.tracks?.[0]?.thumbnail;
                            const sessionDuration = session.endTime
                                ? session.endTime - session.startTime
                                : Date.now() - session.startTime;

                            return (
                                <Link
                                    key={session.sessionId}
                                    href={`/admin/session/${session.sessionId}`}
                                    className="group card-surface p-4 rounded-xl hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10"
                                >
                                    {/* Thumbnail */}
                                    <div className="relative aspect-square rounded-lg overflow-hidden mb-3">
                                        {thumbnail ? (
                                            <Image
                                                src={thumbnail}
                                                alt="Session"
                                                fill
                                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                                <Music className="h-12 w-12 text-white/50" />
                                            </div>
                                        )}

                                        {/* Play button overlay */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
                                                <Play className="h-5 w-5 text-white ml-0.5" />
                                            </div>
                                        </div>

                                        {/* Live badge */}
                                        {session.isActive && (
                                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-green-500 text-white text-xs font-medium animate-pulse">
                                                Live
                                            </div>
                                        )}

                                        {/* Participants Avatars */}
                                        {session.participants && session.participants.length > 0 && (
                                            <div className="absolute bottom-2 left-2 flex -space-x-1.5">
                                                {session.participants.slice(0, 4).map((p, i) => (
                                                    <div
                                                        key={p.userId || i}
                                                        className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-black/50 bg-white/10"
                                                        title={p.username}
                                                    >
                                                        {p.avatarURL ? (
                                                            <Image
                                                                src={p.avatarURL}
                                                                alt={p.username || ''}
                                                                width={20}
                                                                height={20}
                                                                className="object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-[8px] text-white font-medium bg-purple-600">
                                                                {p.username?.charAt(0)?.toUpperCase() || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                {session.participants.length > 4 && (
                                                    <div className="w-5 h-5 rounded-full ring-1 ring-black/50 bg-black/60 flex items-center justify-center text-[8px] text-white font-medium">
                                                        +{session.participants.length - 4}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Track count badge */}
                                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium flex items-center gap-1">
                                            <Music className="h-3 w-3" />
                                            {session.trackCount || session.tracks?.length || 0}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <h3 className="font-semibold text-white truncate group-hover:text-purple-400 transition-colors">
                                        {formatSessionDate(session.startTime)}
                                    </h3>
                                    <p className="text-sm text-slate-400 truncate">
                                        {session.guildName || 'Unknown Server'}
                                    </p>

                                    {/* Stats */}
                                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {session.participants?.length || 0}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatSessionDuration(sessionDuration)}
                                        </span>
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
