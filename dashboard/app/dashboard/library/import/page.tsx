'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Music, Youtube, Copy, ExternalLink, Settings, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { createPlaylist } from '@/lib/playlist-service';

type ImportStep = 1 | 2 | 3;
type Platform = 'spotify' | 'youtube' | null;

interface PlaylistData {
    name: string;
    thumbnail: string;
    trackCount: number;
    owner: string;
    tracks: { title: string; artist: string; thumbnail?: string; duration?: number }[];
}

interface ImportResult {
    instantlyImported: number;
    stillSyncing: number;
    playlistId?: string;
}

export default function ImportPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState<ImportStep>(1);
    const [platform, setPlatform] = useState<Platform>(null);
    const [playlistUrl, setPlaylistUrl] = useState('');
    const [playlistData, setPlaylistData] = useState<PlaylistData | null>(null);
    const [playlistName, setPlaylistName] = useState('');
    const [playlistDescription, setPlaylistDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importComplete, setImportComplete] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const steps = [
        { number: 1, label: 'Select Playlist' },
        { number: 2, label: 'Configure Import' },
        { number: 3, label: 'Importing' },
    ];

    const handlePlatformSelect = (p: Platform) => {
        setPlatform(p);
        setPlaylistUrl('');
        setError(null);
    };

    const handleFetchPlaylist = useCallback(async () => {
        if (!playlistUrl || !platform) return;

        setLoading(true);
        setError(null);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';
            const response = await fetch(`${apiUrl}/api/playlist/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: playlistUrl }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to fetch playlist');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch playlist');
            }

            // Build playlist data from API response
            const fetchedData: PlaylistData = {
                name: data.playlist?.name || data.tracks?.[0]?.title || 'Unknown Playlist',
                thumbnail: data.playlist?.thumbnail || data.tracks?.[0]?.thumbnail || '',
                trackCount: data.playlist?.trackCount || data.tracks?.length || 0,
                owner: data.playlist?.owner || 'Unknown',
                tracks: data.tracks || [],
            };

            // Update platform from API response if different
            if (data.platform && data.platform !== 'unknown') {
                setPlatform(data.platform);
            }

            setPlaylistData(fetchedData);
            setPlaylistName(fetchedData.name);
            setCurrentStep(2);
        } catch (err: any) {
            console.error('Failed to fetch playlist:', err);
            setError(err.message || 'Failed to fetch playlist. Please check the URL and try again.');
        } finally {
            setLoading(false);
        }
    }, [playlistUrl, platform]);

    const handleStartImport = async () => {
        if (!playlistData || !user) return;

        setCurrentStep(3);
        setImporting(true);
        setError(null);

        try {
            // Save playlist to Firebase
            const savedPlaylist = await createPlaylist({
                userId: user.discordId || user.id,
                name: playlistName || playlistData.name,
                description: playlistDescription,
                thumbnail: playlistData.thumbnail,
                tracks: playlistData.tracks.map(t => ({
                    title: t.title,
                    artist: t.artist,
                    duration: t.duration,
                    thumbnail: t.thumbnail,
                    uri: t.uri,
                    album: t.album,
                    addedAt: t.addedAt,
                })),
                sourcePlatform: platform || undefined,
                sourceUrl: playlistUrl,
            });

            setImportResult({
                instantlyImported: playlistData.tracks.length,
                stillSyncing: 0,
                playlistId: savedPlaylist.id
            });
            setImportComplete(true);
        } catch (err: any) {
            console.error('Failed to import playlist:', err);
            setError(err.message || 'Failed to import playlist. Please try again.');
            setCurrentStep(2); // Go back to configure step on error
        } finally {
            setImporting(false);
        }
    };

    const handleBack = () => {
        if (currentStep === 2) {
            setCurrentStep(1);
            setPlaylistData(null);
        } else if (currentStep === 3 && !importing) {
            router.push('/dashboard/library');
        }
    };

    const handleViewPlaylist = () => {
        // TODO: Navigate to the imported playlist
        router.push('/dashboard/library');
    };

    const handleImportAnother = () => {
        setCurrentStep(1);
        setPlatform(null);
        setPlaylistUrl('');
        setPlaylistData(null);
        setPlaylistName('');
        setPlaylistDescription('');
        setImportComplete(false);
        setImportResult(null);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-4">
                {steps.map((step, index) => {
                    const isCompleted = currentStep > step.number || (currentStep === 3 && importComplete);
                    const isActive = currentStep === step.number;

                    return (
                        <div key={step.number} className="flex items-center gap-2">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all ${isCompleted
                                ? 'bg-purple-600 text-white'
                                : isActive
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-white/10 text-slate-400'
                                }`}>
                                {isCompleted && currentStep > step.number ? (
                                    <Check className="h-4 w-4" />
                                ) : (
                                    step.number
                                )}
                            </div>
                            <span className={`text-sm ${isActive || isCompleted ? 'text-white' : 'text-slate-500'}`}>
                                {step.label}
                            </span>
                            {index < steps.length - 1 && (
                                <div className={`w-16 h-0.5 mx-2 ${currentStep > step.number ? 'bg-purple-600' : 'bg-white/10'
                                    }`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step 1: Select Playlist */}
            {currentStep === 1 && (
                <div className="text-center space-y-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Import Your Music</h1>
                        <p className="text-slate-400">Bring your playlists from other platforms to Narze</p>
                    </div>

                    {/* Platform Selection */}
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={() => handlePlatformSelect('spotify')}
                            className={`flex flex-col items-center gap-2 px-8 py-6 rounded-xl border transition-all ${platform === 'spotify'
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                }`}
                        >
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${platform === 'spotify' ? 'bg-[#1DB954]' : 'bg-[#1DB954]/20'
                                }`}>
                                <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                </svg>
                            </div>
                            <span className={`font-medium ${platform === 'spotify' ? 'text-white' : 'text-slate-400'}`}>
                                Spotify
                            </span>
                        </button>

                        <button
                            onClick={() => handlePlatformSelect('youtube')}
                            className={`flex flex-col items-center gap-2 px-8 py-6 rounded-xl border transition-all ${platform === 'youtube'
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                }`}
                        >
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${platform === 'youtube' ? 'bg-[#FF0000]' : 'bg-[#FF0000]/20'
                                }`}>
                                <Youtube className="h-6 w-6 text-white" />
                            </div>
                            <span className={`font-medium ${platform === 'youtube' ? 'text-white' : 'text-slate-400'}`}>
                                YouTube
                            </span>
                        </button>
                    </div>

                    {/* URL Input */}
                    {platform && (
                        <div className="max-w-lg mx-auto space-y-4 animate-fadeIn">
                            <input
                                type="text"
                                placeholder={`Paste ${platform === 'spotify' ? 'Spotify' : 'YouTube'} playlist URL here`}
                                value={playlistUrl}
                                onChange={(e) => setPlaylistUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleFetchPlaylist()}
                                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-purple-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
                            />

                            <button
                                onClick={handleFetchPlaylist}
                                disabled={!playlistUrl || loading}
                                className="w-full px-4 py-3 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Fetching playlist...
                                    </>
                                ) : (
                                    'Continue'
                                )}
                            </button>

                            {error && (
                                <p className="text-red-400 text-sm">{error}</p>
                            )}

                            {/* Instructions */}
                            <div className="card-surface p-4 rounded-xl text-left space-y-2">
                                <p className="text-yellow-400 text-sm flex items-center gap-2">
                                    <span className="text-lg">💡</span>
                                    How to get your playlist URL:
                                </p>
                                <ol className="text-slate-400 text-sm space-y-1 ml-6">
                                    <li className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center">1</span>
                                        Open {platform === 'spotify' ? 'Spotify' : 'YouTube'} and navigate to your playlist
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center">2</span>
                                        Click the three dots (...) menu
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center">3</span>
                                        Select "Share" → "Copy playlist link"
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center">4</span>
                                        Paste the link above
                                    </li>
                                </ol>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Step 2: Configure Import */}
            {currentStep === 2 && playlistData && (
                <div className="grid md:grid-cols-2 gap-8">
                    {/* Playlist Preview */}
                    <div className="text-center space-y-4">
                        <div className="relative w-48 h-48 mx-auto rounded-xl overflow-hidden shadow-2xl">
                            <Image
                                src={playlistData.thumbnail}
                                alt={playlistData.name}
                                fill
                                className="object-cover"
                            />
                            {platform === 'spotify' && (
                                <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center">
                                    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <h2 className="text-2xl font-bold text-white">{playlistData.name}</h2>
                        <div className="flex items-center justify-center gap-4 text-slate-400 text-sm">
                            <span className="flex items-center gap-1">
                                <Music className="h-4 w-4" />
                                {playlistData.trackCount} tracks
                            </span>
                            <span>by {playlistData.owner}</span>
                        </div>
                    </div>

                    {/* Import Settings */}
                    <div className="card-surface p-6 rounded-xl space-y-6">
                        <h3 className="flex items-center gap-2 text-white font-semibold">
                            <Settings className="h-5 w-5 text-purple-400" />
                            Import Settings
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                                    Import To:
                                </label>
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                                    <div className="w-6 h-6 rounded bg-purple-600 flex items-center justify-center">
                                        <Music className="h-3 w-3 text-white" />
                                    </div>
                                    <span className="text-white text-sm">Create new playlist</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                                    Playlist Name
                                </label>
                                <input
                                    type="text"
                                    value={playlistName}
                                    onChange={(e) => setPlaylistName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500 transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                                    Description (Optional)
                                </label>
                                <textarea
                                    value={playlistDescription}
                                    onChange={(e) => setPlaylistDescription(e.target.value)}
                                    placeholder="Add a description..."
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleBack}
                                className="flex-1 px-4 py-2.5 rounded-lg border border-white/20 text-white hover:bg-white/5 transition-all"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleStartImport}
                                className="flex-1 px-4 py-2.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 transition-all"
                            >
                                Start Import
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Importing / Complete */}
            {currentStep === 3 && (
                <div className="text-center space-y-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1">
                            {importComplete ? 'Import Complete' : `Importing from ${platform === 'spotify' ? 'Spotify' : 'YouTube'}`}
                        </h1>
                        <p className="text-slate-400">{playlistName}</p>
                    </div>

                    {!importComplete ? (
                        /* Importing Animation */
                        <div className="card-surface p-12 rounded-xl">
                            <div className="flex items-center justify-center gap-4">
                                {/* Source Platform */}
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${platform === 'spotify' ? 'bg-[#1DB954]' : 'bg-[#FF0000]'
                                    }`}>
                                    {platform === 'spotify' ? (
                                        <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                        </svg>
                                    ) : (
                                        <Youtube className="h-8 w-8 text-white" />
                                    )}
                                </div>

                                {/* Animated dots */}
                                <div className="flex items-center gap-2">
                                    {[...Array(6)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="w-2 h-2 rounded-full bg-slate-600 animate-pulse"
                                            style={{ animationDelay: `${i * 0.15}s` }}
                                        />
                                    ))}
                                </div>

                                {/* Narze */}
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                                    <Music className="h-8 w-8 text-white" />
                                </div>
                            </div>

                            <p className="text-slate-400 mt-8">Establishing connection...</p>
                            <div className="w-48 h-1 mx-auto mt-4 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-600 animate-pulse" style={{ width: '60%' }} />
                            </div>
                        </div>
                    ) : (
                        /* Import Complete */
                        <div className="card-surface p-8 rounded-xl max-w-md mx-auto space-y-6">
                            <div className="w-16 h-16 mx-auto rounded-full bg-purple-600/20 border-2 border-purple-500 flex items-center justify-center">
                                <Check className="h-8 w-8 text-purple-400" />
                            </div>

                            <div className="space-y-1">
                                <p className="text-slate-400 text-xs uppercase tracking-wider">Instantly Imported</p>
                                <p className="text-3xl font-bold text-white">{importResult?.instantlyImported}</p>
                                <p className="text-slate-500 text-sm">Added to your playlist right away</p>
                            </div>

                            {importResult?.stillSyncing && importResult.stillSyncing > 0 && (
                                <div className="space-y-1 pt-2 border-t border-white/10">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider">Still Syncing</p>
                                    <p className="text-2xl font-bold text-white">{importResult.stillSyncing}</p>
                                    <p className="text-slate-500 text-sm">We'll attempt to add the remaining tracks automatically over the next 24 hours.</p>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={handleViewPlaylist}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 transition-all"
                                >
                                    View Playlist
                                </button>
                                <button
                                    onClick={handleImportAnother}
                                    className="flex-1 px-4 py-2.5 rounded-lg border border-white/20 text-white hover:bg-white/5 transition-all"
                                >
                                    Import Another
                                </button>
                            </div>

                            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all">
                                <Copy className="h-4 w-4" />
                                Copy Link
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
