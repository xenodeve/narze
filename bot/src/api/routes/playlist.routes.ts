import { Router, Request, Response } from 'express';
import { 
    getCachedUserPlaylists, 
    getCachedPlaylist, 
    setUserPlaylistsCache, 
    addPlaylistToCache, 
    updatePlaylistInCache, 
    deletePlaylistFromCache,
    getPlaylistCacheStats,
    type Playlist
} from '../../functions/cache/playlistCache';

/**
 * Playlist Routes
 * Endpoints: GET/POST /playlists, GET/PUT/DELETE /playlists/:id, stats
 */
export function createPlaylistRoutes() {
    const router = Router();

    // GET /api/playlists - Get user's playlists
    router.get('/playlists', async (req: Request, res: Response) => {
        try {
            const userId = req.query.userId as string;
            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }

            // Try cache first
            let playlists = getCachedUserPlaylists(userId);
            
            if (playlists) {
                console.log(`[API] 📋 Returning ${playlists.length} playlists from cache for user ${userId}`);
                return res.json({ playlists, source: 'cache' });
            }

            // Cache miss - fetch from Firebase
            console.log(`[API] 📋 Cache miss, fetching from Firebase for user ${userId}`);
            const { getFirestore, isFirebaseInitialized } = await import('../../lib/firebase');
            
            if (!isFirebaseInitialized()) {
                return res.status(503).json({ error: 'Firebase not initialized' });
            }

            const db = getFirestore();
            if (!db) {
                return res.status(503).json({ error: 'Firebase database not available' });
            }

            const snapshot = await db.collection('playlists').where('userId', '==', userId).get();
            
            playlists = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    userId: data.userId,
                    name: data.name,
                    description: data.description || '',
                    thumbnail: data.thumbnail || '',
                    trackCount: data.trackCount || 0,
                    tracks: data.tracks || [],
                    sourcePlatform: data.sourcePlatform,
                    sourceUrl: data.sourceUrl,
                    createdAt: data.createdAt?.toDate?.() || data.createdAt,
                    updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                } as Playlist;
            });

            // Sort by createdAt desc
            playlists.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            // Update cache
            setUserPlaylistsCache(userId, playlists);

            res.json({ playlists, source: 'firebase' });
        } catch (error: any) {
            console.error('[API] ❌ Error fetching playlists:', error);
            res.status(500).json({ error: 'Failed to fetch playlists', message: error.message });
        }
    });

    // POST /api/playlists - Create a new playlist
    router.post('/playlists', async (req: Request, res: Response) => {
        try {
            const { userId, name, description, thumbnail, tracks, sourcePlatform, sourceUrl } = req.body;

            if (!userId || !name) {
                return res.status(400).json({ error: 'userId and name are required' });
            }

            const playlistId = `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();

            const playlist: Playlist = {
                id: playlistId,
                userId,
                name,
                description: description || '',
                thumbnail: thumbnail || tracks?.[0]?.thumbnail || '',
                trackCount: tracks?.length || 0,
                tracks: tracks || [],
                sourcePlatform: sourcePlatform || undefined,
                sourceUrl: sourceUrl || undefined,
                createdAt: now,
                updatedAt: now,
            };

            addPlaylistToCache(playlist);

            console.log(`[API] ✅ Created playlist "${name}" with ${playlist.trackCount} tracks`);
            res.json({ success: true, playlist });
        } catch (error: any) {
            console.error('[API] ❌ Error creating playlist:', error);
            res.status(500).json({ error: 'Failed to create playlist', message: error.message });
        }
    });

    // GET /api/playlists/:id - Get single playlist
    router.get('/playlists/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            // Try cache first
            let playlist = getCachedPlaylist(id);

            if (playlist) {
                console.log(`[API] 📋 Returning playlist "${playlist.name}" from cache`);
                return res.json({ playlist, source: 'cache' });
            }

            // Cache miss - fetch from Firebase
            const { getFirestore, isFirebaseInitialized } = await import('../../lib/firebase');
            
            if (!isFirebaseInitialized()) {
                return res.status(503).json({ error: 'Firebase not initialized' });
            }

            const db = getFirestore();
            if (!db) {
                return res.status(503).json({ error: 'Firebase database not available' });
            }

            const doc = await db.collection('playlists').doc(id).get();

            if (!doc.exists) {
                return res.status(404).json({ error: 'Playlist not found' });
            }

            const data = doc.data()!;
            playlist = {
                id: doc.id,
                userId: data.userId,
                name: data.name,
                description: data.description || '',
                thumbnail: data.thumbnail || '',
                trackCount: data.trackCount || 0,
                tracks: data.tracks || [],
                sourcePlatform: data.sourcePlatform,
                sourceUrl: data.sourceUrl,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            };

            res.json({ playlist, source: 'firebase' });
        } catch (error: any) {
            console.error('[API] ❌ Error fetching playlist:', error);
            res.status(500).json({ error: 'Failed to fetch playlist', message: error.message });
        }
    });

    // PUT /api/playlists/:id - Update playlist
    router.put('/playlists/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            updatePlaylistInCache(id, updates);

            console.log(`[API] ✅ Updated playlist ${id}`);
            res.json({ success: true });
        } catch (error: any) {
            console.error('[API] ❌ Error updating playlist:', error);
            res.status(500).json({ error: 'Failed to update playlist', message: error.message });
        }
    });

    // DELETE /api/playlists/:id - Delete playlist
    router.delete('/playlists/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            deletePlaylistFromCache(id);

            console.log(`[API] ✅ Deleted playlist ${id}`);
            res.json({ success: true });
        } catch (error: any) {
            console.error('[API] ❌ Error deleting playlist:', error);
            res.status(500).json({ error: 'Failed to delete playlist', message: error.message });
        }
    });

    // GET /api/playlist-stats - Get cache statistics
    router.get('/playlist-stats', (_req: Request, res: Response) => {
        const stats = getPlaylistCacheStats();
        res.json(stats);
    });

    return router;
}
