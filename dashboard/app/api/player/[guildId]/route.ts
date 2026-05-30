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
      // Forward the error response from bot API including status and json body
      return { 
        error: data.error || 'Bot API error', 
        status: response.status,
        ...data // Include other fields like requiresVoiceChannel, canSelectChannel
      };
    }

    return data;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    // Use warn instead of error to prevent console spam
    console.warn(`[${requestId}] [API Error] ${error.message} (${duration}ms) - bot may be offline`);
    // Return user-friendly error
    return { error: 'Bot appears to be offline', status: 503, offline: true };
  }
}

/**
 * GET /api/player/:guildId
 * ดึงข้อมูล player จาก bot
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const data = await callBotAPI(`/current-track/${guildId}`);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/player/:guildId
 * Control player (pause, resume, skip, volume, seek)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const body = await request.json();
    const { action, value, user } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    // Extract user info for logging
    const userInfo = user ? { username: user.username, discordId: user.discordId, avatar: user.avatar || undefined } : undefined;

    let endpoint = '';
    let postBody: any = userInfo ? { user: userInfo } : undefined;

    switch (action) {
      case 'pause':
        endpoint = `/guild/${guildId}/pause`;
        break;
      case 'resume':
        endpoint = `/guild/${guildId}/resume`;
        break;
      case 'skip':
        endpoint = `/guild/${guildId}/skip`;
        break;
      case 'previous':
        endpoint = `/guild/${guildId}/previous`;
        break;
      case 'volume':
        endpoint = `/guild/${guildId}/volume`;
        postBody = { volume: value, ...userInfo && { user: userInfo } };
        break;
      case 'seek':
        endpoint = `/guild/${guildId}/seek`;
        postBody = { position: value, ...userInfo && { user: userInfo } };
        break;
      case 'play':
        endpoint = `/guild/${guildId}/play`;
        postBody = { 
          query: value,
          defaultVolume: Number(process.env.NEXT_PUBLIC_VOLUMEDEFAULT) || 15, // Default volume from env
          ...userInfo && { user: userInfo },
          ...(body.targetVoiceChannelId && { targetVoiceChannelId: body.targetVoiceChannelId })
        };
        break;
      case 'loop':
        endpoint = `/guild/${guildId}/loop`;
        postBody = value ? { mode: value, ...userInfo && { user: userInfo } } : userInfo ? { user: userInfo } : undefined;
        break;
      case 'shuffle':
        endpoint = `/guild/${guildId}/queue/shuffle`;
        break;
      case 'skipto':
        endpoint = `/guild/${guildId}/skipto`;
        postBody = { index: body.index, ...userInfo && { user: userInfo } };
        break;
      case 'playnow':
        endpoint = `/guild/${guildId}/playnow`;
        postBody = { index: body.index, ...userInfo && { user: userInfo } };
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const response = await callBotAPI(endpoint, 'POST', postBody);
    
    // Check if response contains an error status
    if (response.status && response.status >= 400) {
      return NextResponse.json(response, { status: response.status });
    }
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Player API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
