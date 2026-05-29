import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// YouTube video ID extraction
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Check if YouTube video is music content using YouTube Data API v3
async function checkYouTubeMusicContent(videoIds: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || videoIds.length === 0) {
    return results;
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,topicDetails&id=${videoIds.join(',')}&key=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('[YouTube API] Failed:', response.status);
      return results;
    }
    
    const data = await response.json();
    
    for (const item of data.items || []) {
      const videoId = item.id;
      const snippet = item.snippet || {};
      const topicDetails = item.topicDetails || {};
      
      // Check 1: Category ID 10 = Music
      const isCategory10 = snippet.categoryId === '10';
      
      // Check 2: Topic categories contain music
      const topicCategories = topicDetails.topicCategories || [];
      const hasMusicTopic = topicCategories.some((t: string) => 
        t.toLowerCase().includes('/music') || t.toLowerCase().includes('music')
      );
      
      // Check 3: "- Topic" channel (auto-generated music channels)
      const isTopicChannel = snippet.channelTitle?.includes('- Topic') || false;
      
      // Check 4: "Provided to YouTube by" in description (music distributors)
      const hasDistributor = snippet.description?.includes('Provided to YouTube by') || false;
      
      const isMusic = isCategory10 || hasMusicTopic || isTopicChannel || hasDistributor;
      results.set(videoId, isMusic);
    }
  } catch (error) {
    console.error('[YouTube API] Error:', error);
  }
  
  return results;
}

// GET /api/player/:guildId/top-played?userId=xxx
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const tracksRef = adminDb
      .collection('playHistory')
      .doc(guildId)
      .collection('userHistory')
      .doc(userId)
      .collection('tracks');

    const snapshot = await tracksRef.orderBy('playCount', 'desc').limit(30).get();

    // First pass: collect data and identify YouTube tracks needing API check
    const rawTracks: Array<{
      doc: FirebaseFirestore.QueryDocumentSnapshot;
      data: Record<string, any>;
      source: string;
      url: string;
      videoId: string | null;
      needsApiCheck: boolean;
    }> = [];
    
    const videoIdsToCheck: string[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, any>;
      const source = data.source || 'unknown';
      const url = data.url || '';
      const videoId = source === 'youtube' ? extractYouTubeVideoId(url) : null;
      
      // Need API check if: YouTube, no isMusic stored, and has video ID
      const needsApiCheck = source === 'youtube' && data.isMusic === undefined && videoId !== null;
      
      if (needsApiCheck && videoId) {
        videoIdsToCheck.push(videoId);
      }
      
      rawTracks.push({ doc, data, source, url, videoId, needsApiCheck });
    }

    // Batch check YouTube videos
    const musicResults = await checkYouTubeMusicContent(videoIdsToCheck);

    // Second pass: build response with correct isMusic values
    const tracks = rawTracks.map(({ doc, data, source, url, videoId, needsApiCheck }) => {
      let isMusic = data.isMusic;
      let isVideo = data.isVideo;
      
      if (isMusic === undefined) {
        if (source === 'spotify') {
          isMusic = true;
          isVideo = false;
        } else if (source === 'youtube') {
          // Check API result first, then fallback to URL check
          if (needsApiCheck && videoId && musicResults.has(videoId)) {
            isMusic = musicResults.get(videoId)!;
            isVideo = !isMusic;
            
            // Update Firestore in background (don't await)
            doc.ref.update({ isMusic, isVideo }).catch(() => {});
          } else {
            isMusic = url.includes('music.youtube.com');
            isVideo = !isMusic;
          }
        } else {
          isMusic = false;
          isVideo = false;
        }
      }
      
      return {
        id: doc.id,
        title: data.title || '',
        artist: data.artist || '',
        duration: data.duration || 0,
        url,
        thumbnail: data.thumbnail || '',
        playCount: data.playCount || 0,
        totalPlayTime: data.totalPlayTime || 0,
        lastPlayedAt: data.lastPlayedAt?.toDate?.() ? data.lastPlayedAt.toDate().toISOString() : null,
        source,
        isMusic,
        isVideo,
        isAudioOnly: isMusic,
      };
    });

    return NextResponse.json({ tracks });
  } catch (error: any) {
    console.error('[Dashboard API] top-played error:', error);
    return NextResponse.json({ error: 'Failed to load top played tracks' }, { status: 500 });
  }
}
