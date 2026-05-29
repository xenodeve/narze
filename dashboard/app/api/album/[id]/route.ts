import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params; // Next.js 15+ requires awaiting params

        if (!id) {
            return NextResponse.json(
                { error: 'Album ID is required' },
                { status: 400 }
            );
        }

        // Forward request to bot API
        // Note: Using a short timeout since bot API does fetching
        // But for mock data it will be instant
        const response = await fetch(`${BOT_API_URL}/api/album/${id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(15000), // 15s timeout for album fetch
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData.error || 'Failed to fetch album' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[Dashboard API] Album fetch error:', error);
        
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
