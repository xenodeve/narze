import { Router, Request, Response } from 'express';
import { 
    fetchBillboardChart, 
    getBillboardRecommendations, 
    getBillboardTracks 
} from '../../functions/cache/billboardCache';

/**
 * Charts Routes
 * Endpoints: /api/charts/billboard, /api/charts/billboard/recommendations
 */
export function createChartsRoutes() {
    const router = Router();

    // Get Billboard Top Charts (cached, updates every 3 days)
    router.get('/billboard', async (req: Request, res: Response) => {
        try {
            const forceRefresh = req.query.refresh === 'true';
            const limit = parseInt(req.query.limit as string) || 100;
            const offset = parseInt(req.query.offset as string) || 0;
            
            if (forceRefresh) {
                const chart = await fetchBillboardChart(true);
                if (!chart) {
                    return res.status(503).json({ error: 'Billboard chart data not available' });
                }
                
                const tracks = chart.tracks.slice(offset, offset + limit);
                
                return res.json({
                    success: true,
                    lastUpdated: chart.lastUpdated,
                    date: chart.date,
                    chart: chart.chart,
                    total: chart.tracks.length,
                    count: tracks.length,
                    tracks
                });
            }
            
            const tracks = getBillboardTracks(limit, offset);
            const chart = await fetchBillboardChart(false);
            
            if (!chart) {
                return res.status(503).json({ error: 'Billboard chart data not available' });
            }

            res.json({
                success: true,
                lastUpdated: chart.lastUpdated,
                date: chart.date,
                chart: chart.chart,
                total: chart.tracks.length,
                count: tracks.length,
                tracks
            });
        } catch (error) {
            console.error('Error in /api/charts/billboard:', error);
            res.status(500).json({ error: 'Failed to get Billboard chart', details: String(error) });
        }
    });

    // Get Billboard recommendations formatted for player
    router.get('/billboard/recommendations', async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const recommendations = await getBillboardRecommendations(limit);
            
            res.json({
                success: true,
                count: recommendations.length,
                tracks: recommendations
            });
        } catch (error) {
            console.error('Error in /api/charts/billboard/recommendations:', error);
            res.status(500).json({ error: 'Failed to get Billboard recommendations', details: String(error) });
        }
    });

    return router;
}
