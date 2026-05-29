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
      return { error: data.error || 'Bot API error', reason: data.reason, status: response.status };
    }

    return data;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.warn(`[${requestId}] [API Error] ${error.message} (${duration}ms) - bot may be offline`);
    return { error: 'Bot appears to be offline', status: 503, offline: true };
  }
}

/**
 * POST /api/guild/:guildId/can-control
 * Check if user can control the bot in this guild
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const body = await request.json();
    const { user } = body;

    if (!user?.discordId) {
      return NextResponse.json({ 
        canView: false,
        canControl: false, 
        reason: 'User not authenticated' 
      }, { status: 400 });
    }

    const data = await callBotAPI(`/guild/${guildId}/can-control`, 'POST', { user });
    
    if (data.error) {
      return NextResponse.json({
        canView: false,
        canControl: false,
        reason: data.reason || data.error
      }, { status: data.status || 403 });
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ 
      canView: false,
      canControl: false, 
      reason: error.message 
    }, { status: 500 });
  }
}
