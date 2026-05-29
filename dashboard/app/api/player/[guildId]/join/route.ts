import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ guildId: string }> }
) {
    try {
        const { guildId } = await params;
        const body = await request.json();

        if (!guildId) {
            return NextResponse.json({ error: 'Guild ID is required' }, { status: 400 });
        }

        if (!body.channelId) {
            return NextResponse.json({ error: 'Channel ID is required' }, { status: 400 });
        }

        // Forward request to bot API
        const response = await fetch(`${BOT_API_URL}/api/guild/${guildId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channelId: body.channelId,
                user: body.user,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error joining voice channel:', error);
        return NextResponse.json(
            { error: 'Failed to join voice channel' },
            { status: 500 }
        );
    }
}
