'use client';

import { useState, useEffect, useRef } from 'react';
import {
    BarChart3,
    Cpu,
    MemoryStick,
    Activity,
    RefreshCw
} from 'lucide-react';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface PerformanceData {
    timestamp: Date;
    cpu: number;
    memory: number;
    players: number;
}

export default function AdminPerformancePage() {
    const [data, setData] = useState<PerformanceData[]>([]);
    const [currentStats, setCurrentStats] = useState<{ cpu: number; memory: number; players: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const fetchStats = async () => {
        try {
            const res = await fetch(`${BOT_API_URL}/api/admin/stats`);

            // Check if response is JSON
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn('[AdminPerformance] Bot returned non-JSON response - bot may be offline');
                setLoading(false);
                return;
            }

            if (!res.ok) throw new Error('Failed to fetch stats');
            const stats = await res.json();

            setCurrentStats({
                cpu: stats.cpu,
                memory: stats.memory.percentage,
                players: stats.activePlayers
            });

            // Add to history
            setData(prev => {
                const newData = [...prev, {
                    timestamp: new Date(),
                    cpu: stats.cpu,
                    memory: stats.memory.percentage,
                    players: stats.activePlayers
                }];
                // Keep last 60 data points (5 minutes at 5s interval)
                return newData.slice(-60);
            });

            setLoading(false);
        } catch (err: any) {
            console.warn('[AdminPerformance] Error fetching stats (bot may be offline):', err?.message);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 5000); // Every 5 seconds
        return () => clearInterval(interval);
    }, []);

    // Draw chart
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || data.length < 2) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const padding = 40;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();

            // Y-axis labels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${100 - i * 25}%`, padding - 10, y + 4);
        }

        const drawLine = (values: number[], color: string) => {
            if (values.length < 2) return;

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();

            values.forEach((value, i) => {
                const x = padding + (chartWidth / (values.length - 1)) * i;
                const y = padding + chartHeight - (value / 100) * chartHeight;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        };

        // Draw CPU line
        drawLine(data.map(d => d.cpu), '#f97316');

        // Draw Memory line
        drawLine(data.map(d => d.memory), '#06b6d4');

        // Legend
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#f97316';
        ctx.fillRect(width - 120, 15, 12, 12);
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('CPU', width - 100, 25);

        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(width - 120, 35, 12, 12);
        ctx.fillStyle = 'white';
        ctx.fillText('Memory', width - 100, 45);

    }, [data]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <BarChart3 className="w-6 h-6 text-pink-400" />
                    <h1 className="text-2xl font-bold text-white">Performance</h1>
                </div>

                <button
                    onClick={fetchStats}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Current Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <Cpu className="w-5 h-5 text-orange-400" />
                        <span className="text-slate-400">CPU Usage</span>
                    </div>
                    <div className="flex items-end gap-4">
                        <p className="text-4xl font-bold text-white">
                            {currentStats ? `${currentStats.cpu.toFixed(1)}%` : '---'}
                        </p>
                        <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                                style={{ width: `${currentStats?.cpu || 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <MemoryStick className="w-5 h-5 text-cyan-400" />
                        <span className="text-slate-400">Memory Usage</span>
                    </div>
                    <div className="flex items-end gap-4">
                        <p className="text-4xl font-bold text-white">
                            {currentStats ? `${currentStats.memory.toFixed(1)}%` : '---'}
                        </p>
                        <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                                style={{ width: `${currentStats?.memory || 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <Activity className="w-5 h-5 text-green-400" />
                        <span className="text-slate-400">Active Players</span>
                    </div>
                    <p className="text-4xl font-bold text-white">
                        {currentStats?.players ?? '---'}
                    </p>
                </div>
            </div>

            {/* Graph */}
            <div className="card-surface p-6 rounded-xl">
                <h2 className="text-lg font-medium text-white mb-4">Performance History (Last 5 minutes)</h2>
                <div className="relative" style={{ height: 300 }}>
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={300}
                        className="w-full h-full"
                        style={{ maxWidth: '100%' }}
                    />
                    {data.length < 2 && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                            Collecting data...
                        </div>
                    )}
                </div>
            </div>

            {/* Info */}
            <p className="text-sm text-slate-500 text-center">
                Data updates every 5 seconds • Showing last {data.length} data points
            </p>
        </div>
    );
}
