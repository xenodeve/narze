'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, Play, Trash2, Edit2, Music, Clock, Loader2, ListMusic, CheckCircle, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { getPlaylist, deletePlaylist, type Playlist, type PlaylistTrack } from '@/lib/playlist-service';
import { VoiceChannelSelectorModal } from '@/components/VoiceChannelSelectorModal';
import { FastAverageColor } from 'fast-average-color';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

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

export default function PlaylistDetailPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const playlistId = params?.id as string;
    const { user } = useAuth();

    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Play functionality states
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
    const [showGuildSelect, setShowGuildSelect] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [playingTrackIndex, setPlayingTrackIndex] = useState<number | null>(null);

    // Stacked notifications system
    interface Notification {
        id: string;
        type: 'success' | 'error';
        message: string;
    }
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const addNotification = useCallback((type: 'success' | 'error', message: string) => {
        const id = Date.now().toString();
        setNotifications(prev => [...prev, { id, type, message }]);
        // Auto dismiss after 3600ms (20% longer than 3000ms)
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 3600);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // Voice channel selection states
    const [showVoiceChannelModal, setShowVoiceChannelModal] = useState(false);
    const [pendingPlayAction, setPendingPlayAction] = useState<'all' | 'track' | null>(null);
    const [pendingTrack, setPendingTrack] = useState<PlaylistTrack | null>(null);
    const [pendingTrackIndex, setPendingTrackIndex] = useState<number | null>(null);
    const [checkingPlayer, setCheckingPlayer] = useState(false);

    // Guild permissions state
    const [guildPermissions, setGuildPermissions] = useState<Record<string, GuildPermission>>({});
    const [loadingPermissions, setLoadingPermissions] = useState(false);
    const [isClosingGuildSelector, setIsClosingGuildSelector] = useState(false);

    // Dynamic header color from thumbnail
    const [dominantColor, setDominantColor] = useState<string | null>(null);
    const thumbnailRef = useRef<HTMLImageElement>(null);

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

                    // Auto-select first guild or from localStorage
                    const savedGuild = localStorage.getItem('selectedGuildId');
                    if (savedGuild && guildList.some((g: Guild) => g.guildId === savedGuild)) {
                        setSelectedGuildId(savedGuild);
                    } else if (guildList.length > 0) {
                        setSelectedGuildId(guildList[0].guildId);
                    }

                    // Fetch permissions for all guilds
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
                            console.error('Failed to load guild permissions:', permErr);
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to load guilds:', err);
            }
        };
        loadGuilds();
    }, [user]);

    // Save selected guild to localStorage
    useEffect(() => {
        if (selectedGuildId) {
            localStorage.setItem('selectedGuildId', selectedGuildId);
        }
    }, [selectedGuildId]);

    // Scroll listener for sticky header shrink with hysteresis to prevent flickering
    useEffect(() => {
        let currentIsScrolled = false;
        let ticking = false;

        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            const scrollTop = target.scrollTop;

            if (!ticking) {
                requestAnimationFrame(() => {
                    // Hysteresis: larger gap between thresholds to prevent flickering
                    if (!currentIsScrolled && scrollTop > 180) {
                        // Shrink when scrolled past 150px
                        currentIsScrolled = true;
                        setIsScrolled(true);
                    } else if (currentIsScrolled && scrollTop < 20) {
                        // Expand only when scrolled back near top (30px)
                        currentIsScrolled = false;
                        setIsScrolled(false);
                    }
                    ticking = false;
                });
                ticking = true;
            }
        };

        // Find the correct scroll container from dashboard layout
        // Layout uses: <div id="main-scroll-container" className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
        const container = document.getElementById('main-scroll-container');

        if (container) {
            container.addEventListener('scroll', handleScroll, { passive: true });
            // Check initial scroll position
            if (container.scrollTop > 150) {
                currentIsScrolled = true;
                setIsScrolled(true);
            }
            return () => container.removeEventListener('scroll', handleScroll);
        } else {
            // Fallback to window scroll
            const handleWindowScroll = () => {
                if (!ticking) {
                    requestAnimationFrame(() => {
                        if (!currentIsScrolled && window.scrollY > 150) {
                            currentIsScrolled = true;
                            setIsScrolled(true);
                        } else if (currentIsScrolled && window.scrollY < 30) {
                            currentIsScrolled = false;
                            setIsScrolled(false);
                        }
                        ticking = false;
                    });
                    ticking = true;
                }
            };
            window.addEventListener('scroll', handleWindowScroll, { passive: true });
            return () => window.removeEventListener('scroll', handleWindowScroll);
        }
    }, []);

    // Extract dominant color from thumbnail
    useEffect(() => {
        if (!playlist?.thumbnail) {
            setDominantColor(null);
            return;
        }

        const fac = new FastAverageColor();
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.src = playlist.thumbnail;

        img.onload = () => {
            try {
                const color = fac.getColor(img, { algorithm: 'dominant' });
                // Make color darker for better readability
                const [r, g, b] = color.value;
                const darkerColor = `rgba(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)}, 0.95)`;
                setDominantColor(darkerColor);
            } catch (err) {
                console.error('Failed to extract color:', err);
                setDominantColor(null);
            }
        };

        img.onerror = () => {
            setDominantColor(null);
        };

        return () => {
            fac.destroy();
        };
    }, [playlist?.thumbnail]);

    useEffect(() => {
        const loadPlaylist = async () => {
            if (!playlistId) return;

            try {
                const data = await getPlaylist(playlistId);
                if (!data) {
                    setError('Playlist not found');
                } else {
                    setPlaylist(data);
                }
            } catch (err) {
                console.error('Failed to load playlist:', err);
                setError('Failed to load playlist');
            } finally {
                setLoading(false);
            }
        };

        loadPlaylist();
    }, [playlistId]);

    const handleBack = () => {
        router.push('/dashboard/library');
    };

    const handleDelete = async () => {
        if (!playlist || !confirm('Are you sure you want to delete this playlist?')) return;

        setDeleting(true);
        try {
            await deletePlaylist(playlist.id);
            router.push('/dashboard/library');
        } catch (err) {
            console.error('Failed to delete playlist:', err);
        } finally {
            setDeleting(false);
        }
    };

    // Always show guild selector first, then play based on permissions
    const checkPlayerAndPlay = useCallback(async (action: 'all' | 'track', track?: PlaylistTrack, trackIndex?: number) => {
        if (!user) return;

        // Always store pending action and show guild selector
        setPendingPlayAction(action);
        if (track) setPendingTrack(track);
        if (trackIndex !== undefined) setPendingTrackIndex(trackIndex);
        setShowGuildSelect(true);
    }, [user]);

    // Handle voice channel selection
    const handleVoiceChannelSelect = useCallback(async (channelId: string) => {
        if (!selectedGuildId || !user) return;

        try {
            // Join the voice channel
            const joinRes = await fetch(`/api/player/${selectedGuildId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelId,
                    user: { username: user.username, discordId: user.discordId }
                }),
            });

            if (!joinRes.ok) {
                const data = await joinRes.json();
                throw new Error(data.error || 'Failed to join voice channel');
            }

            // Wait a moment for bot to join
            await new Promise(resolve => setTimeout(resolve, 500));

            // Execute pending play action
            if (pendingPlayAction === 'all') {
                await executePlayAll();
            } else if (pendingPlayAction === 'track' && pendingTrack) {
                await executePlayTrack(pendingTrack, pendingTrackIndex);
            }
        } catch (err: any) {
            console.error('Failed to join voice channel:', err);
            addNotification('error', err.message || 'Failed to join voice channel');
        } finally {
            // Clear pending states
            setPendingPlayAction(null);
            setPendingTrack(null);
            setPendingTrackIndex(null);
            setShowVoiceChannelModal(false);
        }
    }, [selectedGuildId, user, pendingPlayAction, pendingTrack, pendingTrackIndex]);

    // Execute play track (called after player check passes)
    const executePlayTrack = useCallback(async (track: PlaylistTrack, trackIndex?: number | null) => {
        if (!selectedGuildId || !user) return false;

        if (trackIndex !== undefined && trackIndex !== null) {
            setPlayingTrackIndex(trackIndex);
        }
        // Notifications now auto-manage

        try {
            // Build play value from track URI or search by title
            const playValue = track.uri || `${track.title} ${track.artist || ''}`.slice(0, 100);

            const res = await fetch(`/api/player/${selectedGuildId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'play',
                    value: playValue,
                    user: { username: user.username, discordId: user.discordId },
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to play track');
            }

            addNotification('success', `Playing: ${track.title}`);
            return true;
        } catch (err: any) {
            console.error('Failed to play track:', err);
            addNotification('error', err.message || 'Failed to play track');
            return false;
        } finally {
            setPlayingTrackIndex(null);
        }
    }, [selectedGuildId, user]);

    // Handle clicking on a track to play it
    const handlePlayTrack = async (track: PlaylistTrack, index: number) => {
        // Use checkPlayerAndPlay to ensure player exists
        await checkPlayerAndPlay('track', track, index);
    };

    // Execute play all (called after player check passes)
    const executePlayAll = useCallback(async () => {
        if (!playlist || playlist.tracks.length === 0) return;
        if (!selectedGuildId || !user) return;

        setPlaying(true);
        // Notifications now auto-manage

        try {
            // If playlist has source URL (original Spotify/YouTube link), play that
            if (playlist.sourceUrl) {
                const res = await fetch(`/api/player/${selectedGuildId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'play',
                        value: playlist.sourceUrl,
                        user: { username: user.username, discordId: user.discordId },
                    }),
                });

                if (!res.ok) {
                    throw new Error('Failed to play playlist');
                }

                addNotification('success', `Playing playlist: ${playlist.name}`);
            } else {
                // Play first track, then queue the rest
                const [firstTrack, ...restTracks] = playlist.tracks;

                // Play first track
                const playValue = firstTrack.uri || `${firstTrack.title} ${firstTrack.artist || ''}`.slice(0, 100);
                const res = await fetch(`/api/player/${selectedGuildId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'play',
                        value: playValue,
                        user: { username: user.username, discordId: user.discordId },
                    }),
                });

                if (!res.ok) {
                    throw new Error('Failed to start playlist');
                }

                // Queue remaining tracks
                for (const track of restTracks) {
                    const trackPlayValue = track.uri || `${track.title} ${track.artist || ''}`.slice(0, 100);
                    await fetch(`/api/player/${selectedGuildId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'play',
                            value: trackPlayValue,
                            user: { username: user.username, discordId: user.discordId },
                        }),
                    });
                }

                addNotification('success', `Playing ${playlist.tracks.length} tracks from ${playlist.name}`);
            }

            // Auto-dismiss handled by addNotification
        } catch (err: any) {
            addNotification('error', err.message || 'Failed to play playlist');
        } finally {
            setPlaying(false);
        }
    }, [playlist, selectedGuildId, user]);

    // Handle clicking play all button
    const handlePlayAll = async () => {
        if (!playlist || playlist.tracks.length === 0) return;
        // Use checkPlayerAndPlay to ensure player exists
        await checkPlayerAndPlay('all');
    };

    // Calculate total duration
    const totalDuration = playlist?.tracks.reduce((acc, t) => acc + (t.duration || 0), 0) || 0;
    const totalMinutes = Math.floor(totalDuration / 1000 / 60);
    const selectedGuild = guilds.find(g => g.guildId === selectedGuildId);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (error || !playlist) {
        return (
            <div className="text-center py-12">
                <p className="text-red-400">{error || 'Playlist not found'}</p>
                <button onClick={handleBack} className="mt-4 text-purple-400 hover:text-purple-300">
                    ← Back to Library
                </button>
            </div>
        );
    }

    return (
        <>
            {/* Guild Select Modal - Absolute positioned, outside main flow */}
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

                                                // Animate close
                                                setIsClosingGuildSelector(true);
                                                setSelectedGuildId(guild.guildId);

                                                await new Promise(resolve => setTimeout(resolve, 200));
                                                setShowGuildSelect(false);
                                                setIsClosingGuildSelector(false);

                                                // Show voice channel modal only if owner is not in voice AND no active player exists
                                                if (isOwner && !isInVoice && !guild.isPlaying) {
                                                    setShowVoiceChannelModal(true);
                                                } else {
                                                    // Member in voice OR Owner in voice - play immediately
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
                                                        if (pendingPlayAction === 'all') {
                                                            await executePlayAll();
                                                        } else if (pendingPlayAction === 'track' && pendingTrack) {
                                                            await executePlayTrack(pendingTrack, pendingTrackIndex);
                                                        }
                                                    } catch (err: any) {
                                                        addNotification('error', err.message || 'Failed to play');
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
                    onBack={() => {
                        // Go back to guild selector
                        setShowVoiceChannelModal(false);
                        setShowGuildSelect(true);
                    }}
                />
            )}

            {/* Stacked Notifications */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {notifications.map((notification) => (
                    <div
                        key={notification.id}
                        className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg animate-fadeIn ${notification.type === 'success' ? 'bg-green-600/90' : 'bg-red-600/90'
                            } text-white`}
                    >
                        {notification.type === 'success' ? (
                            <CheckCircle className="h-5 w-5" />
                        ) : (
                            <AlertCircle className="h-5 w-5" />
                        )}
                        <span>{notification.message}</span>
                        <button
                            onClick={() => removeNotification(notification.id)}
                            className="ml-2 text-white/70 hover:text-white"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            {/* Dynamic colored background - extends to container edges */}
            <div
                className="absolute -top-4 sm:-top-6 md:-top-8 -left-4 sm:-left-6 md:-left-8 -right-4 sm:-right-6 md:-right-8 h-96 opacity-40 pointer-events-none transition-colors duration-500"
                style={{
                    background: dominantColor
                        ? `linear-gradient(to bottom, ${dominantColor}, transparent)`
                        : 'linear-gradient(to bottom, rgb(88, 28, 135), transparent)'
                }}
            />

            {/* Header - Sticky with shrink on scroll, dynamic color from thumbnail */}
            <div
                className={`sticky z-20 transition-all duration-300 ${isScrolled
                    ? '-top-4 sm:-top-6 md:-top-8 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 pt-2 sm:pt-3 md:pt-4 pb-3 shadow-lg rounded-b-xl'
                    : 'top-0'
                    }`}
                style={isScrolled ? {
                    backgroundColor: dominantColor || 'rgba(15, 23, 42, 0.95)'
                } : undefined}
            >
                <div className={`flex gap-4 items-center transition-all duration-300 ${isScrolled ? '' : 'flex-col md:flex-row md:items-end gap-6'
                    }`}>
                    {/* Thumbnail - Shrinks when scrolled */}
                    <div className={`relative rounded-xl overflow-hidden shadow-2xl flex-shrink-0 transition-all duration-300 ${isScrolled ? 'w-16 h-16' : 'w-48 h-48'
                        }`}>
                        {playlist.thumbnail ? (
                            <Image
                                src={playlist.thumbnail}
                                alt={playlist.name}
                                fill
                                className="object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                <ListMusic className="h-20 w-20 text-white/50" />
                            </div>
                        )}
                        {playlist.sourcePlatform && (
                            <div className={`absolute rounded-full flex items-center justify-center transition-all duration-300 ${isScrolled
                                ? 'top-1 right-1 w-5 h-5'
                                : 'top-2 right-2 w-8 h-8'
                                } ${playlist.sourcePlatform === 'spotify' ? 'bg-[#1DB954]' : 'bg-[#FF0000]'}`}>
                                {playlist.sourcePlatform === 'spotify' ? (
                                    <svg className={`text-white transition-all duration-300 ${isScrolled ? 'h-2.5 w-2.5' : 'h-4 w-4'}`} viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                    </svg>
                                ) : (
                                    <svg className={`text-white transition-all duration-300 ${isScrolled ? 'h-2.5 w-2.5' : 'h-4 w-4'}`} viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                    </svg>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Info - Shrinks when scrolled */}
                    <div className="flex-1 min-w-0">
                        <p className={`text-xs text-slate-400 uppercase tracking-wider transition-all duration-300 ${isScrolled ? 'hidden' : 'mb-1'
                            }`}>Playlist</p>
                        <h1 className={`font-bold text-white truncate transition-all duration-300 ${isScrolled ? 'text-xl' : 'text-3xl mb-2'
                            }`}>{playlist.name}</h1>
                        {playlist.description && !isScrolled && (
                            <p className="text-slate-400 mb-3">{playlist.description}</p>
                        )}
                        <div className={`flex items-center text-slate-400 transition-all duration-300 ${isScrolled ? 'text-xs gap-2' : 'gap-3 text-sm'
                            }`}>
                            <span className="flex items-center gap-1">
                                {!isScrolled && <Music className="h-4 w-4" />}
                                {playlist.trackCount} songs
                            </span>
                            <span className={isScrolled ? '' : 'hidden'}>•</span>
                            <span className="flex items-center gap-1">
                                {!isScrolled && <Clock className="h-4 w-4" />}
                                {totalMinutes} min
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    {/* Actions - Shrinks when scrolled */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={handlePlayAll}
                            disabled={playing}
                            className={`flex items-center justify-center rounded-full bg-purple-600 text-white font-medium hover:bg-purple-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${isScrolled ? 'w-10 h-10' : 'gap-2 px-6 py-3'
                                }`}
                        >
                            {playing ? (
                                <Loader2 className={`animate-spin ${isScrolled ? 'h-4 w-4' : 'h-5 w-5'}`} />
                            ) : (
                                <Play className={`${isScrolled ? 'h-4 w-4' : 'h-5 w-5'}`} />
                            )}
                            {!isScrolled && (playing ? 'Playing...' : 'Play')}
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className={`rounded-full border border-white/20 flex items-center justify-center text-slate-400 hover:text-red-400 hover:border-red-400/50 transition-all duration-300 ${isScrolled ? 'w-8 h-8' : 'w-10 h-10'
                                }`}
                        >
                            {deleting ? (
                                <Loader2 className={`animate-spin ${isScrolled ? 'h-4 w-4' : 'h-5 w-5'}`} />
                            ) : (
                                <Trash2 className={`${isScrolled ? 'h-4 w-4' : 'h-5 w-5'}`} />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Track List - Spotify Style */}
            <div className="mt-6 card-surface rounded-xl overflow-hidden">
                {/* Header - Hide Album and Date on mobile */}
                <div className="hidden md:grid grid-cols-[40px,minmax(200px,2fr),minmax(100px,1fr),minmax(100px,1fr),80px] gap-4 px-4 py-3 text-xs text-slate-500 uppercase tracking-wider border-b border-white/10">
                    <span className="text-center">#</span>
                    <span>Title</span>
                    <span>Album</span>
                    <span>Date Added</span>
                    <span className="text-right">
                        <Clock className="h-4 w-4 inline" />
                    </span>
                </div>
                {/* Mobile Header */}
                <div className="md:hidden grid grid-cols-[40px,1fr,60px] gap-4 px-4 py-3 text-xs text-slate-500 uppercase tracking-wider border-b border-white/10">
                    <span className="text-center">#</span>
                    <span>Title</span>
                    <span className="text-right">
                        <Clock className="h-4 w-4 inline" />
                    </span>
                </div>

                <div className="divide-y divide-white/5">
                    {playlist.tracks.map((track, index) => (
                        <div
                            key={`${track.title}-${index}`}
                            onClick={() => handlePlayTrack(track, index)}
                            className="group cursor-pointer transition-all duration-300 animate-fadeIn hover:bg-white/10 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-0.5 rounded-lg"
                            style={{
                                animationDelay: `${index * 50}ms`,
                                animationFillMode: 'backwards'
                            }}
                        >
                            {/* Desktop Row */}
                            <div className="hidden md:grid grid-cols-[40px,minmax(200px,2fr),minmax(100px,1fr),minmax(100px,1fr),80px] gap-4 px-4 py-3 items-center">
                                {/* Track Number / Play Icon */}
                                <div className="w-8 text-center">
                                    <span className="text-slate-500 group-hover:hidden">{index + 1}</span>
                                    <Play className="w-4 h-4 text-white hidden group-hover:block mx-auto" />
                                </div>

                                {/* Title + Artist + Thumbnail */}
                                <div className="flex items-center gap-3 min-w-0">
                                    {track.thumbnail ? (
                                        <Image
                                            src={track.thumbnail}
                                            alt={track.title}
                                            width={40}
                                            height={40}
                                            className="rounded object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
                                            <Music className="h-4 w-4 text-slate-500" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-white truncate">{track.title}</p>
                                        <p className="text-sm text-slate-400 truncate">{track.artist}</p>
                                    </div>
                                </div>

                                {/* Album */}
                                <span className="text-slate-400 text-sm truncate">
                                    {track.album || '–'}
                                </span>

                                {/* Date Added */}
                                <span className="text-slate-400 text-sm">
                                    {track.addedAt ? new Date(track.addedAt).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                    }) : '–'}
                                </span>

                                {/* Duration */}
                                <span className="text-slate-500 text-right tabular-nums">
                                    {track.duration ? formatDuration(track.duration) : '--:--'}
                                </span>
                            </div>

                            {/* Mobile Row */}
                            <div className="md:hidden grid grid-cols-[40px,1fr,60px] gap-4 px-4 py-3 items-center">
                                <div className="w-8 text-center">
                                    <span className="text-slate-500 group-hover:hidden">{index + 1}</span>
                                    <Play className="w-4 h-4 text-white hidden group-hover:block mx-auto" />
                                </div>

                                <div className="flex items-center gap-3 min-w-0">
                                    {track.thumbnail ? (
                                        <Image
                                            src={track.thumbnail}
                                            alt={track.title}
                                            width={40}
                                            height={40}
                                            className="rounded object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
                                            <Music className="h-4 w-4 text-slate-500" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-white truncate">{track.title}</p>
                                        <p className="text-sm text-slate-400 truncate">{track.artist}</p>
                                    </div>
                                </div>

                                <span className="text-slate-500 text-right tabular-nums">
                                    {track.duration ? formatDuration(track.duration) : '--:--'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Back button */}
            <button
                onClick={handleBack}
                className="mt-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
                <ChevronLeft className="h-4 w-4" />
                Back to Library
            </button>
        </>
    );
}
