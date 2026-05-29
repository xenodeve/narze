import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q');
        const source = searchParams.get('source') || 'spotify';

        if (!query || query.trim().length === 0) {
            return NextResponse.json(
                { error: 'Query parameter "q" is required' },
                { status: 400 }
            );
        }

        // Forward request to bot API with source parameter
        const response = await fetch(
            `${BOT_API_URL}/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                // Short timeout for search
                signal: AbortSignal.timeout(10000),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData.error || 'Search failed' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[Dashboard API] Search error:', error);
        
        if (error instanceof Error && error.name === 'TimeoutError') {
            return NextResponse.json(
                { error: 'Search timeout' },
                { status: 504 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
