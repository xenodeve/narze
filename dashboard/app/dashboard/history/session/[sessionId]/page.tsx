'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, memo, use, useCallback, useRef } from 'react';
import { ChevronLeft, Play, Clock, Music, Users, Calendar, Loader2 } from 'lucide-react';
import { ListeningSession, SessionTrack } from '@/types/session';
import { FastAverageColor } from 'fast-average-color';
import Image from 'next/image';
import { useSSE } from '@/hooks/useSSE';
import { VoiceChannelSelectorModal } from '@/components/VoiceChannelSelectorModal';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// ================= Types =================

interface Guild {
    guildId: string;
    guildName: string;
    guildIcon?: string;
    isPlaying?: boolean;
}

interface GuildPermission {
    isOwner: boolean;
    isBotOwner: boolean;
    isInVoice: boolean;
    voiceChannelId: string | null;
    voiceChannelName: string | null;
    canPlay: boolean;
    reason: string;
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

function formatTotalDuration(tracks: SessionTrack[]): string {
    const totalMs = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const totalMinutes = Math.floor(totalMs / 60000);
    return totalMinutes;
}

// ================= Track Item Component =================

const TrackItem = memo(function TrackItem({
    track,
    index,
    isPlaying,
    onPlay
}: {
    track: SessionTrack;
    index: number;
    isPlaying: boolean;
    onPlay: () => void;
}) {
    return (
        <div
            onClick={onPlay}
            className={`group grid grid-cols-[40px_minmax(0,1fr)_80px] md:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_80px] gap-4 px-4 py-3 transition-all duration-300 cursor-pointer items-center rounded-lg hover:bg-white/10 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-0.5 ${isPlaying ? 'bg-white/10' : ''}`}
        >
            {/* Track Number / Play Icon */}
            <div className="flex items-center justify-center">
                {isPlaying ? (
                    <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                ) : (
                    <>
                        <span className="text-slate-400 text-sm group-hover:hidden">
                            {index + 1}
                        </span>
                        <Play className="w-4 h-4 text-white hidden group-hover:block fill-white" />
                    </>
                )}
            </div>

            {/* Track Info with Thumbnail */}
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
                    <p className={`font-medium truncate transition-colors ${isPlaying ? 'text-purple-400' : 'text-white'}`}>
                        {track.title}
                    </p>
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
    );
});

// ================= Main Component =================

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = use(params);

    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const guildId = searchParams.get('guildId');
    const [session, setSession] = useState<ListeningSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSkeleton, setShowSkeleton] = useState(false); // Delayed skeleton to prevent flash
    const [error, setError] = useState<string | null>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Play functionality states
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [selectedGuildId, setSelectedGuildId] = useState<string | null>(guildId);
    const [showGuildSelect, setShowGuildSelect] = useState(false);
    const [playingTrackIndex, setPlayingTrackIndex] = useState<number | null>(null);
    const [guildPermissions, setGuildPermissions] = useState<Record<string, GuildPermission>>({});
    const [isClosingGuildSelector, setIsClosingGuildSelector] = useState(false);
    const [showVoiceChannelModal, setShowVoiceChannelModal] = useState(false);
    const [pendingPlayAction, setPendingPlayAction] = useState<'all' | 'track' | null>(null);
    const [pendingTrack, setPendingTrack] = useState<SessionTrack | null>(null);
    const [pendingTrackIndex, setPendingTrackIndex] = useState<number | null>(null);
    const [checkingPlayer, setCheckingPlayer] = useState(false);

    // Dynamic header color from thumbnail
    const [dominantColor, setDominantColor] = useState<string | null>(null);

    // SSE for real-time updates
    const { data: sseData } = useSSE(selectedGuildId);

    // Load guilds on mount
    useEffect(() => {
        const loadGuilds = async () => {
            if (!user?.discordId) return;
            try {
                const res = await fetch(`${BOT_API_URL}/api/guilds?userId=${encodeURIComponent(user.discordId)}`);
                if (res.ok) {
                    const data = await res.json();
                    const guildList = data.guilds || [];
                    setGuilds(guildList);

                    // Use guildId from URL or saved
                    if (guildId && guildList.some((g: Guild) => g.guildId === guildId)) {
                        setSelectedGuildId(guildId);
                    } else {
                        const savedGuild = localStorage.getItem('selectedGuildId');
                        if (savedGuild && guildList.some((g: Guild) => g.guildId === savedGuild)) {
                            setSelectedGuildId(savedGuild);
                        } else if (guildList.length > 0) {
                            setSelectedGuildId(guildList[0].guildId);
                        }
                    }

                    // Fetch permissions
                    if (guildList.length > 0) {
                        const guildIds = guildList.map((g: Guild) => g.guildId);
                        try {
                            const permRes = await fetch(`/api/guilds/user-permissions`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: user.discordId, guildIds })
                            });
                            if (permRes.ok) {
                                const permData = await permRes.json();
                                setGuildPermissions(permData.permissions || {});
                            }
                        } catch (permErr) {
                            console.warn('[Session] Failed to load guild permissions (bot may be offline):', permErr);
                        }
                    }
                }
            } catch (err) {
                console.warn('[Session] Failed to load guilds (bot may be offline):', err);
            }
        };
        loadGuilds();
    }, [user, guildId]);

    // Save selected guild
    useEffect(() => {
        if (selectedGuildId) {
            localStorage.setItem('selectedGuildId', selectedGuildId);
        }
    }, [selectedGuildId]);

    // Delayed skeleton display to prevent flash on fast loads
    useEffect(() => {
        if (loading) {
            // Only show skeleton if loading takes more than 200ms
            const timer = setTimeout(() => {
                setShowSkeleton(true);
            }, 200);
            return () => clearTimeout(timer);
        } else {
            setShowSkeleton(false);
        }
    }, [loading]);

    // Scroll listener for sticky header
    useEffect(() => {
        let currentIsScrolled = false;

        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            const scrollTop = target.scrollTop;

            if (!currentIsScrolled && scrollTop > 100) {
                currentIsScrolled = true;
                setIsScrolled(true);
            } else if (currentIsScrolled && scrollTop < 50) {
                currentIsScrolled = false;
                setIsScrolled(false);
            }
        };

        const container = document.getElementById('main-scroll-container');

        if (container) {
            container.addEventListener('scroll', handleScroll);
            if (container.scrollTop > 100) {
                currentIsScrolled = true;
                setIsScrolled(true);
            }
            return () => container.removeEventListener('scroll', handleScroll);
        } else {
            const handleWindowScroll = () => {
                if (!currentIsScrolled && window.scrollY > 100) {
                    currentIsScrolled = true;
                    setIsScrolled(true);
                } else if (currentIsScrolled && window.scrollY < 50) {
                    currentIsScrolled = false;
                    setIsScrolled(false);
                }
            };
            window.addEventListener('scroll', handleWindowScroll);
            return () => window.removeEventListener('scroll', handleWindowScroll);
        }
    }, []);

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

    // Fetch session data
    useEffect(() => {
        async function fetchSession() {
            if (!guildId || !sessionId) {
                setError('Missing guildId or sessionId');
                setLoading(false);
                return;
            }

            try {
                const res = await fetch(`${BOT_API_URL}/api/guild/${guildId}/sessions?limit=50`);

                if (!res.ok) {
                    throw new Error('Failed to fetch sessions');
                }

                const data = await res.json();
                const sessions = data.sessions || [];
                const foundSession = sessions.find((s: ListeningSession) => s.sessionId === sessionId);

                if (foundSession) {
                    setSession(foundSession);
                } else {
                    setError('Session not found');
                }
            } catch (err: any) {
                console.warn('[Session] Error fetching session (bot may be offline):', err?.message || err);
                setError('Bot appears to be offline. Please try again later.');
            } finally {
                setLoading(false);
            }
        }

        if (!authLoading && user) {
            fetchSession();
        }
    }, [guildId, sessionId, authLoading, user]);

    // SSE Realtime Updates - update session when new data arrives
    useEffect(() => {
        if (!sseData || !session) return;

        if (sseData.type === 'sessionUpdate' || sseData.type === 'sessionEnd') {
            const updatedSession = sseData.data as ListeningSession;

            // Only update if it's the same session
            if (updatedSession.sessionId === session.sessionId) {
                setSession(updatedSession);
            }
        }
    }, [sseData, session?.sessionId]);

    // Play track function
    const executePlayTrack = useCallback(async (track: SessionTrack, index: number | null) => {
        if (!selectedGuildId || !user) return;

        setPlayingTrackIndex(index);

        try {
            const response = await fetch(`/api/player/${selectedGuildId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'play',
                    value: track.uri || `${track.title} ${track.author}`,
                    user: { username: user.username, discordId: user.discordId }
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                alert(`Failed to play: ${data.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Play error:', err);
            alert('Failed to play track. Please try again.');
        } finally {
            setTimeout(() => setPlayingTrackIndex(null), 1000);
        }
    }, [selectedGuildId, user]);

    // Handle play track click
    const handlePlayTrack = useCallback((track: SessionTrack, index: number) => {
        if (!user) {
            alert('Please login first');
            return;
        }

        // Store pending action
        setPendingPlayAction('track');
        setPendingTrack(track);
        setPendingTrackIndex(index);
        setShowGuildSelect(true);
    }, [user]);

    // Handle voice channel select
    const handleVoiceChannelSelect = useCallback(async (channelId: string) => {
        if (!selectedGuildId || !user) return;

        setCheckingPlayer(true);
        setShowVoiceChannelModal(false);

        try {
            await fetch(`/api/player/${selectedGuildId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelId,
                    user: { username: user.username, discordId: user.discordId }
                }),
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            if (pendingPlayAction === 'track' && pendingTrack) {
                await executePlayTrack(pendingTrack, pendingTrackIndex);
            }
        } catch (err) {
            console.error('Failed to join voice channel:', err);
        } finally {
            setPendingPlayAction(null);
            setPendingTrack(null);
            setPendingTrackIndex(null);
            setCheckingPlayer(false);
        }
    }, [selectedGuildId, user, pendingPlayAction, pendingTrack, pendingTrackIndex, executePlayTrack]);

    // Loading state - skeleton matching redesigned layout (with 200ms delay to prevent flash)
    if (authLoading || showSkeleton) {
        return (
            <div className="relative">
                {/* Dynamic Background Skeleton */}
                <div className="absolute -top-4 sm:-top-6 md:-top-8 -left-4 sm:-left-6 md:-left-8 -right-4 sm:-right-6 md:-right-8 h-96 bg-gradient-to-b from-purple-900/20 to-transparent opacity-40 pointer-events-none" />

                {/* Header Skeleton */}
                <div className="relative z-10 flex flex-col md:flex-row md:items-end gap-6 mb-8">
                    {/* Thumbnail Skeleton */}
                    <div className="w-48 h-48 md:w-56 md:h-56 rounded-xl bg-white/10 animate-pulse flex-shrink-0" />

                    {/* Info Skeleton */}
                    <div className="flex-1 space-y-4">
                        <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                        <div className="h-8 w-64 bg-white/10 rounded animate-pulse" />
                        <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />

                        {/* Participant Avatars Skeleton */}
                        <div className="flex items-center gap-2 mt-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
                            ))}
                        </div>

                        {/* Stats Skeleton */}
                        <div className="flex items-center gap-4 mt-2">
                            <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                            <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                            <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                        </div>
                    </div>
                </div>

                {/* Track List Header Skeleton */}
                <div className="border-b border-white/10 mb-2">
                    <div className="grid grid-cols-[40px_1fr_80px] md:grid-cols-[40px_2fr_1fr_80px] gap-4 px-4 py-2">
                        <div className="h-4 w-4 bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
                        <div className="hidden md:block h-4 w-20 bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-12 bg-white/5 rounded animate-pulse ml-auto" />
                    </div>
                </div>

                {/* Track List Skeleton */}
                <div className="space-y-1">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="grid grid-cols-[40px_1fr_80px] md:grid-cols-[40px_2fr_1fr_80px] gap-4 px-4 py-3">
                            <div className="h-4 w-4 bg-white/10 rounded animate-pulse mx-auto" />
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded bg-white/10 animate-pulse flex-shrink-0" />
                                <div className="space-y-2 flex-1 min-w-0">
                                    <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
                                    <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
                                </div>
                            </div>
                            <div className="hidden md:block h-4 w-16 bg-white/5 rounded animate-pulse" />
                            <div className="h-4 w-10 bg-white/5 rounded animate-pulse ml-auto" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Error state - only show after loading completes
    if (!loading && (error || !session)) {
        return (
            <div className="text-center py-12">
                <Music className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-4">{error || 'Session not found'}</p>
                <button onClick={() => router.back()} className="text-purple-400 hover:text-purple-300">
                    ← Back to History
                </button>
            </div>
        );
    }

    // Still loading but skeleton delay not met - return null to wait
    if (!session) {
        return null;
    }

    const sessionDuration = session.endTime
        ? session.endTime - session.startTime
        : Date.now() - session.startTime;

    const totalMinutes = formatTotalDuration(session.tracks);
    const currentGuild = guilds.find(g => g.guildId === guildId);

    return (
        <>
            {/* Guild Select Modal */}
            {showGuildSelect && (
                <div
                    className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${isClosingGuildSelector ? 'opacity-0' : 'animate-fadeIn'}`}
                    onClick={() => {
                        setIsClosingGuildSelector(true);
                        setTimeout(() => {
                            setShowGuildSelect(false);
                            setIsClosingGuildSelector(false);
                            setPendingPlayAction(null);
                            setPendingTrack(null);
                            setPendingTrackIndex(null);
                        }, 200);
                    }}
                >
                    <div
                        className={`card-surface p-6 rounded-xl max-w-md w-full transition-all duration-200 ${isClosingGuildSelector ? 'opacity-0 scale-95 translate-y-4' : 'animate-modalSlideUp'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-white mb-4">Select Server</h3>
                        <p className="text-slate-400 text-sm mb-4">Choose a server to play music in:</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {guilds.length === 0 ? (
                                <p className="text-slate-500 text-center py-4">No servers found</p>
                            ) : (
                                guilds.map(guild => {
                                    const perm = guildPermissions[guild.guildId];
                                    const canPlay = perm?.canPlay ?? false;
                                    const isOwner = perm?.isOwner || perm?.isBotOwner;
                                    const isInVoice = perm?.isInVoice ?? false;

                                    return (
                                        <button
                                            key={guild.guildId}
                                            disabled={!canPlay}
                                            onClick={async () => {
                                                if (!canPlay) return;

                                                setIsClosingGuildSelector(true);
                                                setSelectedGuildId(guild.guildId);

                                                await new Promise(resolve => setTimeout(resolve, 200));
                                                setShowGuildSelect(false);
                                                setIsClosingGuildSelector(false);

                                                // Show voice channel modal only if owner is not in voice AND no active player exists
                                                if (isOwner && !isInVoice && !guild.isPlaying) {
                                                    setShowVoiceChannelModal(true);
                                                } else {
                                                    setCheckingPlayer(true);
                                                    try {
                                                        await fetch(`/api/player/${guild.guildId}/join`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                channelId: perm?.voiceChannelId,
                                                                user: { username: user?.username, discordId: user?.discordId }
                                                            }),
                                                        });
                                                        await new Promise(resolve => setTimeout(resolve, 500));
                                                        if (pendingPlayAction === 'track' && pendingTrack) {
                                                            await executePlayTrack(pendingTrack, pendingTrackIndex);
                                                        }
                                                    } catch (err: any) {
                                                        console.error('Play failed:', err);
                                                    } finally {
                                                        setPendingPlayAction(null);
                                                        setPendingTrack(null);
                                                        setPendingTrackIndex(null);
                                                        setCheckingPlayer(false);
                                                    }
                                                }
                                            }}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${!canPlay
                                                ? 'bg-white/5 opacity-50 cursor-not-allowed'
                                                : selectedGuildId === guild.guildId
                                                    ? 'bg-purple-600/20 border border-purple-500'
                                                    : 'bg-white/5 hover:bg-white/10'
                                                }`}
                                        >
                                            {guild.guildIcon ? (
                                                <Image src={guild.guildIcon} alt={guild.guildName} width={40} height={40} className="rounded-full" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold">
                                                    {guild.guildName?.charAt(0) || '?'}
                                                </div>
                                            )}
                                            <span className={`font-medium flex-1 text-left ${canPlay ? 'text-white' : 'text-slate-500'}`}>
                                                {guild.guildName}
                                            </span>
                                            <span className={`text-xs px-2 py-1 rounded-full ${isOwner
                                                ? 'bg-yellow-500/20 text-yellow-400'
                                                : isInVoice
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-red-500/20 text-red-400'
                                                }`}>
                                                {perm?.reason || 'Loading...'}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        <button
                            onClick={() => {
                                setIsClosingGuildSelector(true);
                                setTimeout(() => {
                                    setShowGuildSelect(false);
                                    setIsClosingGuildSelector(false);
                                    setPendingPlayAction(null);
                                    setPendingTrack(null);
                                    setPendingTrackIndex(null);
                                }, 200);
                            }}
                            className="mt-4 w-full py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Voice Channel Selector Modal */}
            {selectedGuildId && (
                <VoiceChannelSelectorModal
                    isOpen={showVoiceChannelModal}
                    guildId={selectedGuildId}
                    onClose={() => {
                        setShowVoiceChannelModal(false);
                        setPendingPlayAction(null);
                        setPendingTrack(null);
                        setPendingTrackIndex(null);
                    }}
                    onSelect={handleVoiceChannelSelect}
                />
            )}

            {/* Main Content */}
            <div className="animate-fadeIn">
                {/* Dynamic colored background header - extends to container edges */}
                <div
                    className="absolute -top-4 sm:-top-6 md:-top-8 -left-4 sm:-left-6 md:-left-8 -right-4 sm:-right-6 md:-right-8 h-96 opacity-40 pointer-events-none transition-colors duration-500"
                    style={{
                        background: dominantColor
                            ? `linear-gradient(to bottom, ${dominantColor}, transparent)`
                            : 'linear-gradient(to bottom, rgb(88, 28, 135), transparent)'
                    }}
                />

                {/* Sticky Header */}
                <div
                    className={`sticky z-20 transition-all duration-300 ${isScrolled
                        ? '-top-4 sm:-top-6 md:-top-8 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 pt-2 sm:pt-3 md:pt-4 pb-3 shadow-lg rounded-b-xl'
                        : 'top-0'
                        }`}
                    style={isScrolled ? {
                        backgroundColor: dominantColor || 'rgba(13, 13, 13, 0.95)'
                    } : undefined}
                >
                    {/* Back Button */}
                    <button
                        onClick={() => router.back()}
                        className={`flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4 ${isScrolled ? 'hidden' : ''}`}
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span>Back to History</span>
                    </button>

                    <div className={`flex gap-4 items-center transition-all duration-300 ${isScrolled ? '' : 'flex-col md:flex-row md:items-end gap-6'
                        }`}>
                        {/* Thumbnail - Shrinks when scrolled */}
                        <div className={`relative rounded-xl overflow-hidden shadow-2xl flex-shrink-0 transition-all duration-300 ${isScrolled ? 'w-16 h-16' : 'w-48 h-48'
                            }`}>
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
                                <div className={`absolute rounded-full bg-green-500 text-white text-xs font-medium flex items-center justify-center transition-all duration-300 ${isScrolled ? 'top-1 right-1 w-4 h-4 text-[8px]' : 'top-2 right-2 px-2 py-0.5'}`}>
                                    {!isScrolled && 'Live'}
                                </div>
                            )}
                        </div>

                        {/* Info - Shrinks when scrolled */}
                        <div className="flex-1 min-w-0">
                            <p className={`text-xs text-slate-400 uppercase tracking-wider transition-all duration-300 ${isScrolled ? 'hidden' : 'mb-1'
                                }`}>Session History</p>
                            <h1 className={`font-bold text-white truncate transition-all duration-300 ${isScrolled ? 'text-xl' : 'text-3xl mb-2'
                                }`}>{formatDate(session.startTime)}</h1>

                            {/* Server name */}
                            {!isScrolled && currentGuild && (
                                <div className="flex items-center gap-2 mb-3">
                                    {currentGuild.guildIcon && (
                                        <Image
                                            src={currentGuild.guildIcon}
                                            alt={currentGuild.guildName}
                                            width={20}
                                            height={20}
                                            className="rounded-full"
                                        />
                                    )}
                                    <span className="text-slate-400">{currentGuild.guildName}</span>
                                </div>
                            )}

                            <div className={`flex items-center text-slate-400 transition-all duration-300 ${isScrolled ? 'text-xs gap-2' : 'gap-3 text-sm'
                                }`}>
                                <span className="flex items-center gap-1">
                                    {!isScrolled && <Music className="h-4 w-4" />}
                                    {session.tracks.length} songs
                                </span>
                                <span className={isScrolled ? '' : 'hidden'}>•</span>
                                <span className="flex items-center gap-1">
                                    {!isScrolled && <Clock className="h-4 w-4" />}
                                    {totalMinutes} min
                                </span>
                                <span className={isScrolled ? '' : 'hidden'}>•</span>
                                <span className="flex items-center gap-1">
                                    {!isScrolled && <Users className="h-4 w-4" />}
                                    {session.participants?.length || 0} participants
                                </span>
                            </div>

                            {/* Participants */}
                            {!isScrolled && session.participants && session.participants.length > 0 && (
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
                <div className="mt-6 card-surface rounded-xl overflow-hidden">
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
                                className="animate-fadeIn"
                                style={{
                                    animationDelay: `${index * 50}ms`,
                                    animationFillMode: 'backwards'
                                }}
                            >
                                <TrackItem
                                    track={track}
                                    index={index}
                                    isPlaying={playingTrackIndex === index}
                                    onPlay={() => handlePlayTrack(track, index)}
                                />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
