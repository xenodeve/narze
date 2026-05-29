import { Router, Request, Response } from 'express';
import { clientBot } from '../../interfaces/client';
import { multiCategorySearch } from '../../functions/search/searchService';
import { SearchResultTrack } from '../../functions/cache/searchResultCache';

/**
 * Search Routes
 * Endpoints: /api/search, /api/artist/:id, /api/youtube/channel/:id, /api/album/:id
 */
export function createSearchRoutes(client: clientBot) {
    const router = Router();

    // Helper to get tracks from Lavalink using Riffy
    const getLavalinkTracks = async (searchQuery: string, searchPrefix: string): Promise<SearchResultTrack[]> => {
        try {
            const result = await client.manager.resolve({ query: `${searchPrefix}${searchQuery}`, requester: null });
            
            if (!result || !result.tracks || result.tracks.length === 0) return [];

            return result.tracks.slice(0, 10).map((track: any) => ({
                id: track.info?.identifier || track.identifier || '',
                title: track.info?.title || track.title || 'Unknown',
                artist: track.info?.author || track.author || 'Unknown',
                duration: track.info?.length || track.length || 0,
                thumbnail: track.info?.artworkUrl || track.info?.thumbnail || track.thumbnail || undefined,
                uri: track.info?.uri || track.uri || '',
                spotifyUrl: (track.info?.uri || track.uri || '').includes('spotify') ? (track.info?.uri || track.uri) : undefined,
                youtubeUrl: (track.info?.uri || track.uri || '').includes('youtube') ? (track.info?.uri || track.uri) : undefined
            }));
        } catch (error) {
            console.error('[API] Lavalink search error:', error);
            return [];
        }
    };

    // Multi-category search endpoint
    router.get('/search', async (req: Request, res: Response) => {
        try {
            const query = req.query.q as string;
            const source = (req.query.source as string) || 'spotify';
            
            if (!query || query.trim().length === 0) {
                return res.status(400).json({ error: 'Query parameter "q" is required' });
            }

            let searchPrefix: string;
            switch (source.toLowerCase()) {
                case 'youtube':
                    searchPrefix = 'ytsearch:';
                    break;
                case 'youtubemusic':
                case 'ytmusic':
                    searchPrefix = 'ytmsearch:';
                    break;
                case 'spotify':
                default:
                    // Use default search platform matches Dashboard Popup behavior
                    // Popup sends raw query without prefix, which returns better results (e.g. "Hold") than "spsearch:" ("Side A")
                    searchPrefix = '';
                    break;
            }

            if (source !== 'spotify' && source !== 'spotify-api') {
                const { searchYouTubeChannels } = await import('../../functions/youtube/youtubeChannelSearch');
                
                const [tracks, channels] = await Promise.all([
                    getLavalinkTracks(query.trim(), searchPrefix),
                    searchYouTubeChannels(query.trim(), source as 'youtube' | 'youtubemusic', 5)
                ]);

                const artists = channels.map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    imageUrl: channel.thumbnailUrl,
                    followers: channel.subscriberCount,
                    genres: [],
                    youtubeUrl: `https://www.youtube.com/channel/${channel.id}`
                }));

                let topResult = null;
                if (channels.length > 0 && channels[0].name.toLowerCase().includes(query.toLowerCase())) {
                    topResult = { type: 'artist' as const, data: artists[0], score: 1 };
                } else if (tracks.length > 0) {
                    topResult = { type: 'track' as const, data: tracks[0], score: 0.9 };
                }

                res.json({
                    query: query.trim(),
                    source,
                    tracks,
                    artists,
                    albums: [],
                    topResult,
                    fromCache: false
                });
            } else if (source === 'spotify-api') {
                // Spotify API Mode: Use Spotify Web API directly for tracks
                const { getSearchResult, setSearchResult } = await import('../../functions/cache/searchResultCache');
                
                // Check cache first (with spotify-api: prefix to differentiate from Lavalink results)
                const cacheKey = `spotify-api:${query.trim().toLowerCase()}`;
                const cached = getSearchResult(cacheKey);
                if (cached) {
                    console.log(`[SEARCH] 📦 Spotify API Cache HIT for "${query}"`);
                    return res.json({ ...cached, fromCache: true, source: 'spotify-api' });
                }
                
                console.log(`[SEARCH] 🔍 Spotify API Cache MISS, searching for "${query}"`);
                
                const { searchSpotify, searchSpotifyTracks } = await import('../../functions/spotify/spotifyClient');
                
                const [spotifyTracks, spotifyResults] = await Promise.all([
                    searchSpotifyTracks(query.trim(), 10),
                    searchSpotify(query.trim(), ['artist', 'album'], 5)
                ]);

                // Transform Spotify tracks to our format
                const tracks: SearchResultTrack[] = spotifyTracks.map(t => ({
                    id: t.id,
                    title: t.name,
                    artist: t.artists?.[0]?.name || 'Unknown',
                    artistId: t.artists?.[0]?.id,
                    album: t.album?.name,
                    albumId: (t as any).album?.id,
                    duration: t.duration_ms,
                    thumbnail: t.album?.images?.[0]?.url,
                    uri: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
                    spotifyUrl: t.external_urls?.spotify
                }));

                // Transform artists
                const artists = spotifyResults.artists.map(a => ({
                    id: a.id,
                    name: a.name,
                    imageUrl: a.images?.[0]?.url,
                    followers: a.followers?.total,
                    genres: a.genres,
                    spotifyUrl: a.external_urls?.spotify
                }));

                // Transform albums
                const albums = spotifyResults.albums.map(a => ({
                    id: a.id,
                    name: a.name,
                    artistName: a.artists?.[0]?.name || 'Unknown',
                    artistId: a.artists?.[0]?.id,
                    imageUrl: a.images?.[0]?.url,
                    releaseDate: a.release_date,
                    trackCount: a.total_tracks,
                    spotifyUrl: a.external_urls?.spotify
                }));

                // Determine top result (same logic as multiCategorySearch)
                let topResult = null;
                const queryLower = query.toLowerCase().trim();
                
                // Check for exact artist match
                const exactArtist = artists.find(a => a.name.toLowerCase() === queryLower);
                if (exactArtist) {
                    topResult = { type: 'artist' as const, data: exactArtist, score: 1.1 };
                } else if (tracks.length > 0) {
                    // Check for exact track match
                    const exactTrack = tracks.find(t => t.title.toLowerCase() === queryLower);
                    if (exactTrack) {
                        topResult = { type: 'track' as const, data: exactTrack, score: 1.1 };
                    } else {
                        topResult = { type: 'track' as const, data: tracks[0], score: 0.9 };
                    }
                } else if (artists.length > 0) {
                    topResult = { type: 'artist' as const, data: artists[0], score: 0.8 };
                }

                const result = {
                    query: cacheKey, // Use cacheKey as query so cache differentiates from Lavalink
                    tracks,
                    artists,
                    albums,
                    topResult
                };
                
                // Cache the result
                setSearchResult(result);
                console.log(`[SEARCH] ✅ Spotify API result cached for "${query}"`);;

                res.json({
                    ...result,
                    source: 'spotify-api',
                    fromCache: false
                });
            } else {
                const result = await multiCategorySearch(query.trim(), (q) => getLavalinkTracks(q, searchPrefix));
                res.json({ ...result, source: 'spotify' });
            }
        } catch (error) {
            console.error('[API] Search error:', error);
            res.status(500).json({ error: 'Search failed' });
        }
    });

    // Get artist info and top tracks
    router.get('/artist/:id', async (req: Request, res: Response) => {
        try {
            const artistId = req.params.id;

            if (!artistId) {
                return res.status(400).json({ error: 'Artist ID is required' });
            }

            const { getArtists, getArtistTopTracks, getArtistAlbums } = await import('../../functions/spotify/spotifyClient');
            const { getArtistDetail, setArtistDetail } = await import('../../functions/spotify/spotifyArtistCache');

            // Check cache first
            const cachedDetail = getArtistDetail(artistId);
            if (cachedDetail) {
                console.log(`[ARTIST CACHE] Cache HIT for artist: ${artistId}`);
                
                return res.json({
                    artist: {
                        id: cachedDetail.artistId,
                        name: cachedDetail.name,
                        imageUrl: cachedDetail.imageUrl,
                        followers: cachedDetail.followers,
                        genres: cachedDetail.genres,
                        spotifyUrl: cachedDetail.spotifyUrl
                    },
                    topTracks: cachedDetail.topTracks.map(t => ({
                        id: t.id,
                        name: t.name,
                        artists: [{ name: t.artistName }],
                        album: { 
                            name: t.albumName,
                            id: t.albumId,
                            images: t.imageUrl ? [{ url: t.imageUrl }] : []
                        },
                        duration_ms: t.duration,
                        external_urls: { spotify: `https://open.spotify.com/track/${t.id}` }
                    })),
                    albums: cachedDetail.albums.map(a => ({
                        id: a.id,
                        name: a.name,
                        images: a.imageUrl ? [{ url: a.imageUrl }] : [],
                        release_date: a.releaseDate,
                        total_tracks: a.totalTracks,
                        album_type: a.albumType,
                        external_urls: { spotify: `https://open.spotify.com/album/${a.id}` }
                    }))
                });
            }

            console.log(`[ARTIST CACHE] Cache MISS, fetching artist: ${artistId}`);

            const artistsMap = await getArtists([artistId]);
            const spotifyArtist = artistsMap.get(artistId);
            
            let artistData: any = null;
            
            if (spotifyArtist) {
                artistData = {
                    id: spotifyArtist.id,
                    name: spotifyArtist.name,
                    imageUrl: spotifyArtist.images?.[0]?.url,
                    followers: spotifyArtist.followers?.total,
                    genres: spotifyArtist.genres,
                    spotifyUrl: spotifyArtist.external_urls?.spotify
                };
            }

            const topTracks = await getArtistTopTracks(artistId);
            const albums = await getArtistAlbums(artistId);

            // Cache the result
            if (artistData) {
                setArtistDetail(artistId, {
                    artistId: artistData.id,
                    name: artistData.name,
                    imageUrl: artistData.imageUrl,
                    followers: artistData.followers,
                    genres: artistData.genres,
                    spotifyUrl: artistData.spotifyUrl,
                    topTracks: topTracks.map(t => ({
                        id: t.id,
                        name: t.name,
                        artistName: t.artists?.[0]?.name || 'Unknown',
                        albumName: t.album?.name,
                        albumId: (t.album as any)?.id,
                        imageUrl: t.album?.images?.[0]?.url,
                        duration: t.duration_ms,
                        uri: `spotify:track:${t.id}`
                    })),
                    albums: albums.map(a => ({
                        id: a.id,
                        name: a.name,
                        imageUrl: a.images?.[0]?.url,
                        releaseDate: a.release_date,
                        totalTracks: a.total_tracks,
                        albumType: (a as any).album_type
                    }))
                });
            }

            res.json({
                artist: artistData,
                topTracks: topTracks.map(t => ({
                    id: t.id,
                    name: t.name,
                    artists: t.artists,
                    album: t.album,
                    duration_ms: t.duration_ms,
                    external_urls: t.external_urls
                })),
                albums: albums.map(a => ({
                    id: a.id,
                    name: a.name,
                    images: a.images,
                    release_date: a.release_date,
                    total_tracks: a.total_tracks,
                    external_urls: a.external_urls
                }))
            });

        } catch (error) {
            console.error('[API] Artist info error:', error);
            res.status(500).json({ error: 'Failed to get artist info' });
        }
    });

    // Get YouTube channel info
    router.get('/youtube/channel/:id', async (req: Request, res: Response) => {
        try {
            const channelId = req.params.id;

            if (!channelId) {
                return res.status(400).json({ error: 'Channel ID is required' });
            }

            const { getYouTubeChannelInfo } = await import('../../functions/youtube/youtubeChannelSearch');
            const channelInfo = await getYouTubeChannelInfo(channelId);
            
            if (!channelInfo) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            // Get channel videos as "top tracks"
            const searchPrefix = 'ytsearch:';
            const tracks = await getLavalinkTracks(`${channelInfo.name} official`, searchPrefix);

            res.json({
                artist: {
                    id: channelInfo.id,
                    name: channelInfo.name,
                    imageUrl: channelInfo.thumbnailUrl,
                    followers: channelInfo.subscriberCount,
                    genres: [],
                    youtubeUrl: `https://www.youtube.com/channel/${channelInfo.id}`,
                    source: 'youtube'
                },
                topTracks: tracks.map(t => ({
                    id: t.id,
                    title: t.title,
                    artist: t.artist,
                    duration: t.duration,
                    thumbnail: t.thumbnail,
                    uri: t.uri
                }))
            });

        } catch (error) {
            console.error('[API] YouTube channel info error:', error);
            res.status(500).json({ error: 'Failed to get channel info' });
        }
    });

    // Get album info and tracks
    router.get('/album/:id', async (req: Request, res: Response) => {
        try {
            const albumId = req.params.id;

            if (!albumId) {
                return res.status(400).json({ error: 'Album ID is required' });
            }

            const { getAlbumTracks } = await import('../../functions/spotify/spotifyClient');

            const tracks = await getAlbumTracks(albumId);
            
            if (!tracks || tracks.length === 0) {
                return res.status(404).json({ error: 'Album not found' });
            }

            const firstTrack = tracks[0];
            const primaryArtist = firstTrack.artists[0];
            const albumInfo = {
                id: albumId,
                name: firstTrack.album.name,
                artist: primaryArtist?.name || 'Unknown Artist',
                artistId: primaryArtist?.id || null,
                releaseDate: firstTrack.album.release_date,
                images: firstTrack.album.images,
                external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
            };

            res.json({
                ...albumInfo,
                tracks: tracks.map(t => ({
                    id: t.id,
                    title: t.name,
                    artist: t.artists.map(a => a.name).join(', '),
                    artistId: t.artists[0]?.id || null,
                    duration: t.duration_ms,
                    uri: t.external_urls.spotify
                }))
            });

        } catch (error) {
            console.error('[API] Album info error:', error);
            res.status(500).json({ error: 'Failed to get album info' });
        }
    });

    return router;
}
