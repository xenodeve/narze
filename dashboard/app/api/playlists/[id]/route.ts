import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const PLAYLISTS_COLLECTION = 'playlists';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET - Get a single playlist by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        
        const doc = await adminDb.collection(PLAYLISTS_COLLECTION).doc(id).get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
        }

        const data = doc.data()!;
        const playlist = {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        };

        return NextResponse.json({ playlist });
    } catch (error: any) {
        console.error('[API] Error fetching playlist:', error);
        return NextResponse.json({ error: 'Failed to fetch playlist', message: error.message }, { status: 500 });
    }
}

// DELETE - Delete a playlist by ID
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const doc = await adminDb.collection(PLAYLISTS_COLLECTION).doc(id).get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
        }

        await adminDb.collection(PLAYLISTS_COLLECTION).doc(id).delete();

        console.log(`[API] ✅ Deleted playlist ${id}`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API] Error deleting playlist:', error);
        return NextResponse.json({ error: 'Failed to delete playlist', message: error.message }, { status: 500 });
    }
}

// PUT - Update a playlist by ID
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();

        const doc = await adminDb.collection(PLAYLISTS_COLLECTION).doc(id).get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
        }

        const updates: any = {
            updatedAt: new Date(),
        };

        if (body.name !== undefined) updates.name = body.name;
        if (body.description !== undefined) updates.description = body.description;
        if (body.thumbnail !== undefined) updates.thumbnail = body.thumbnail;
        if (body.tracks !== undefined) {
            updates.tracks = body.tracks;
            updates.trackCount = body.tracks.length;
        }

        await adminDb.collection(PLAYLISTS_COLLECTION).doc(id).update(updates);

        console.log(`[API] ✅ Updated playlist ${id}`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API] Error updating playlist:', error);
        return NextResponse.json({ error: 'Failed to update playlist', message: error.message }, { status: 500 });
    }
}
