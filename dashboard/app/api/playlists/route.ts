import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const PLAYLISTS_COLLECTION = 'playlists';

// GET - List all playlists for a user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        const snapshot = await adminDb
            .collection(PLAYLISTS_COLLECTION)
            .where('userId', '==', userId)
            .get();

        const playlists = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
        }));

        // Sort by createdAt descending (in-memory to avoid needing composite index)
        playlists.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });

        return NextResponse.json({ playlists });
    } catch (error: any) {
        console.error('[API] Error fetching playlists:', error);
        return NextResponse.json({ error: 'Failed to fetch playlists', message: error.message }, { status: 500 });
    }
}

// POST - Create a new playlist
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, name, description, thumbnail, tracks, sourcePlatform, sourceUrl } = body;

        if (!userId || !name) {
            return NextResponse.json({ error: 'userId and name are required' }, { status: 400 });
        }

        const playlistRef = adminDb.collection(PLAYLISTS_COLLECTION).doc();
        const now = new Date();

        const playlist = {
            id: playlistRef.id,
            userId,
            name,
            description: description || '',
            thumbnail: thumbnail || tracks?.[0]?.thumbnail || '',
            trackCount: tracks?.length || 0,
            tracks: tracks || [],
            sourcePlatform: sourcePlatform || null,
            sourceUrl: sourceUrl || null,
            createdAt: now,
            updatedAt: now,
        };

        await playlistRef.set(playlist);

        console.log(`[API] ✅ Created playlist "${name}" with ${playlist.trackCount} tracks`);

        return NextResponse.json({
            success: true,
            playlist: {
                ...playlist,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            }
        });
    } catch (error: any) {
        console.error('[API] Error creating playlist:', error);
        return NextResponse.json({ error: 'Failed to create playlist', message: error.message }, { status: 500 });
    }
}
