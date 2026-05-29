/**
 * Search Service
 * Unified search combining Lavalink (tracks) + Spotify API (artists/albums) + Caching
 * Uses Fuzzy Match for Top Result selection
 */

import chalk from 'chalk';
import * as stringSimilarity from 'string-similarity';
import { searchSpotify, SpotifyArtist, SpotifyAlbum } from '../spotify/spotifyClient';
import { 
    getSearchResult, 
    setSearchResult, 
    SearchResult, 
    SearchResultTrack, 
    SearchResultArtist, 
    SearchResultAlbum 
} from '../cache/searchResultCache';
import { 
    getArtistInfo, 
    setArtistInfoBatch, 
    getMissingArtistIds,
    CachedArtistInfo 
} from '../spotify/spotifyArtistCache';
import { getAlbumInfo, getMissingTrackIds } from '../spotify/spotifyAlbumCache';

// ================= Types =================

export interface MultiCategorySearchResult {
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

// ================= Fuzzy Match =================

function findTopResult(
    query: string,
    tracks: SearchResultTrack[],
    artists: SearchResultArtist[],
    albums: SearchResultAlbum[]
): MultiCategorySearchResult['topResult'] {
    // If we have tracks from Lavalink, prioritize them for Top Result
    // This ensures consistency with the search popup which uses Lavalink only
    
    const candidates: { type: 'track' | 'artist' | 'album'; name: string; data: any }[] = [];

    // Add tracks first (prioritize Lavalink results)
    tracks.forEach(t => {
        candidates.push({ type: 'track', name: t.title, data: t });
        candidates.push({ type: 'track', name: `${t.title} ${t.artist}`, data: t });
    });
    
    // Add artists 
    artists.forEach(a => candidates.push({ type: 'artist', name: a.name, data: a }));
    
    // Add albums
    albums.forEach(a => candidates.push({ type: 'album', name: a.name, data: a }));

    if (candidates.length === 0) return undefined;

    // 1. Check for EXACT matches (100% case-insensitive)
    // This solves the issue where "Side A" (containing "blackbeans") beats "Blackbeans" (Artist)
    const queryLower = query.toLowerCase().trim();
    const exactMatches = candidates.filter(c => c.name.toLowerCase().trim() === queryLower);

    if (exactMatches.length > 0) {
        // If multiple exact matches, prioritize Track > Artist > Album (or as preferred)
        // Usually if Song name is exact match, we show Song. If not, show Artist.
        
        const typePriority: Record<string, number> = { track: 10, artist: 2, album: 1 };
        exactMatches.sort((a, b) => typePriority[b.type] - typePriority[a.type]);
        
        const winner = exactMatches[0];
        return { type: winner.type, data: winner.data, score: 1.1 }; // Score > 1 to indicate exact match
    }

    // 2. Find best match using fuzzy similarity (for non-exact matches)
    const names = candidates.map(c => c.name.toLowerCase());
    const matches = stringSimilarity.findBestMatch(queryLower, names);

    // Get all candidates within a close range of the best score
    const bestScore = matches.bestMatch.rating;
    const tiedCandidates = matches.ratings
        .map((rating, index) => ({ ...candidates[index], score: rating.rating }))
        .filter(c => Math.abs(c.score - bestScore) < 0.1); // Within 10% of best score

    if (tiedCandidates.length === 0) return undefined;

    // Sort by priority: Track > Artist > Album (tracks get higher priority for fuzzy matches too)
    const typePriority: Record<string, number> = { track: 10, artist: 2, album: 1 };
    
    tiedCandidates.sort((a, b) => {
        // Use score as secondary sort if needed, but primary is type
        // Actually for tied candidates, just prioritize type
        return typePriority[b.type] - typePriority[a.type];
    });

    const valWinner = tiedCandidates[0];

    // Lower threshold - we want to show something
    const minScore = valWinner.type === 'artist' ? 0.6 : 0.2;

    if (valWinner.score < minScore) {
        // Default to first track if no good match
        if (tracks.length > 0) {
            return { type: 'track', data: tracks[0], score: 0 };
        }
        return undefined;
    }

    return {
        type: valWinner.type,
        data: valWinner.data,
        score: valWinner.score
    };
}

// ================= Main Search Function =================

/**
 * Perform multi-category search
 * 1. Check cache
 * 2. Get tracks from Lavalink (via provided function)
 * 3. Get artists/albums from Spotify API
 * 4. Determine top result with fuzzy match
 * 5. Cache and return
 */
export async function multiCategorySearch(
    query: string,
    getLavalinkTracks: (query: string) => Promise<SearchResultTrack[]>
): Promise<MultiCategorySearchResult> {
    // 1. Check cache first
    const cached = getSearchResult(query);
    if (cached) {
        console.log(`[${chalk.bold.yellow('SEARCH')}] 📦 Cache HIT for "${query}"`);
        return {
            ...cached,
            fromCache: true
        };
    }

    console.log(`[${chalk.bold.yellow('SEARCH')}] 🔍 Cache MISS, searching for "${query}"`);

    // 2. Parallel fetch: Lavalink tracks + Spotify artists/albums
    const [lavalinkTracks, spotifyResults] = await Promise.all([
        getLavalinkTracks(query),
        searchSpotify(query, ['artist', 'album'], 5)
    ]);

    // DEBUG: Log Lavalink track names
    console.log(`[${chalk.bold.cyan('LAVALINK')}] 🎵 Tracks for "${query}":`);
    lavalinkTracks.forEach((t, i) => {
        console.log(`   ${i + 1}. "${t.title}" by ${t.artist} [${t.uri}]`);
    });

    // 3. Transform Spotify results
    const artists: SearchResultArtist[] = spotifyResults.artists.map((a: SpotifyArtist) => ({
        id: a.id,
        name: a.name,
        imageUrl: a.images?.[0]?.url,
        followers: a.followers?.total,
        genres: a.genres,
        spotifyUrl: a.external_urls?.spotify
    }));

    const albums: SearchResultAlbum[] = spotifyResults.albums.map((a: SpotifyAlbum) => ({
        id: a.id,
        name: a.name,
        artistName: a.artists?.[0]?.name || 'Unknown',
        artistId: a.artists?.[0]?.id,
        imageUrl: a.images?.[0]?.url,
        releaseDate: a.release_date,
        trackCount: a.total_tracks,
        spotifyUrl: a.external_urls?.spotify
    }));

    // 4. Cache artist info for future use
    if (artists.length > 0) {
        const artistEntries = new Map<string, Omit<CachedArtistInfo, 'cachedAt'>>();
        artists.forEach(a => {
            artistEntries.set(a.id, {
                name: a.name,
                imageUrl: a.imageUrl,
                followers: a.followers,
                genres: a.genres,
                spotifyUrl: a.spotifyUrl
            });
        });
        setArtistInfoBatch(artistEntries);
    }

    // 5. Determine top result with fuzzy match
    const topResult = findTopResult(query, lavalinkTracks, artists, albums);

    // 6. Build result
    const result: MultiCategorySearchResult = {
        query,
        topResult,
        tracks: lavalinkTracks,
        artists,
        albums,
        fromCache: false
    };

    // 7. Cache result (only if we have tracks - don't cache empty track results)
    if (lavalinkTracks.length > 0) {
        setSearchResult({
            query,
            topResult,
            tracks: lavalinkTracks,
            artists,
            albums
        });
    } else {
        console.log(`[${chalk.bold.yellow('SEARCH')}] ⚠️ Not caching result with 0 tracks (will retry next time)`);
    }

    console.log(`[${chalk.bold.yellow('SEARCH')}] ✅ Found ${lavalinkTracks.length} tracks, ${artists.length} artists, ${albums.length} albums`);
    if (topResult) {
        console.log(`[${chalk.bold.yellow('SEARCH')}] 🎯 Top Result: ${topResult.type} - "${(topResult.data as any).name || (topResult.data as any).title}" (score: ${topResult.score.toFixed(2)})`);
    }

    return result;
}
