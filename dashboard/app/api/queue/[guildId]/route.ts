import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

/**
 * Helper function to call bot API
 */
async function callBotAPI(endpoint: string, method: string = 'GET', body?: any) {
  try {
    const url = `${BOT_API_URL}/api${endpoint}`;
    console.log(`[Dashboard Queue API] Calling bot: ${method} ${url}`);
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
      console.log(`[Dashboard Queue API] Body:`, body);
    }

    const response = await fetch(url, options);
    
    // Check if response is JSON (bot might return HTML error page if offline)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`[Dashboard Queue API] Bot returned non-JSON response - bot may be offline`);
      return { error: 'Bot appears to be offline', offline: true };
    }
    
    const data = await response.json();

    console.log(`[Dashboard Queue API] Response status: ${response.status}`);
    console.log(`[Dashboard Queue API] Response:`, data);

    if (!response.ok) {
      return { error: data.error || 'Bot API error' };
    }

    return data;
  } catch (error: any) {
    console.warn(`[Dashboard Queue API] Error: ${error.message} - bot may be offline`);
    return { error: 'Bot appears to be offline', offline: true };
  }
}

/**
 * GET /api/queue/:guildId
 * ดึง queue จาก bot
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const data = await callBotAPI(`/queue/${guildId}`);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/queue/:guildId
 * ลบเพลงจากคิว หรือ ล้างคิว
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const body = await request.json();
    const action = body.action;
    
    // Extract user info for logging
    const userInfo = body.user ? { user: body.user } : {};

    let response;
    switch (action) {
      case 'clear':
        response = await callBotAPI(`/guild/${guildId}/queue/clear`, 'POST', userInfo);
        break;
      case 'remove':
        response = await callBotAPI(`/guild/${guildId}/queue/${body.trackId}`, 'DELETE', userInfo);
        break;
      case 'move':
        response = await callBotAPI(`/guild/${guildId}/queue/move`, 'POST', { from: body.from, to: body.to, ...userInfo });
        break;
      case 'shuffle':
        response = await callBotAPI(`/guild/${guildId}/queue/shuffle`, 'POST', userInfo);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/queue/:guildId/:trackId
 * ลบเพลงจากคิว
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; trackId: string }> }
) {
  try {
    const { guildId, trackId } = await params;
    const data = await callBotAPI(`/guild/${guildId}/queue/${trackId}`, 'DELETE');
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
