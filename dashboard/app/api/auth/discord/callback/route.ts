import { getDiscordAccessToken, getDiscordUser, getDiscordUserGuilds } from '@/lib/discord-auth';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route: /api/auth/discord/callback
 * จัดการ Discord OAuth2 callback
 * ใช้ Firebase Admin SDK เพื่อข้าม Security Rules
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code not provided' },
        { status: 400 }
      );
    }

    // ดึง access token จาก Discord
    const tokenData = await getDiscordAccessToken(code);
    const discordUser = await getDiscordUser(tokenData.access_token);
    const discordGuilds = await getDiscordUserGuilds(tokenData.access_token);

    // สร้าง/อัพเดท user ใน Firestore (ใช้ Admin SDK)
    const userId = `discord_${discordUser.id}`;
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();

    const userData: Record<string, any> = {
      id: userId,
      discordId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      email: discordUser.email,
      avatar: discordUser.avatar,
      verified: discordUser.verified,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: Date.now() + tokenData.expires_in * 1000,
      guilds: discordGuilds.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
      })),
      updatedAt: new Date(),
    };

    if (!userSnap.exists) {
      userData.createdAt = new Date();
    }

    await userRef.set(userData, { merge: true });

    // สร้าง Firebase Custom Token สำหรับ login ฝั่ง client
    const customToken = await adminAuth.createCustomToken(userId, {
      discordId: discordUser.id,
      username: discordUser.username,
      email: discordUser.email,
    });

    console.log('✅ User created/updated in Firestore:', userId);

    // Redirect กลับไปยัง login callback page พร้อม custom token
    // Use the base URL from env variable to ensure correct redirect
    const baseUrl = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI?.replace('/api/auth/discord/callback', '') || new URL(request.url).origin;
    return NextResponse.redirect(
      new URL(`/login/callback?token=${customToken}`, baseUrl)
    );

  } catch (error: any) {
    console.error('Discord OAuth callback error:', error);
    
    // Redirect กลับพร้อม error message
    const baseUrl = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI?.replace('/api/auth/discord/callback', '') || new URL(request.url).origin;
    return NextResponse.redirect(
      new URL(
        `/login?discord_error=${encodeURIComponent(error.message)}`,
        baseUrl
      )
    );
  }
}
