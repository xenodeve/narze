/**
 * YouTube Channel Search
 * Searches for YouTube channels (artists) using YouTube Data API v3
 * Integrates with cache to minimize API quota usage
 */

import chalk from 'chalk';
import { 
    getCachedSearch, 
    setCachedSearch, 
    CachedYouTubeChannel 
} from './youtubeSearchCache';

// ================= Types =================
export interface YouTubeChannelResult {
    id: string;
    name: string;
    description?: string;
    thumbnailUrl?: string;
    subscriberCount?: number;
    videoCount?: number;
    customUrl?: string;
}

interface YouTubeSearchResponse {
    items?: {
        id: { channelId: string };
        snippet: {
            channelId: string;
            title: string;
            description: string;
            thumbnails: {
                default?: { url: string };
                medium?: { url: string };
                high?: { url: string };
            };
            customUrl?: string;
        };
    }[];
    pageInfo?: {
        totalResults: number;
        resultsPerPage: number;
    };
}

interface YouTubeChannelDetailsResponse {
    items?: {
        id: string;
        snippet: {
            title: string;
            description: string;
            customUrl?: string;
            thumbnails: {
                default?: { url: string };
                medium?: { url: string };
                high?: { url: string };
            };
        };
        statistics: {
            subscriberCount?: string;
            videoCount?: string;
            viewCount?: string;
            hiddenSubscriberCount?: boolean;
        };
    }[];
}

// ================= API Functions =================

/**
 * Search for YouTube channels (artists) by query
 * Uses cache first, then calls YouTube API if needed
 */
export async function searchYouTubeChannels(
    query: string,
    source: 'youtube' | 'youtubemusic' = 'youtube',
    maxResults: number = 5
): Promise<YouTubeChannelResult[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey) {
        console.log(`[${chalk.bold.red('YOUTUBE')}] ⚠️ No YOUTUBE_API_KEY set, skipping channel search`);
        return [];
    }

    // Check cache first
    const cached = getCachedSearch(query, source);
    if (cached) {
        return cached.channels;
    }

    console.log(`[${chalk.bold.red('YOUTUBE')}] 🔍 Searching channels for: "${query}" (${source})`);

    try {
        // For YouTube Music, we add "music" to query to get music-related channels
        const searchQuery = source === 'youtubemusic' 
            ? `${query} official artist`
            : query;

        // Step 1: Search for channels
        const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
        searchUrl.searchParams.set('part', 'snippet');
        searchUrl.searchParams.set('type', 'channel');
        searchUrl.searchParams.set('q', searchQuery);
        searchUrl.searchParams.set('maxResults', String(maxResults));
        searchUrl.searchParams.set('key', apiKey);

        const searchResponse = await fetch(searchUrl.toString());
        
        if (!searchResponse.ok) {
            const error = await searchResponse.json();
            console.error(`[${chalk.bold.red('YOUTUBE')}] ❌ Search API error:`, error);
            return [];
        }

        const searchData: YouTubeSearchResponse = await searchResponse.json();
        
        if (!searchData.items || searchData.items.length === 0) {
            console.log(`[${chalk.bold.red('YOUTUBE')}] No channels found for "${query}"`);
            setCachedSearch(query, source, []);
            return [];
        }

        // Step 2: Get channel details (for subscriber count) - 1 quota unit
        const channelIds = searchData.items.map(item => item.id.channelId).join(',');
        const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
        detailsUrl.searchParams.set('part', 'snippet,statistics');
        detailsUrl.searchParams.set('id', channelIds);
        detailsUrl.searchParams.set('key', apiKey);

        const detailsResponse = await fetch(detailsUrl.toString());
        
        let channelDetails: YouTubeChannelDetailsResponse = { items: [] };
        if (detailsResponse.ok) {
            channelDetails = await detailsResponse.json();
        }

        // Map results
        const channels: YouTubeChannelResult[] = searchData.items.map(item => {
            const details = channelDetails.items?.find(d => d.id === item.id.channelId);
            
            return {
                id: item.id.channelId,
                name: item.snippet.title,
                description: item.snippet.description?.slice(0, 200),
                thumbnailUrl: item.snippet.thumbnails?.high?.url || 
                              item.snippet.thumbnails?.medium?.url || 
                              item.snippet.thumbnails?.default?.url,
                subscriberCount: details?.statistics?.hiddenSubscriberCount 
                    ? undefined 
                    : parseInt(details?.statistics?.subscriberCount || '0', 10),
                videoCount: parseInt(details?.statistics?.videoCount || '0', 10),
                customUrl: details?.snippet?.customUrl || item.snippet.customUrl
            };
        });

        // Cache results
        setCachedSearch(query, source, channels);

        console.log(`[${chalk.bold.red('YOUTUBE')}] ✅ Found ${channels.length} channels for "${query}"`);
        return channels;

    } catch (error) {
        console.error(`[${chalk.bold.red('YOUTUBE')}] ❌ Channel search error:`, error);
        return [];
    }
}

/**
 * Get detailed info for a specific channel
 */
export async function getYouTubeChannelInfo(channelId: string): Promise<YouTubeChannelResult | null> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey) {
        console.log(`[${chalk.bold.red('YOUTUBE')}] ⚠️ No YOUTUBE_API_KEY set`);
        return null;
    }

    try {
        const url = new URL('https://www.googleapis.com/youtube/v3/channels');
        url.searchParams.set('part', 'snippet,statistics,brandingSettings');
        url.searchParams.set('id', channelId);
        url.searchParams.set('key', apiKey);

        const response = await fetch(url.toString());
        
        if (!response.ok) {
            console.error(`[${chalk.bold.red('YOUTUBE')}] ❌ Channel info API error`);
            return null;
        }

        const data: YouTubeChannelDetailsResponse = await response.json();
        
        if (!data.items || data.items.length === 0) {
            return null;
        }

        const channel = data.items[0];
        
        return {
            id: channel.id,
            name: channel.snippet.title,
            description: channel.snippet.description,
            thumbnailUrl: channel.snippet.thumbnails?.high?.url || 
                          channel.snippet.thumbnails?.medium?.url,
            subscriberCount: channel.statistics?.hiddenSubscriberCount 
                ? undefined 
                : parseInt(channel.statistics?.subscriberCount || '0', 10),
            videoCount: parseInt(channel.statistics?.videoCount || '0', 10),
            customUrl: channel.snippet.customUrl
        };

    } catch (error) {
        console.error(`[${chalk.bold.red('YOUTUBE')}] ❌ Channel info error:`, error);
        return null;
    }
}

/**
 * Format subscriber count for display
 */
export function formatSubscriberCount(count?: number): string {
    if (!count) return '';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M subscribers`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K subscribers`;
    return `${count} subscribers`;
}
