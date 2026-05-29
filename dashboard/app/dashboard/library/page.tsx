'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Search, Music2, Users, Disc3, ListMusic, Library, Download, Play, Trash2, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { getUserPlaylists, deletePlaylist, type Playlist } from '@/lib/playlist-service';

type LibraryTab = 'all' | 'songs' | 'artists' | 'albums' | 'playlists';

interface TabConfig {
    id: LibraryTab;
    label: string;
    icon: React.ElementType;
    emptyTitle: string;
    emptyDescription: string;
    showImportButton?: boolean;
}

const tabs: TabConfig[] = [
    {
        id: 'all',
        label: 'All',
        icon: Library,
        emptyTitle: 'Your Library is Empty',
        emptyDescription: 'Follow artists, save albums, like tracks, or create playlists to see them here.'
    },
    {
        id: 'songs',
        label: 'Songs',
        icon: Music2,
        emptyTitle: 'No liked songs yet',
        emptyDescription: 'Songs you like will appear here.'
    },
    {
        id: 'artists',
        label: 'Artists',
        icon: Users,
        emptyTitle: 'No liked artists yet',
        emptyDescription: 'Artists you like will appear here.'
    },
    {
        id: 'albums',
        label: 'Albums',
        icon: Disc3,
        emptyTitle: 'No saved albums yet',
        emptyDescription: 'Albums you save will appear here.'
    },
    {
        id: 'playlists',
        label: 'Playlists',
        icon: ListMusic,
        emptyTitle: 'No playlists yet',
        emptyDescription: 'Import your playlists from other platforms to get started.',
        showImportButton: true
    },
];

export default function LibraryPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<LibraryTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const currentTab = useMemo(() =>
        tabs.find(tab => tab.id === activeTab) || tabs[0],
        [activeTab]
    );

    // Load user playlists
    useEffect(() => {
        const loadPlaylists = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                const userId = user.discordId || user.id;
                const userPlaylists = await getUserPlaylists(userId);
                setPlaylists(userPlaylists);
            } catch (error) {
                console.error('Failed to load playlists:', error);
            } finally {
                setLoading(false);
            }
        };

        loadPlaylists();
    }, [user]);

    const handleImportPlaylist = () => {
        router.push('/dashboard/library/import');
    };

    const handleViewPlaylist = (playlistId: string) => {
        router.push(`/dashboard/library/playlist/${playlistId}`);
    };

    const handleDeletePlaylist = async (playlistId: string) => {
        if (!confirm('Are you sure you want to delete this playlist?')) return;

        setDeletingId(playlistId);
        try {
            await deletePlaylist(playlistId);
            setPlaylists(prev => prev.filter(p => p.id !== playlistId));
        } catch (error) {
            console.error('Failed to delete playlist:', error);
        } finally {
            setDeletingId(null);
        }
    };

    // Filter playlists based on search
    const filteredPlaylists = useMemo(() => {
        if (!searchQuery.trim()) return playlists;
        const query = searchQuery.toLowerCase();
        return playlists.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.tracks.some(t => t.title.toLowerCase().includes(query) || t.artist.toLowerCase().includes(query))
        );
    }, [playlists, searchQuery]);

    // Check if we should show playlists or empty state
    const showPlaylists = (activeTab === 'all' || activeTab === 'playlists') && filteredPlaylists.length > 0;

    return (
        <div className="space-y-6">
            {/* Search Bar */}
            <div className="relative max-w-md mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search songs or artists"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-full bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
            </div>

            {/* Tabs */}
            <div className="flex justify-center gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${activeTab === tab.id
                            ? 'bg-white text-black'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {loading ? (
                    <div className="flex items-center justify-center h-[400px]">
                        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                    </div>
                ) : showPlaylists ? (
                    /* Playlist Grid */
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">
                                Your Playlists ({filteredPlaylists.length})
                            </h2>
                            <button
                                onClick={handleImportPlaylist}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 transition-colors"
                            >
                                <Download className="h-4 w-4" />
                                Import Playlist
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {filteredPlaylists.map((playlist) => (
                                <div
                                    key={playlist.id}
                                    className="group card-surface p-4 rounded-xl hover:bg-white/10 transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10"
                                    onClick={() => handleViewPlaylist(playlist.id)}
                                >
                                    <div className="relative aspect-square rounded-lg overflow-hidden mb-3">
                                        {playlist.thumbnail ? (
                                            <Image
                                                src={playlist.thumbnail}
                                                alt={playlist.name}
                                                fill
                                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                                <ListMusic className="h-12 w-12 text-white/50" />
                                            </div>
                                        )}

                                        {/* Play button overlay */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center hover:scale-110 transition-transform">
                                                <Play className="h-5 w-5 text-white ml-0.5" />
                                            </button>
                                        </div>

                                        {/* Delete button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeletePlaylist(playlist.id);
                                            }}
                                            disabled={deletingId === playlist.id}
                                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                                        >
                                            {deletingId === playlist.id ? (
                                                <Loader2 className="h-4 w-4 text-white animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4 text-white" />
                                            )}
                                        </button>

                                        {/* Source platform badge */}
                                        {playlist.sourcePlatform && (
                                            <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-xs font-medium ${playlist.sourcePlatform === 'spotify'
                                                ? 'bg-[#1DB954]/90 text-white'
                                                : 'bg-[#FF0000]/90 text-white'
                                                }`}>
                                                {playlist.sourcePlatform === 'spotify' ? 'Spotify' : 'YouTube'}
                                            </div>
                                        )}
                                    </div>

                                    <h3 className="font-semibold text-white truncate">{playlist.name}</h3>
                                    <p className="text-sm text-slate-400">{playlist.trackCount} tracks</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Empty State */
                    <div className="flex items-center justify-center h-[400px]">
                        <div className="card-surface p-12 rounded-2xl text-center max-w-lg w-full">
                            <div className="mb-6">
                                <currentTab.icon className="h-16 w-16 mx-auto text-slate-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-white mb-3">
                                {currentTab.emptyTitle}
                            </h2>
                            <p className="text-slate-400 mb-6">
                                {currentTab.emptyDescription}
                            </p>

                            {currentTab.showImportButton && (
                                <button
                                    onClick={handleImportPlaylist}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-600 text-white font-medium hover:bg-purple-500 transition-colors"
                                >
                                    <Download className="h-4 w-4" />
                                    Import Playlist
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
