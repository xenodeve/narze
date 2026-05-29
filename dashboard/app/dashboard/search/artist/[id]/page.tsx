'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Play, Shuffle, MoreHorizontal, Loader2, Music, User, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { VoiceChannelSelectorModal } from '@/components/VoiceChannelSelectorModal';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// ================= Types =================

interface SpotifyTrack {
    id: string;
    name: string;
    artists: { name: string }[];
    album: {
        name: string;
        images: { url: string }[];
    };
    duration_ms: number;
    external_urls: { spotify: string };
    popularity?: number;
    uri: string;
}

interface ArtistInfo {
    id: string;
    name: string;
    imageUrl?: string;
    followers?: number;
    genres?: string[];
}

interface SpotifyAlbum {
    id: string;
    name: string;
    images: { url: string }[];
    release_date: string;
    total_tracks: number;
    external_urls: { spotify: string };
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

// ================= Helper Functions =================

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatNumber(num?: number): string {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
}

function formatFollowers(count?: number): string {
    if (!count) return '';
    return `${formatNumber(count)} followers`;
}

// ================= Main Page =================

export default function ArtistPage() {
    const params = useParams();
    const router = useRouter();
    const artistId = params.id as string;
    const { user } = useAuth();

    const [artist, setArtist] = useState<ArtistInfo | null>(null);
    const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
    const [albums, setAlbums] = useState<SpotifyAlbum[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAllTracks, setShowAllTracks] = useState(false);

    // Guild selector states
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
    const [showGuildSelect, setShowGuildSelect] = useState(false);
    const [guildPermissions, setGuildPermissions] = useState<Record<string, GuildPermission>>({});
    const [isClosingGuildSelector, setIsClosingGuildSelector] = useState(false);

    // Voice channel modal states
    const [showVoiceChannelModal, setShowVoiceChannelModal] = useState(false);
    const [pendingPlayUri, setPendingPlayUri] = useState<string | null>(null);
    const [playingTrackUri, setPlayingTrackUri] = useState<string | null>(null); // For UI feedback

    // Fetch artist data
    useEffect(() => {
        async function fetchArtistData() {
            if (!artistId) return;

            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/artist/${artistId}`);

                if (!response.ok) {
                    throw new Error('Failed to fetch artist');
                }

                const data = await response.json();
                console.log('Artist data received:', data.artist);
                setArtist(data.artist);

                // Keep tracks with URI usually provided
                const tracks = data.topTracks || [];
                // Ensure URI is present (some APIs might miss it or use external_urls)
                const formattedTracks = tracks.map((t: any) => ({
                    ...t,
                    uri: t.uri || t.external_urls?.spotify
                }));

                setTopTracks(formattedTracks);
                setAlbums(data.albums || []);
            } catch (err) {
                setError('Failed to load artist. Please try again.');
                console.error('Artist fetch error:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchArtistData();
    }, [artistId]);

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

                    const savedGuild = localStorage.getItem('selectedGuildId');
                    if (savedGuild && guildList.some((g: Guild) => g.guildId === savedGuild)) {
                        setSelectedGuildId(savedGuild);
                    } else if (guildList.length > 0) {
                        setSelectedGuildId(guildList[0].guildId);
                    }

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

            await fetch(`/api/player/${selectedGuildId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelId,
                    user: { username: user.username, discordId: user.discordId }
                }),
            });

            await new Promise(resolve => setTimeout(resolve, 500));

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

    // Handle play
    const handlePlay = useCallback((uri: string, searchQuery?: string) => {
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

        setPendingPlayUri(playValue);
        setShowGuildSelect(true);
    }, [user]);

    // Handle play all (plays top tracks usually or context)
    const handlePlayAll = useCallback(() => {
        if (!artist || !topTracks.length) return;
        // Spotify Artist context URI
        const artistUri = `spotify:artist:${artist.id}`;
        // If we can play via URI, good. Otherwise maybe play top tracks?
        // Bot usually supports artist link or search
        // Try playing artist URI
        handlePlay(artistUri);
    }, [artist, topTracks, handlePlay]);

    if (loading) {
        return (
            <div className="min-h-full flex items-center justify-center pt-20">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
        );
    }

    if (error || !artist) {
        return (
            <div className="min-h-full flex flex-col items-center justify-center pt-20">
                <User className="w-16 h-16 text-slate-600 mb-4" />
                <p className="text-slate-400 mb-4">{error || 'Artist not found'}</p>
                <Link
                    href="/dashboard/search"
                    className="text-green-400 hover:text-green-300 transition-colors"
                >
                    Back to Search
                </Link>
            </div>
        );
    }

    const displayedTracks = showAllTracks ? topTracks : topTracks.slice(0, 5);

    return (
        <div className="min-h-full -m-4 sm:-m-6 md:-m-8 pb-10">
            {/* Hero Header with Artist Image */}
            <div
                className="relative h-72 md:h-80 lg:h-96 bg-cover bg-center bg-no-repeat"
                style={{
                    backgroundImage: artist.imageUrl
                        ? `url(${artist.imageUrl})`
                        : undefined,
                    backgroundColor: artist.imageUrl ? undefined : '#1a1a2e'
                }}
            >
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[#121212]" />

                {/* Back button */}
                <div className="absolute top-4 left-4 z-10">
                    <button
                        onClick={() => router.back()}
                        className="p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Artist info overlaid at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                    {/* Verified Badge - Only show for artists with 10K+ followers */}
                    {artist.followers && artist.followers >= 10000 && (
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-white fill-blue-500" />
                            </div>
                            <span className="text-sm text-white">Verified Artist</span>
                        </div>
                    )}

                    {/* Artist Name - Large */}
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white mb-4 tracking-tight">
                        {artist.name}
                    </h1>

                    {/* Followers */}
                    {artist.followers && (
                        <p className="text-sm text-slate-300">
                            {formatFollowers(artist.followers)}
                        </p>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="px-6 md:px-8 py-6">
                {/* Action Buttons Row */}
                <div className="flex items-center gap-4 mb-8">
                    {/* Play Button - Large Green Circle */}
                    <button
                        onClick={handlePlayAll}
                        className="w-14 h-14 bg-green-500 hover:bg-green-400 hover:scale-105 rounded-full flex items-center justify-center transition-all shadow-lg"
                    >
                        <Play className="w-6 h-6 text-black fill-black ml-1" />
                    </button>

                    {/* Shuffle Button */}
                    <button className="p-3 text-slate-400 hover:text-white transition-colors">
                        <Shuffle className="w-6 h-6" />
                    </button>

                    {/* More Options */}
                    <button className="p-3 text-slate-400 hover:text-white transition-colors">
                        <MoreHorizontal className="w-6 h-6" />
                    </button>
                </div>

                {/* Popular Tracks Section */}
                <section>
                    <h2 className="text-xl font-bold text-white mb-4">Popular</h2>

                    {topTracks.length === 0 ? (
                        <p className="text-slate-400">No tracks available</p>
                    ) : (
                        <div className="space-y-1">
                            {displayedTracks.map((track, index) => (
                                <div
                                    key={track.id}
                                    onClick={() => {
                                        const trackUri = track.uri || track.external_urls?.spotify || '';
                                        const searchQuery = `${track.name} ${track.artists?.map(a => a.name).join(' ') || ''}`;
                                        handlePlay(trackUri, searchQuery);
                                    }}
                                    className={`grid gap-4 px-3 py-2 rounded-lg group cursor-pointer transition-all duration-300 animate-fadeIn items-center hover:bg-white/10 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-0.5 ${(playingTrackUri === track.uri || playingTrackUri?.includes(track.name)) ? 'bg-white/10' : ''}
                                        ${track.popularity ? 'grid-cols-[16px_minmax(120px,4fr)_minmax(60px,1fr)_40px] md:grid-cols-[24px_minmax(200px,4fr)_minmax(80px,1fr)_60px]' : 'grid-cols-[16px_minmax(120px,1fr)_40px] md:grid-cols-[24px_minmax(200px,1fr)_60px]'}`}
                                    style={{
                                        animationDelay: `${index * 50}ms`,
                                        animationFillMode: 'backwards'
                                    }}
                                >
                                    {/* Track Number / Play Icon */}
                                    <div className="flex items-center justify-center">
                                        {playingTrackUri === track.uri ? (
                                            <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
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
                                        <div className="relative w-10 h-10 rounded overflow-hidden bg-white/10 flex-shrink-0">
                                            {track.album?.images?.[0]?.url ? (
                                                <Image
                                                    src={track.album.images[0].url}
                                                    alt={track.album.name}
                                                    fill
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Music className="w-4 h-4 text-slate-500" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <span className={`truncate font-medium transition-colors block ${playingTrackUri === track.uri ? 'text-green-500' : 'text-white'
                                                }`}>
                                                {track.name}
                                            </span>
                                            {track.album?.name && (
                                                <span className="text-xs text-slate-500 truncate block">
                                                    {track.album.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Play Count - only show if real data exists */}
                                    {track.popularity !== undefined && track.popularity !== null && (
                                        <span className="text-slate-400 text-sm text-right">
                                            {formatNumber(track.popularity * 100000)}
                                        </span>
                                    )}

                                    {/* Duration */}
                                    <span className="text-slate-400 text-sm text-right">
                                        {formatDuration(track.duration_ms)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* See More Button */}
                    {topTracks.length > 5 && (
                        <button
                            onClick={() => setShowAllTracks(!showAllTracks)}
                            className="mt-4 text-sm text-slate-400 hover:text-white font-semibold transition-colors"
                        >
                            {showAllTracks ? 'Show less' : 'See more'}
                        </button>
                    )}
                </section>

                {/* Albums */}
                {albums.length > 0 && (
                    <section className="mt-10">
                        <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {albums.slice(0, 10).map((album, index) => (
                                <a
                                    key={album.id}
                                    href={`/dashboard/search/album/${album.id}`}
                                    className="group bg-white/5 rounded-lg p-3 hover:bg-white/10 transition-all duration-300 animate-fadeIn hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10"
                                    style={{
                                        animationDelay: `${index * 50}ms`,
                                        animationFillMode: 'backwards'
                                    }}
                                >
                                    <div className="relative aspect-square rounded-md overflow-hidden mb-3">
                                        {album.images?.[0]?.url ? (
                                            <Image
                                                src={album.images[0].url}
                                                alt={album.name}
                                                fill
                                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-white/10 flex items-center justify-center">
                                                <Music className="w-8 h-8 text-slate-500" />
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="font-medium text-white truncate group-hover:text-purple-400 transition-colors">
                                        {album.name}
                                    </h3>
                                    <p className="text-sm text-slate-400 truncate">
                                        {album.release_date?.substring(0, 4)} • {album.total_tracks} songs
                                    </p>
                                </a>
                            ))}
                        </div>
                    </section>
                )}

                {/* Genres */}
                {artist.genres && artist.genres.length > 0 && (
                    <section className="mt-10">
                        <h2 className="text-xl font-bold text-white mb-4">Genres</h2>
                        <div className="flex flex-wrap gap-2">
                            {artist.genres.map((genre, index) => (
                                <span
                                    key={index}
                                    className="px-3 py-1 bg-white/10 rounded-full text-sm text-slate-300 hover:bg-white/20 transition-colors cursor-pointer"
                                >
                                    {genre}
                                </span>
                            ))}
                        </div>
                    </section>
                )}
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

                                                // Show voice channel modal only if owner is not in voice AND no active player exists
                                                if (isOwner && !isInVoice && !guild.isPlaying) {
                                                    setShowVoiceChannelModal(true);
                                                } else {
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
