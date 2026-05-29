/**
 * Discord OAuth2 Authentication
 * ใช้ Custom Authorization Code Flow แทน Firebase OIDC
 */

const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || '';

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_OAUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = `${DISCORD_API}/oauth2/token`;
const DISCORD_USER_URL = `${DISCORD_API}/users/@me`;
const DISCORD_GUILDS_URL = `${DISCORD_API}/users/@me/guilds`;

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string;
  verified: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
}

/**
 * สร้าง Discord OAuth authorization URL
 */
export function getDiscordAuthorizationUrl(): string {
  // ใช้สำหรับ login เท่านั้น ไม่เชิญบอท
  const scopes = ['identify', 'email', 'guilds'];

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
  });

  return `${DISCORD_OAUTH_URL}?${params.toString()}`;
}

/**
 * แลก authorization code เป็น access token
 */
export async function getDiscordAccessToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const startTime = Date.now();
  const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] [API Request] POST ${DISCORD_TOKEN_URL}`);
  
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    }).toString(),
  });

  const duration = Date.now() - startTime;
  console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms)`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get Discord token: ${error.error_description}`);
  }

  return response.json();
}

/**
 * ดึง Discord user info จาก access token
 */
export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const startTime = Date.now();
  const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] [API Request] GET ${DISCORD_USER_URL}`);
  
  const response = await fetch(DISCORD_USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const duration = Date.now() - startTime;
  console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms)`);

  if (!response.ok) {
    throw new Error('Failed to fetch Discord user');
  }

  return response.json();
}

/**
 * ดึง Discord guilds ที่ user เป็นสมาชิก
 */
export async function getDiscordUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const startTime = Date.now();
  const requestId = `${new Date().toISOString()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] [API Request] GET ${DISCORD_GUILDS_URL}`);
  
  const response = await fetch(DISCORD_GUILDS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const duration = Date.now() - startTime;
  console.log(`[${requestId}] [API Response] ${response.status} (${duration}ms)`);

  if (!response.ok) {
    throw new Error('Failed to fetch Discord guilds');
  }

  return response.json();
}

/**
 * อัพเดท Discord user avatar URL
 */
export function getDiscordAvatarUrl(userId: string, avatar: string | null): string {
  if (!avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
}

/**
 * อัพเดท Discord guild icon URL
 */
export function getDiscordGuildIconUrl(guildId: string, icon: string | null): string {
  if (!icon) {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png`;
}
