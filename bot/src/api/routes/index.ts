import { Express } from 'express';
import { clientBot } from '../../interfaces/client';
import { createControlPermissionMiddleware } from '../middleware/auth';
import { createPlayerRoutes } from './player.routes';
import { createQueueRoutes } from './queue.routes';
import { createGuildRoutes } from './guild.routes';
import { createChartsRoutes } from './charts.routes';
import { createHistoryRoutes } from './history.routes';
import { createSearchRoutes } from './search.routes';
import { createAdminRoutes } from './admin.routes';
import { createPlaylistRoutes } from './playlist.routes';

/**
 * Register all API routes (v2 - for parallel testing)
 */
export function registerRoutesV2(app: Express, client: clientBot, gracefulShutdownFn?: () => void) {
    const checkControlPermission = createControlPermissionMiddleware(client);
    
    app.use('/api/v2/guild', createPlayerRoutes(client, checkControlPermission));
    app.use('/api/v2/guild', createQueueRoutes(client, checkControlPermission));
    app.use('/api/v2/guild', createGuildRoutes(client));
    app.use('/api/v2/charts', createChartsRoutes());
    app.use('/api/v2', createHistoryRoutes(client));
    app.use('/api/v2', createSearchRoutes(client));
    app.use('/api/v2', createPlaylistRoutes());
    if (gracefulShutdownFn) {
        app.use('/api/v2', createAdminRoutes(client, gracefulShutdownFn));
    }
    
    console.log('[API Routes V2] Registered: player, queue, guild, charts, history, search, playlist, admin');
}

/**
 * Register routes with original paths (for production)
 */
export function registerRoutes(app: Express, client: clientBot, gracefulShutdownFn?: () => void) {
    const checkControlPermission = createControlPermissionMiddleware(client);
    
    app.use('/api/guild', createPlayerRoutes(client, checkControlPermission));
    app.use('/api/guild', createQueueRoutes(client, checkControlPermission));
    app.use('/api/guild', createGuildRoutes(client));
    app.use('/api/charts', createChartsRoutes());
    app.use('/api', createHistoryRoutes(client));
    app.use('/api', createSearchRoutes(client));
    app.use('/api', createPlaylistRoutes());
    if (gracefulShutdownFn) {
        app.use('/api', createAdminRoutes(client, gracefulShutdownFn));
    }
    
    console.log('[API Routes] Registered: player, queue, guild, charts, history, search, playlist, admin');
}

// Re-export individual route creators
export { createPlayerRoutes } from './player.routes';
export { createQueueRoutes } from './queue.routes';
export { createGuildRoutes } from './guild.routes';
export { createChartsRoutes } from './charts.routes';
export { createHistoryRoutes } from './history.routes';
export { createSearchRoutes } from './search.routes';
export { createAdminRoutes } from './admin.routes';
export { createPlaylistRoutes } from './playlist.routes';
