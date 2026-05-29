import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

async function callBotAPI(endpoint: string, method: string = 'GET') {
  const startTime = Date.now();
  const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const url = `${BOT_API_URL}/api${endpoint}`;
  console.log(`[${requestId}] [API Request] ${method} ${url}`);
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  const duration = Date.now() - startTime;
  
  console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms) - ${JSON.stringify(data).length} bytes`);
  
  return { response, data };
}

// GET /api/player/:guildId/search?q=...
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || '';
    const userId = searchParams.get('userId') || '';

    if (!query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const { response, data } = await callBotAPI(`/guild/${guildId}/search?q=${encodeURIComponent(query)}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`);

    if (!response.ok) {
      return NextResponse.json({ error: data.error || 'Bot API error' }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Dashboard API] Search error:', error.message);
    return NextResponse.json({ error: 'Failed to search tracks' }, { status: 500 });
  }
}
