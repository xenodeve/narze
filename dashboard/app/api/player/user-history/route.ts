import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// GET /api/player/user-history?userId=xxx
// Proxy to Bot API which handles Caching & Firebase
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const url = `${BOT_API_URL}/api/user/${userId}/history`;
    
    // Call Bot API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
        // If Bot API fails (e.g. down), we could fallback to direct Firebase here 
        // OR just return empty/error to keep architecture clean.
        // For now, let's return error so we know Bot is issue.
      return NextResponse.json(
        { error: 'Failed to fetch history from Bot', tracks: [] },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Dashboard API] user-history error:', error);
    return NextResponse.json({ error: 'Failed to load user history', tracks: [] }, { status: 500 });
  }
}
