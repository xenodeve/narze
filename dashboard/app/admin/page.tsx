'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
    Server,
    Users,
    Disc3,
    Activity,
    Wifi,
    WifiOff,
    Clock,
    HardDrive,
    Cpu,
    MemoryStick,
    RefreshCw
} from 'lucide-react';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface BotStats {
    online: boolean;
    ping: number;
    uptime: number;
    guilds: number;
    users: number;
    activePlayers: number;
    cpu: number;
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    cache: {
        name: string;
        size: number;
        items: number;
    }[];
}

export default function AdminDashboardPage() {
    const { user, isDeveloper, adminRole } = useAuth();
    const [stats, setStats] = useState<BotStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${BOT_API_URL}/api/admin/stats`);

            // Check if response is JSON (bot might return HTML error page if offline)
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn('[Admin] Bot returned non-JSON response - bot may be offline');
                setStats(null);
                setError('Bot appears to be offline');
                return;
            }

            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            setStats(data);
            setLastUpdate(new Date());
            setError(null);
        } catch (err: any) {
            console.warn('[Admin] Error fetching stats (bot may be offline):', err?.message);
            setError('Bot appears to be offline');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // Auto refresh every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatUptime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
                    <p className="text-slate-400 mt-1">
                        Welcome back, {user?.username} •
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${isDeveloper ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                            {adminRole}
                        </span>
                    </p>
                </div>
                <button
                    onClick={fetchStats}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Error message */}
            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    <p>Failed to load stats: {error}</p>
                    <p className="text-sm text-red-400/70 mt-1">Make sure the bot is running and the admin API is enabled.</p>
                </div>
            )}

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Bot Status */}
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400">Bot Status</span>
                        {stats?.online ? (
                            <Wifi className="w-5 h-5 text-green-400" />
                        ) : (
                            <WifiOff className="w-5 h-5 text-red-400" />
                        )}
                    </div>
                    <p className={`text-2xl font-bold ${stats?.online ? 'text-green-400' : 'text-red-400'}`}>
                        {stats ? (stats.online ? 'Online' : 'Offline') : '---'}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                        {stats?.ping ? `${stats.ping}ms ping` : 'No connection'}
                    </p>
                </div>

                {/* Uptime */}
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400">Uptime</span>
                        <Clock className="w-5 h-5 text-blue-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">
                        {stats ? formatUptime(stats.uptime) : '---'}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Since last restart</p>
                </div>

                {/* Guilds */}
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400">Servers</span>
                        <Server className="w-5 h-5 text-purple-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">
                        {stats?.guilds ?? '---'}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Discord servers</p>
                </div>

                {/* Active Players */}
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400">Active Players</span>
                        <Disc3 className="w-5 h-5 text-pink-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">
                        {stats?.activePlayers ?? '---'}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Currently playing</p>
                </div>
            </div>

            {/* System Resources */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* CPU */}
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <Cpu className="w-5 h-5 text-orange-400" />
                        <span className="text-slate-300 font-medium">CPU Usage</span>
                    </div>
                    <div className="flex items-end gap-4">
                        <p className="text-4xl font-bold text-white">
                            {stats ? `${stats.cpu.toFixed(1)}%` : '---'}
                        </p>
                        <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                                style={{ width: `${stats?.cpu || 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Memory */}
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <MemoryStick className="w-5 h-5 text-cyan-400" />
                        <span className="text-slate-300 font-medium">Memory Usage</span>
                    </div>
                    <div className="flex items-end gap-4">
                        <p className="text-4xl font-bold text-white">
                            {stats ? `${stats.memory.percentage.toFixed(1)}%` : '---'}
                        </p>
                        <div className="flex-1">
                            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                                    style={{ width: `${stats?.memory.percentage || 0}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                {stats ? `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}` : '--- / ---'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cache Info */}
            {stats?.cache && stats.cache.length > 0 && (
                <div className="card-surface p-6 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <HardDrive className="w-5 h-5 text-green-400" />
                        <span className="text-slate-300 font-medium">Cache Status</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {stats.cache.map((cache) => (
                            <div key={cache.name} className="p-4 rounded-lg bg-white/5">
                                <p className="text-sm text-slate-400 mb-1">{cache.name}</p>
                                <p className="text-lg font-bold text-white">{cache.items} items</p>
                                <p className="text-xs text-slate-500">{formatBytes(cache.size)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Last update */}
            <p className="text-sm text-slate-500 text-center">
                Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
        </div>
    );
}
