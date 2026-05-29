import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';

/**
 * Admin Whitelist API - Uses Firebase Admin SDK (bypasses security rules)
 */

// GET - Get whitelist entries or check role
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const discordId = searchParams.get('discordId');
        
        if (discordId) {
            // Check single user's role
            const doc = await adminDb.collection('adminWhitelist').doc(discordId).get();
            
            if (doc.exists) {
                const data = doc.data();
                return NextResponse.json({
                    isAdmin: data?.role === 'admin' || data?.role === 'developer',
                    isDeveloper: data?.role === 'developer',
                    role: data?.role || null
                });
            }
            
            return NextResponse.json({
                isAdmin: false,
                isDeveloper: false,
                role: null
            });
        }
        
        // Get all whitelist entries
        const snapshot = await adminDb.collection('adminWhitelist').get();
        const entries = snapshot.docs.map(doc => ({
            discordId: doc.id,
            ...doc.data(),
            addedAt: doc.data().addedAt?.toDate() || new Date()
        }));
        
        return NextResponse.json({ entries });
    } catch (error: any) {
        console.error('[Admin Whitelist API] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST - Add to whitelist
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { discordId, username, role, addedBy } = body;
        
        if (!discordId || !username || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        await adminDb.collection('adminWhitelist').doc(discordId).set({
            discordId,
            username,
            role,
            addedAt: new Date(),
            addedBy: addedBy || 'unknown'
        });
        
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Admin Whitelist API] POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE - Remove from whitelist
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const discordId = searchParams.get('discordId');
        
        if (!discordId) {
            return NextResponse.json({ error: 'discordId required' }, { status: 400 });
        }
        
        await adminDb.collection('adminWhitelist').doc(discordId).delete();
        
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Admin Whitelist API] DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH - Update role
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { discordId, role } = body;
        
        if (!discordId || !role) {
            return NextResponse.json({ error: 'discordId and role required' }, { status: 400 });
        }
        
        await adminDb.collection('adminWhitelist').doc(discordId).update({ role });
        
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Admin Whitelist API] PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
