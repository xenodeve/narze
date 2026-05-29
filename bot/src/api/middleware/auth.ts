import { Request, Response } from 'express';
import { clientBot } from '../../interfaces/client';
import { canUserControlBot, getUserVoiceChannel } from '../../functions/guildSettings';
import { formatUserInfo } from '../utils/helpers';

/**
 * Middleware to check if user has permission to control the player
 * Used for player control endpoints (pause, resume, skip, volume, etc.)
 */
export function createControlPermissionMiddleware(client: clientBot) {
    return async (req: Request, res: Response, next: Function) => {
        const { guildId } = req.params;
        const { user } = req.body;
        
        // Skip permission check if no user info provided (for backwards compatibility)
        if (!user?.discordId) {
            console.log(`[API] ⚠️ No user discordId provided, skipping permission check`);
            return next();
        }

        try {
            const userVoiceChannelId = await getUserVoiceChannel(client, guildId, user.discordId);
            const permission = await canUserControlBot(client, guildId, user.discordId, userVoiceChannelId);

            if (!permission.canControl) {
                console.log(`[API] 🚫 Permission denied for ${formatUserInfo(user)}: ${permission.reason}`);
                return res.status(403).json({ 
                    error: 'Permission denied', 
                    reason: permission.reason 
                });
            }

            // User has permission, continue
            console.log(`[API] ✅ Permission granted for ${formatUserInfo(user)}: ${permission.reason}`);
            next();
        } catch (error) {
            console.error('Error checking permission:', error);
            // Allow on error for backwards compatibility
            next();
        }
    };
}
