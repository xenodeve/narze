import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// GET /api/player/:guildId/server-history
// Proxy to Bot API which handles Caching & Firebase
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;

    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
    }

    const url = `${BOT_API_URL}/api/guild/${guildId}/history`;
    
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
      return NextResponse.json(
        { error: 'Failed to fetch server history from Bot', tracks: [] },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Dashboard API] server-history error:', error);
    return NextResponse.json({ error: 'Failed to load server history', tracks: [] }, { status: 500 });
  }
}
