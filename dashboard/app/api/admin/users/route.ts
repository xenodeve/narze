import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * Admin Users API - Uses Firebase Admin SDK (bypasses security rules)
 */

// GET - Get all users
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limitParam = searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam) : 100;
        
        const snapshot = await adminDb.collection('users')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                discordId: data.discordId || '',
                username: data.username || 'Unknown',
                avatar: data.avatar || null,
                createdAt: data.createdAt?.toDate()?.toISOString() || null,
                lastActive: data.lastActive?.toDate()?.toISOString() || null,
                playCount: data.totalPlayCount || 0
            };
        });
        
        return NextResponse.json({ users, total: users.length });
    } catch (error: any) {
        console.error('[Admin Users API] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
