import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: channelId } = await params;

        if (!channelId) {
            return NextResponse.json(
                { error: 'Channel ID is required' },
                { status: 400 }
            );
        }

        // Forward request to bot API
        const response = await fetch(`${BOT_API_URL}/api/youtube/channel/${channelId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData.error || 'Failed to fetch channel' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[Dashboard API] YouTube channel fetch error:', error);
        
        if (error instanceof Error && error.name === 'TimeoutError') {
            return NextResponse.json(
                { error: 'Request timeout' },
                { status: 504 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
