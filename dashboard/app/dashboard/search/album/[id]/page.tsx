'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, Play, Clock, MoreVertical, Disc, Loader2, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { VoiceChannelSelectorModal } from '@/components/VoiceChannelSelectorModal';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface Track {
    id: string;
    title: string;
    artist: string;
    duration: number;
    uri?: string;
}

interface AlbumData {
    id: string;
    name: string;
    artist: string;
    artistId?: string | null;
    releaseDate?: string;
    images?: { url: string }[];
    tracks: Track[];
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

function formatDuration(ms: number) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
}

function formatDate(dateString?: string) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric' });
}

export default function AlbumPage() {
    const router = useRouter();
    const params = useParams();
    const albumId = params.id as string;
    const { user } = useAuth();
    const [album, setAlbum] = useState<AlbumData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Guild selector states
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
    const [showGuildSelect, setShowGuildSelect] = useState(false);
    const [guildPermissions, setGuildPermissions] = useState<Record<string, GuildPermission>>({});
    const [isClosingGuildSelector, setIsClosingGuildSelector] = useState(false);

    // Voice channel modal states  
    const [showVoiceChannelModal, setShowVoiceChannelModal] = useState(false);
    const [pendingPlayUri, setPendingPlayUri] = useState<string | null>(null);
    const [pendingPlayTrackId, setPendingPlayTrackId] = useState<string | null>(null); // Not strictly used for UI here but good for consistency
    const [playingTrackUri, setPlayingTrackUri] = useState<string | null>(null); // For UI feedback

    const fetchAlbum = useCallback(async () => {
        if (!albumId) return;
        try {
            setLoading(true);
            const res = await fetch(`/api/album/${albumId}`);

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to fetch album');
            }

            const data = await res.json();
            setAlbum(data);
        } catch (err: any) {
            console.error('Error fetching album:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [albumId]);

    useEffect(() => {
        fetchAlbum();
    }, [fetchAlbum]);

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

                    // Auto-select from localStorage
                    const savedGuild = localStorage.getItem('selectedGuildId');
                    if (savedGuild && guildList.some((g: Guild) => g.guildId === savedGuild)) {
                        setSelectedGuildId(savedGuild);
                    } else if (guildList.length > 0) {
                        setSelectedGuildId(guildList[0].guildId);
                    }

                    // Fetch permissions for all guilds
                    if (guildList.length > 0) {
                        const guildIds = guildList.map((g: Guild) => g.guildId);
                        const permRes = await fetch(`/api/guilds/user-permissions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: user.discordId, guildIds })
                        });
                        if (permRes.ok) {
                            const permData = await permRes.json();
                            setGuildPermissions(permData.permissions || {});
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to load guilds:', err);
            }
        };
        loadGuilds();
    }, [user]);

    // Handle voice channel selection
    const handleVoiceChannelSelect = useCallback(async (channelId: string) => {
        if (!selectedGuildId || !user || !pendingPlayUri) return;

        try {
            setPlayingTrackUri(pendingPlayUri);

            // Join the voice channel
            await fetch(`/api/player/${selectedGuildId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelId,
                    user: { username: user.username, discordId: user.discordId }
                }),
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            // Execute play
            const response = await fetch(`/api/player/${selectedGuildId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'play',
                    value: pendingPlayUri,
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
            setPendingPlayUri(null);
            setShowVoiceChannelModal(false);
            setTimeout(() => setPlayingTrackUri(null), 1000);
        }
    }, [selectedGuildId, user, pendingPlayUri]);

    const handlePlayTrack = useCallback(async (uri?: string, searchQuery?: string) => {
        if (!user) {
            alert('Please login first');
            return;
        }

        // If URI is empty or contains 'mock', use search query instead
        const playValue = (uri && !uri.includes('mock')) ? uri : searchQuery;

        if (!playValue) {
            alert('No playable URI or search query available');
            return;
        }

        // Store pending play info and show guild selector
        setPendingPlayUri(playValue);
        setShowGuildSelect(true);
    }, [user]);

    const handlePlayAlbum = async () => {
        if (!album || !album.tracks.length) return;
        const albumUri = `https://open.spotify.com/album/${album.id}`;
        await handlePlayTrack(albumUri);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (error || !album) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <Disc className="w-16 h-16 text-slate-600" />
                <h2 className="text-xl font-bold text-white">Album not found</h2>
                <p className="text-slate-400">{error || "Something went wrong"}</p>
                <Link
                    href="/dashboard/search"
                    className="px-4 py-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors text-white"
                >
                    Back to Search
                </Link>
            </div>
        );
    }

    const totalDuration = album.tracks.reduce((acc, curr) => acc + curr.duration, 0);

    return (
        <div className="space-y-8 pb-10">
            {/* Back Button */}
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
                <ChevronLeft className="w-5 h-5" />
                <span>Back</span>
            </button>

            {/* Hero Section */}
            <div className="flex flex-col md:flex-row gap-8 items-end md:items-end">
                {/* Cover Image */}
                <div className="relative w-52 h-52 md:w-64 md:h-64 rounded-xl overflow-hidden shadow-2xl shadow-black/50 flex-shrink-0 group">
                    {album.images?.[0]?.url ? (
                        <Image
                            src={album.images[0].url}
                            alt={album.name}
                            fill
                            className="object-cover"
                            priority
                        />
                    ) : (
                        <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                            <Disc className="w-20 h-20 text-slate-600" />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 space-y-4 w-full">
                    <span className="text-sm uppercase tracking-wider font-medium text-slate-400 block">Album</span>
                    <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight leading-none">{album.name}</h1>

                    <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-slate-300">
                        {/* Artist Name - clickable if artistId exists */}
                        {album.artistId ? (
                            <Link
                                href={`/dashboard/search/artist/${album.artistId}`}
                                className="font-bold text-white hover:underline"
                            >
                                {album.artist}
                            </Link>
                        ) : (
                            <span className="font-bold text-white">{album.artist}</span>
                        )}
                        <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(album.releaseDate)}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                        <span>{album.tracks.length} songs, {Math.floor(totalDuration / 60000)} min {Math.floor((totalDuration % 60000) / 1000)} sec</span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handlePlayAlbum}
                    className="w-14 h-14 bg-green-500 hover:bg-green-400 hover:scale-105 rounded-full flex items-center justify-center shadow-lg shadow-green-900/20 transition-all group"
                >
                    <Play className="w-6 h-6 text-black fill-black ml-1" />
                </button>
                {/* Could add Like / Download / Share buttons here */}
            </div>

            {/* Tracks List */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-[16px_1fr_auto] md:grid-cols-[16px_1fr_auto] gap-4 px-4 py-3 border-b border-white/5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span className="text-center">#</span>
                    <span>Title</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /></span>
                </div>

                <div>
                    {album.tracks.map((track, index) => (
                        <div
                            key={track.id}
                            onClick={() => handlePlayTrack(track.uri, `${track.title} ${track.artist}`)}
                            className={`group grid grid-cols-[16px_1fr_auto] md:grid-cols-[16px_1fr_auto] gap-4 px-4 py-3 transition-all duration-300 cursor-pointer items-center rounded-lg animate-fadeIn hover:bg-white/10 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-0.5 ${(playingTrackUri === track.uri || playingTrackUri === `${track.title} ${track.artist}`) ? 'bg-white/10' : ''
                                }`}
                            style={{
                                animationDelay: `${index * 50}ms`,
                                animationFillMode: 'backwards'
                            }}
                        >
                            <div className="flex items-center justify-center text-slate-500 text-sm font-variant-numeric tab-nums w-4">
                                {playingTrackUri === track.uri ? (
                                    <Loader2 className="w-3 h-3 text-green-500 animate-spin" />
                                ) : (
                                    <>
                                        <span className="group-hover:hidden">{index + 1}</span>
                                        <Play className="w-3 h-3 text-white hidden group-hover:block" />
                                    </>
                                )}
                            </div>

                            <div className="min-w-0">
                                <p className={`font-medium truncate transition-colors ${playingTrackUri === track.uri ? 'text-green-500' : 'text-white group-hover:text-green-400'
                                    }`}>{track.title}</p>
                                <p className="text-slate-500 text-sm truncate">{track.artist}</p>
                            </div>

                            <div className="text-slate-500 text-sm font-variant-numeric tab-nums">
                                {formatDuration(track.duration)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Guild Select Modal */}
            {showGuildSelect && (
                <div
                    className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${isClosingGuildSelector ? 'opacity-0' : 'animate-fadeIn'}`}
                    onClick={() => {
                        setIsClosingGuildSelector(true);
                        setTimeout(() => {
                            setShowGuildSelect(false);
                            setIsClosingGuildSelector(false);
                            setPendingPlayUri(null);
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
                                                localStorage.setItem('selectedGuildId', guild.guildId);

                                                await new Promise(resolve => setTimeout(resolve, 200));
                                                setShowGuildSelect(false);
                                                setIsClosingGuildSelector(false);

                                                // Owner not in voice - show voice channel selector
                                                // Show voice channel modal only if owner is not in voice AND no active player exists
                                                if (isOwner && !isInVoice && !guild.isPlaying) {
                                                    setShowVoiceChannelModal(true);
                                                } else {
                                                    // Member in voice OR Owner in voice - play immediately
                                                    setPlayingTrackUri(pendingPlayUri);
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

                                                        const response = await fetch(`/api/player/${guild.guildId}`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                action: 'play',
                                                                value: pendingPlayUri,
                                                                user: { username: user?.username, discordId: user?.discordId }
                                                            }),
                                                        });

                                                        if (!response.ok) {
                                                            const data = await response.json();
                                                            alert(`Failed to play: ${data.error || 'Unknown error'}`);
                                                        }
                                                    } catch (err: any) {
                                                        alert(err.message || 'Failed to play');
                                                    } finally {
                                                        setPendingPlayUri(null);
                                                        setTimeout(() => setPlayingTrackUri(null), 1000);
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
                                    setPendingPlayUri(null);
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
                        setPendingPlayUri(null);
                    }}
                    onSelect={handleVoiceChannelSelect}
                />
            )}
        </div>
    );
}
