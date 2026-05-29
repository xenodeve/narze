import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ guildId: string }> }
) {
    try {
        const { guildId } = await params;

        if (!guildId) {
            return NextResponse.json({ error: 'Guild ID is required' }, { status: 400 });
        }

        // Forward request to bot API
        const response = await fetch(`${BOT_API_URL}/api/guild/${guildId}/player/status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (!response.ok) {
            // If no player found, return hasPlayer: false instead of error
            if (response.status === 404) {
                return NextResponse.json({ hasPlayer: false });
            }
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching player status:', error);
        // On error, assume no player
        return NextResponse.json({ hasPlayer: false });
    }
}
