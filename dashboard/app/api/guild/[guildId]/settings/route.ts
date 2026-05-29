import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

/**
 * Helper function to call bot API
 */
async function callBotAPI(endpoint: string, method: string = 'GET', body?: any) {
  const startTime = Date.now();
  const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const url = `${BOT_API_URL}/api${endpoint}`;
    console.log(`[${requestId}] [API Request] ${method} ${url}`);
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
      console.log(`[${requestId}] [API Request Body] ${JSON.stringify(body).substring(0, 200)}...`);
    }

    const response = await fetch(url, options);
    
    // Check if response is JSON (bot might return HTML error page if offline)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const duration = Date.now() - startTime;
      console.warn(`[${requestId}] [API Error] Bot returned non-JSON response (${duration}ms) - bot may be offline`);
      return { error: 'Bot appears to be offline', status: 503, offline: true };
    }
    
    const data = await response.json();
    const duration = Date.now() - startTime;

    console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms) - ${JSON.stringify(data).length} bytes`);

    if (!response.ok) {
      return { error: data.error || 'Bot API error', status: response.status };
    }

    return data;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.warn(`[${requestId}] [API Error] ${error.message} (${duration}ms) - bot may be offline`);
    return { error: 'Bot appears to be offline', status: 503, offline: true };
  }
}

/**
 * GET /api/guild/:guildId/settings
 * ดึงข้อมูล guild settings จาก bot
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const data = await callBotAPI(`/guild/${guildId}/settings`);
    
    if (data.error) {
      return NextResponse.json(data, { status: data.status || 404 });
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/guild/:guildId/settings
 * Update guild settings (music channel, etc)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const body = await request.json();
    const { musicChannelId, user } = body;

    const data = await callBotAPI(`/guild/${guildId}/settings`, 'POST', {
      musicChannelId,
      user
    });
    
    if (data.error) {
      return NextResponse.json(data, { status: data.status || 400 });
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
