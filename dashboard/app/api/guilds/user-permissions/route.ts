import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, guildIds } = body;

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        if (!guildIds || !Array.isArray(guildIds)) {
            return NextResponse.json({ error: 'guildIds array is required' }, { status: 400 });
        }

        // Forward request to bot API
        const response = await fetch(`${BOT_API_URL}/api/guilds/user-permissions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId, guildIds }),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching user permissions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user permissions' },
            { status: 500 }
        );
    }
}
