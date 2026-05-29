import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

/**
 * GET /api/guild/:guildId/voice-channels
 * Proxy to bot API to get voice channels with members
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    
    const url = `${BOT_API_URL}/api/guild/${guildId}/voice-channels`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to get voice channels' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error getting voice channels:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get voice channels' },
      { status: 500 }
    );
  }
}
