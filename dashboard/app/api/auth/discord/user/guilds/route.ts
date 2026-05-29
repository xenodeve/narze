import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // ดึง ID token จาก Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);

    // Verify token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // ดึงข้อมูล user จาก Firestore
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const guilds = userData?.guilds || [];

    // แปลง guilds format สำหรับ frontend
    const formattedGuilds = guilds.map((guild: any) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon || null,
      owner: guild.owner || false,
    }));

    return NextResponse.json(formattedGuilds);
  } catch (error: any) {
    console.error('Failed to fetch user guilds:', error);
    
    // ถ้า token ไม่ valid ให้ return 401
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch guilds' },
      { status: 500 }
    );
  }
}
