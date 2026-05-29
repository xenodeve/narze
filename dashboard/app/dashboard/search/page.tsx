'use client';

import { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Loader2, Music, User, Disc3, X, Play, ChevronLeft, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { VoiceChannelSelectorModal } from '@/components/VoiceChannelSelectorModal';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// ================= Types =================

interface SearchResultTrack {
    id: string;
    title: string;
    artist: string;
    artistId?: string;
    album?: string;
    albumId?: string;
    duration?: number;
    thumbnail?: string;
    uri?: string;
    spotifyUrl?: string;
}

interface SearchResultArtist {
    id: string;
    name: string;
    imageUrl?: string;
    followers?: number;
    genres?: string[];
    spotifyUrl?: string;
    youtubeUrl?: string;
}

interface SearchResultAlbum {
    id: string;
    name: string;
    artistName: string;
    artistId?: string;
    imageUrl?: string;
    releaseDate?: string;
    trackCount?: number;
    spotifyUrl?: string;
}

interface SearchResult {
    query: string;
    topResult?: {
        type: 'track' | 'artist' | 'album';
        data: SearchResultTrack | SearchResultArtist | SearchResultAlbum;
        score: number;
    };
    tracks: SearchResultTrack[];
    artists: SearchResultArtist[];
    albums: SearchResultAlbum[];
    fromCache: boolean;
}

// ================= Helper Functions =================

function formatDuration(ms?: number): string {
    if (!ms) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatFollowers(count?: number): string {
    if (!count) return '';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M followers`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K followers`;
    return `${count} followers`;
}

// ================= Components =================

function TopResultCard({ topResult, onPlay, source }: {
    topResult: SearchResult['topResult'];
    onPlay?: (uri: string, trackId: string) => void;
    source?: string;
}) {
    if (!topResult) return null;

    const { type, data, score } = topResult;

    const isArtist = type === 'artist';
    const isAlbum = type === 'album';
    const isTrack = type === 'track';

    const imageUrl = isArtist
        ? (data as SearchResultArtist).imageUrl
        : isAlbum
            ? (data as SearchResultAlbum).imageUrl
            : (data as SearchResultTrack).thumbnail;

    const title = isTrack
        ? (data as SearchResultTrack).title
        : (data as SearchResultArtist | SearchResultAlbum).name;

    const subtitle = isTrack
        ? (data as SearchResultTrack).artist
        : isAlbum
            ? (data as SearchResultAlbum).artistName
            : formatFollowers((data as SearchResultArtist).followers);

    // Determine the link based on type and source
    const getLink = () => {
        if (isArtist) {
            const artistId = (data as SearchResultArtist).id;
            if (source === 'youtube' || source === 'youtubemusic') {
                return `/dashboard/search/youtube/channel/${artistId}`;
            }
            return `/dashboard/search/artist/${artistId}`;
        }
        if (isAlbum) {
            return `/dashboard/search/album/${(data as SearchResultAlbum).id}`;
        }
        return null; // Tracks don't have a dedicated page
    };

    const link = getLink();

    const cardContent = (
        <>
            {/* Top Result label - top left */}
            <h3 className="absolute top-4 left-8 text-sm font-medium text-slate-400">Top Result</h3>

            {/* Match score - top right */}
            <div className="absolute top-4 right-4">
                <span className="text-xs text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {Math.round(score * 100)}% match
                </span>
            </div>

            {/* Main content - vertically centered */}
            <div className="flex items-center justify-center h-full pt-6 overflow-hidden">
                <div className="flex items-center gap-6 w-full max-w-full overflow-hidden">
                    <div className={`relative w-40 h-40 md:w-44 md:h-44 flex-shrink-0 ${isArtist ? 'rounded-full' : 'rounded-xl'} overflow-hidden bg-white/10 shadow-xl`}>
                        {imageUrl ? (
                            <Image
                                src={imageUrl}
                                alt={title}
                                fill
                                className="object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                {isArtist ? <User className="w-16 h-16 text-slate-500" /> : <Music className="w-16 h-16 text-slate-500" />}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h4 className="text-3xl md:text-4xl font-bold text-white truncate mb-2">{title}</h4>
                        {subtitle && <p className="text-lg text-slate-400">{subtitle}</p>}
                        <span className={`inline-block mt-4 text-sm px-4 py-1.5 rounded-full font-medium ${isArtist ? 'bg-purple-600/30 text-purple-300' :
                            isAlbum ? 'bg-white/10 text-slate-300' :
                                'bg-green-600/30 text-green-300'
                            }`}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Play button on hover */}
            {isTrack && (data as SearchResultTrack).uri && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const track = data as SearchResultTrack;
                        onPlay?.(track.uri!, track.id);
                    }}
                    className="absolute bottom-4 right-4 w-12 h-12 bg-green-500 hover:bg-green-400 hover:scale-105 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                    <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                </button>
            )}
        </>
    );

    // Wrap in Link if there's a destination, otherwise just a div
    if (link) {
        return (
            <Link
                href={link}
                className="bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 rounded-2xl p-8 transition-all duration-300 group relative overflow-hidden block cursor-pointer min-h-[260px] flex flex-col justify-center hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10"
            >
                {cardContent}
            </Link>
        );
    }

    return (
        <div className="bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 rounded-2xl p-8 transition-all duration-300 group relative overflow-hidden min-h-[260px] flex flex-col justify-center hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10">
            {cardContent}
        </div>
    );
}

const TrackItem = memo(function TrackItem({ track, index, onPlay, isPlaying }: {
    track: SearchResultTrack;
    index: number;
    onPlay?: (uri: string, trackId: string) => void;
    isPlaying?: boolean;
}) {
    return (
        <div
            className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 group cursor-pointer border border-transparent hover:border-white/5 hover:scale-[1.01] ${isPlaying ? 'bg-green-500/10 border-green-500/30' : ''}`}
            style={{
                opacity: 0,
                animation: `slideUpFadeIn 0.5s ease-out ${index * 80}ms forwards`
            }}
            onClick={() => track.uri && onPlay?.(track.uri, track.id)}
        >
            <span className={`w-5 text-center text-sm transition-all duration-300 ${isPlaying ? 'text-green-400' : 'text-slate-500'} group-hover:opacity-0 group-hover:scale-75`}>
                {isPlaying ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                    index + 1
                )}
            </span>
            <Play className="w-4 h-4 text-white absolute left-3 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110" />

            <div className="relative w-10 h-10 rounded overflow-hidden bg-white/10 flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
                {track.thumbnail ? (
                    <Image src={track.thumbnail} alt={track.title} fill className="object-cover transition-transform duration-300 group-hover:scale-110" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4 text-slate-500" />
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate transition-colors duration-300 ${isPlaying ? 'text-green-400' : 'text-white group-hover:text-purple-400'}`}>{track.title}</p>
                <p className="text-xs text-slate-400 truncate transition-colors duration-300 group-hover:text-slate-300">{track.artist}</p>
            </div>

            <span className="text-xs text-slate-500 transition-colors duration-300 group-hover:text-slate-400">{formatDuration(track.duration)}</span>
        </div>
    );
});

function ArtistCard({ artist, source }: { artist: SearchResultArtist; source?: string }) {
    // Determine the correct URL based on source
    const artistUrl = source === 'youtube' || source === 'youtubemusic'
        ? `/dashboard/search/youtube/channel/${artist.id}`
        : `/dashboard/search/artist/${artist.id}`;

    const isYouTube = source === 'youtube' || source === 'youtubemusic';

    return (
        <Link
            href={artistUrl}
            className="flex flex-col items-center p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300 group hover:scale-[1.02]"
        >
            <div className={`relative w-32 h-32 rounded-full overflow-hidden bg-white/10 mb-3 group-hover:shadow-lg transition-shadow ${isYouTube ? 'group-hover:shadow-red-500/20' : 'group-hover:shadow-purple-500/20'}`}>
                {artist.imageUrl ? (
                    <Image src={artist.imageUrl} alt={artist.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <User className="w-12 h-12 text-slate-500" />
                    </div>
                )}
            </div>
            <h4 className="text-sm font-medium text-white text-center truncate w-full">{artist.name}</h4>
            <p className="text-xs text-slate-500">Artist</p>
        </Link>
    );
}

function AlbumCard({ album }: { album: SearchResultAlbum }) {
    return (
        <Link
            href={`/dashboard/search/album/${album.id}`}
            className="flex flex-col p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300 group hover:scale-[1.02]"
        >
            <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-white/10 mb-3 group-hover:shadow-lg group-hover:shadow-purple-500/20 transition-shadow">
                {album.imageUrl ? (
                    <Image src={album.imageUrl} alt={album.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="w-12 h-12 text-slate-500" />
                    </div>
                )}
            </div>
            <h4 className="text-sm font-medium text-white truncate">{album.name}</h4>
            <p className="text-xs text-slate-400 truncate">{album.artistName}</p>
            {album.releaseDate && (
                <p className="text-xs text-slate-500">{album.releaseDate.slice(0, 4)}</p>
            )}
        </Link>
    );
}

// ================= Main Page =================

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

export default function SearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentQuery = searchParams.get('q') || '';
    const { user } = useAuth();

    const [results, setResults] = useState<SearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

    // Guild selector states
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
    const [showGuildSelect, setShowGuildSelect] = useState(false);
    const [guildPermissions, setGuildPermissions] = useState<Record<string, GuildPermission>>({});
    const [isClosingGuildSelector, setIsClosingGuildSelector] = useState(false);

    // Voice channel modal states  
    const [showVoiceChannelModal, setShowVoiceChannelModal] = useState(false);
    const [pendingPlayUri, setPendingPlayUri] = useState<string | null>(null);
    const [pendingPlayTrackId, setPendingPlayTrackId] = useState<string | null>(null);

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
            setPlayingTrackId(pendingPlayTrackId);

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
            setPendingPlayTrackId(null);
            setShowVoiceChannelModal(false);
            setTimeout(() => setPlayingTrackId(null), 1000);
        }
    }, [selectedGuildId, user, pendingPlayUri, pendingPlayTrackId]);

    // Handle play - show guild selector first
    const handlePlay = useCallback(async (uri: string, trackId?: string) => {
        if (!user) {
            alert('Please login first');
            return;
        }

        // Store pending play info and show guild selector
        setPendingPlayUri(uri);
        setPendingPlayTrackId(trackId || null);
        setShowGuildSelect(true);
    }, [user]);

    const hasResults = results && (results.tracks.length > 0 || results.artists.length > 0 || results.albums.length > 0);

    // Search source options
    type SearchSource = 'spotify' | 'spotify-api' | 'youtube' | 'youtubemusic';
    const [searchSource, setSearchSource] = useState<SearchSource>('spotify-api');

    // Helper to compare results
    const areResultsEqual = useCallback((a: SearchResult | null, b: SearchResult | null): boolean => {
        if (!a || !b) return false;
        if (a.tracks.length !== b.tracks.length) return false;
        // Compare track IDs
        const aIds = a.tracks.map(t => t.id).join(',');
        const bIds = b.tracks.map(t => t.id).join(',');
        return aIds === bIds;
    }, []);

    // Re-fetch when source changes
    useEffect(() => {
        const fetchResults = async () => {
            if (!currentQuery.trim()) {
                setResults(null);
                setError(null);
                return;
            }

            // Only show loading if we have no previous results
            if (!results) {
                setLoading(true);
            }
            setError(null);

            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(currentQuery)}&source=${searchSource}`);

                if (!response.ok) {
                    throw new Error('Search failed');
                }

                const data = await response.json();

                // Only update if results are different
                if (!areResultsEqual(results, data)) {
                    setResults(data);
                }
            } catch (err) {
                setError('Failed to search. Please try again.');
                console.error('Search error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentQuery, searchSource, areResultsEqual]);

    return (
        <div className="min-h-full">
            {/* Content */}
            <div className="max-w-6xl mx-auto px-6 py-6">
                {/* Source Tabs */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    <button
                        onClick={() => setSearchSource(searchSource === 'spotify' ? 'spotify' : 'spotify-api')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${searchSource === 'spotify' || searchSource === 'spotify-api'
                            ? 'bg-green-500 text-black'
                            : 'bg-white/10 text-white hover:bg-white/20'
                            }`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        Spotify
                    </button>
                    <button
                        onClick={() => setSearchSource('youtube')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${searchSource === 'youtube'
                            ? 'bg-red-600 text-white'
                            : 'bg-white/10 text-white hover:bg-white/20'
                            }`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                        YouTube
                    </button>
                    <button
                        onClick={() => setSearchSource('youtubemusic')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${searchSource === 'youtubemusic'
                            ? 'bg-red-500 text-white'
                            : 'bg-white/10 text-white hover:bg-white/20'
                            }`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z" />
                        </svg>
                        YouTube Music
                    </button>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                    </div>
                )}

                {/* Error State */}
                {!loading && error && (
                    <div className="text-center py-12">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !currentQuery && !results && (
                    <div className="text-center py-20">
                        <Search className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-white mb-2">Search for music</h2>
                        <p className="text-slate-400">Find songs, artists, and albums</p>
                    </div>
                )}

                {/* No Results */}
                {!loading && currentQuery && results && !hasResults && (
                    <div className="text-center py-20">
                        <Music className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-white mb-2">No results found for "{currentQuery}"</h2>
                        <p className="text-slate-400">Try searching for something else</p>
                    </div>
                )}

                {/* Results */}
                {!loading && hasResults && results && (
                    <div className="space-y-8">
                        {/* Top Result + Songs Row */}
                        {(results.topResult || results.tracks.length > 0) && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Top Result */}
                                {results.topResult && (
                                    <TopResultCard topResult={results.topResult} onPlay={handlePlay} source={searchSource} />
                                )}

                                {/* Songs */}
                                {results.tracks.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-lg font-semibold text-white">Songs</h3>
                                            {/* Spotify Mode Toggle - show only when Spotify is selected */}
                                            {(searchSource === 'spotify' || searchSource === 'spotify-api') && (
                                                <div className="relative flex items-center bg-white/5 rounded-full p-1 border border-white/10 overflow-hidden">
                                                    {/* Animated sliding indicator */}
                                                    <div
                                                        className="absolute h-[calc(100%-8px)] bg-gradient-to-r from-green-500/40 to-green-400/30 rounded-full transition-all duration-300 ease-out shadow-lg shadow-green-500/20"
                                                        style={{
                                                            width: searchSource === 'spotify-api' ? '42px' : '64px',
                                                            left: searchSource === 'spotify-api' ? '4px' : 'calc(100% - 68px)',
                                                            top: '4px'
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => setSearchSource('spotify-api')}
                                                        className={`relative z-10 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${searchSource === 'spotify-api'
                                                            ? 'text-green-400 scale-105'
                                                            : 'text-slate-400 hover:text-white'
                                                            }`}
                                                    >
                                                        API
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchSource('spotify')}
                                                        className={`relative z-10 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${searchSource === 'spotify'
                                                            ? 'text-green-400 scale-105'
                                                            : 'text-slate-400 hover:text-white'
                                                            }`}
                                                    >
                                                        Lavalink
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            {results.tracks.slice(0, 5).map((track, index) => (
                                                <TrackItem
                                                    key={track.id}
                                                    track={track}
                                                    index={index}
                                                    onPlay={handlePlay}
                                                    isPlaying={playingTrackId === track.id}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Artists */}
                        {results.artists.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-4">Artists</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {results.artists.map((artist) => (
                                        <ArtistCard key={artist.id} artist={artist} source={searchSource} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Albums */}
                        {results.albums.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-4">Albums</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {results.albums.map((album) => (
                                        <AlbumCard key={album.id} album={album} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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
                            setPendingPlayTrackId(null);
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
                                                    // Member in voice OR Owner in voice - play immediately
                                                    setPlayingTrackId(pendingPlayTrackId);
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
                                                        setPendingPlayTrackId(null);
                                                        setTimeout(() => setPlayingTrackId(null), 1000);
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
                                    setPendingPlayTrackId(null);
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
                        setPendingPlayTrackId(null);
                    }}
                    onSelect={handleVoiceChannelSelect}
                />
            )}
        </div>
    );
}
