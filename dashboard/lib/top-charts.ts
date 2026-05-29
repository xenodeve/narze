/**
 * Top Charts API - Fetches from Bot API (Billboard + Spotify)
 * Falls back to hardcoded list if API fails
 */

export type ChartTrack = {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration: number;
  url: string;
  position?: number;
  source?: 'billboard' | 'spotify' | 'fallback';
};

export type BillboardTrack = {
  rank: string;
  title: string;
  artist: string;
  image: string;
  thumbnail?: string; // Spotify track thumbnail
  artistImage?: string; // Spotify artist image
  url?: string; // Spotify track URL
  source?: string; // Platform source (spotify, youtube, etc.)
  weeksAtNo1?: string;
  lastWeek: string;
  peakPosition: string;
  weeksOnChart: string;
  detail: 'up' | 'down' | 'same';
};

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// Fallback tracks if API fails (using Spotify URLs)
const FALLBACK_TRACKS: ChartTrack[] = [
  {
    id: 'th-1',
    title: 'APT.',
    artist: 'ROSÉ & Bruno Mars',
    thumbnail: 'https://i.scdn.co/image/ab67616d0000b273a9e5c5f0d08c1f24d75c0a55',
    duration: 169000,
    url: 'https://open.spotify.com/track/5vNRhkKd0yEAg8suGBpjeY',
  },
  {
    id: 'th-2',
    title: 'Die With A Smile',
    artist: 'Lady Gaga & Bruno Mars',
    thumbnail: 'https://i.scdn.co/image/ab67616d0000b2738d68cb60e52e8f39c6b9bfb1',
    duration: 251000,
    url: 'https://open.spotify.com/track/2plbrEY59IikOBgBGLjaoe',
  },
  {
    id: 'th-3',
    title: 'Whiplash',
    artist: 'aespa',
    thumbnail: 'https://i.scdn.co/image/ab67616d0000b273ba20803e0c8cef452f2d9a87',
    duration: 192000,
    url: 'https://open.spotify.com/track/74X1epeRufHckhuX0g9v5g',
  },
  {
    id: 'th-4',
    title: 'number one girl',
    artist: 'ROSÉ',
    thumbnail: 'https://i.scdn.co/image/ab67616d0000b273a9e5c5f0d08c1f24d75c0a55',
    duration: 207000,
    url: 'https://open.spotify.com/track/7jMjGIltyFoVqOlW2XljEh',
  },
];

/**
 * Fetch top charts from Spotify via Bot API
 * @param region - 'thailand' or 'global'
 * @param limit - Number of tracks to return (max 50)
 */
export async function fetchTopCharts(
  region: 'thailand' | 'global' = 'thailand',
  limit: number = 10
): Promise<{ tracks: ChartTrack[]; cached: boolean; playlistName?: string }> {
  try {
    const startTime = Date.now();
    const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
    const url = `${BOT_API_URL}/api/top-charts/${region}?limit=${limit}`;
    console.log(`[${requestId}] [API Request] GET ${url}`);
    
    const response = await fetch(url);
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms)`);
    
    // Check if response is JSON (bot might return HTML error page if offline)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`[${requestId}] Bot returned non-JSON response - bot may be offline`);
      return {
        tracks: FALLBACK_TRACKS.slice(0, limit),
        cached: false,
        playlistName: 'Top Hits (Offline)',
      };
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch top charts');
    }

    const data = await response.json();
    return {
      tracks: data.tracks || [],
      cached: data.cached || false,
      playlistName: data.playlistName,
    };
  } catch (error) {
    console.warn('[Top Charts] Failed to fetch (bot may be offline):', error);
    // Return fallback on error
    return {
      tracks: FALLBACK_TRACKS.slice(0, limit),
      cached: false,
      playlistName: 'Top Hits (Offline)',
    };
  }
}

/**
 * Get top charts synchronously (uses fallback data)
 * @deprecated Use fetchTopCharts() for real Spotify data
 */
export function getTopCharts(): ChartTrack[] {
  return FALLBACK_TRACKS;
}

/**
 * Fetch Billboard Radio Songs chart (cached, updates every 3 days)
 */
export async function fetchBillboardChart(): Promise<{
  tracks: BillboardTrack[];
  lastUpdated: string;
  date: string;
  chart: string;
} | null> {
  try {
    const startTime = Date.now();
    const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
    const url = `${BOT_API_URL}/api/charts/billboard`;
    console.log(`[${requestId}] [API Request] GET ${url}`);
    
    const response = await fetch(url);
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms)`);
    
    // Check if response is JSON (bot might return HTML error page if offline)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`[${requestId}] Bot returned non-JSON response - bot may be offline`);
      return null;
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch Billboard chart');
    }

    const data = await response.json();
    return {
      tracks: data.tracks || [],
      lastUpdated: data.lastUpdated,
      date: data.date,
      chart: data.chart,
    };
  } catch (error) {
    console.warn('[Billboard] Failed to fetch (bot may be offline):', error);
    return null;
  }
}

/**
 * Convert Billboard tracks to ChartTrack format for player
 */
export function billboardToChartTracks(billboardTracks: BillboardTrack[]): ChartTrack[] {
  return billboardTracks.map((track, index) => ({
    id: `billboard-${track.rank}`,
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail || track.image, // Use Spotify thumbnail if available, fallback to Billboard image
    duration: 0, // Billboard doesn't provide duration
    url: track.url || '', // Use Spotify URL if available
    position: parseInt(track.rank),
    source: (track.source || 'billboard') as any,
  }));
}
