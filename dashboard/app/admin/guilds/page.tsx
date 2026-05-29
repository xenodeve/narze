'use client';

import { useState, useEffect } from 'react';
import {
    Server,
    Search,
    Users,
    Music,
    ExternalLink,
    RefreshCw
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface Guild {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
    ownerId: string;
    hasPlayer: boolean;
    joinedAt: string;
}

export default function AdminGuildsPage() {
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'members' | 'joined'>('name');

    const fetchGuilds = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${BOT_API_URL}/api/admin/guilds`);

            // Check if response is JSON
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn('[AdminGuilds] Bot returned non-JSON response - bot may be offline');
                setError('Bot appears to be offline');
                return;
            }

            if (!res.ok) throw new Error('Failed to fetch guilds');
            const data = await res.json();
            setGuilds(data.guilds);
            setError(null);
        } catch (err: any) {
            console.warn('[AdminGuilds] Error fetching guilds (bot may be offline):', err?.message);
            setError('Bot appears to be offline');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGuilds();
    }, []);

    const filteredGuilds = guilds
        .filter(g =>
            g.name.toLowerCase().includes(search.toLowerCase()) ||
            g.id.includes(search)
        )
        .sort((a, b) => {
            switch (sortBy) {
                case 'members':
                    return b.memberCount - a.memberCount;
                case 'joined':
                    return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
                default:
                    return a.name.localeCompare(b.name);
            }
        });

    const totalMembers = guilds.reduce((acc, g) => acc + g.memberCount, 0);
    const playingGuilds = guilds.filter(g => g.hasPlayer).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Server className="w-6 h-6 text-green-400" />
                    <h1 className="text-2xl font-bold text-white">All Guilds</h1>
                </div>

                <button
                    onClick={fetchGuilds}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    {error}
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card-surface p-4 rounded-xl">
                    <p className="text-slate-400 text-sm">Total Servers</p>
                    <p className="text-2xl font-bold text-white">{guilds.length}</p>
                </div>
                <div className="card-surface p-4 rounded-xl">
                    <p className="text-slate-400 text-sm">Total Members</p>
                    <p className="text-2xl font-bold text-blue-400">{totalMembers.toLocaleString()}</p>
                </div>
                <div className="card-surface p-4 rounded-xl">
                    <p className="text-slate-400 text-sm">Currently Playing</p>
                    <p className="text-2xl font-bold text-green-400">{playingGuilds}</p>
                </div>
            </div>

            {/* Search & Sort */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or ID..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500/50"
                    />
                </div>

                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none"
                >
                    <option value="name">Sort by Name</option>
                    <option value="members">Sort by Members</option>
                    <option value="joined">Sort by Join Date</option>
                </select>

                <span className="text-sm text-slate-500">
                    {filteredGuilds.length} guilds
                </span>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="card-surface p-4 rounded-xl animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-slate-700" />
                                <div className="flex-1">
                                    <div className="h-4 bg-slate-700 rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-slate-700 rounded w-1/2" />
                                </div>
                            </div>
                        </div>
                    ))
                ) : filteredGuilds.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-slate-400">
                        No guilds found
                    </div>
                ) : (
                    filteredGuilds.map((guild) => (
                        <Link
                            key={guild.id}
                            href={`/admin/guild/${guild.id}`}
                            className="card-surface p-4 rounded-xl hover:bg-white/5 transition-colors block"
                        >
                            <div className="flex items-start gap-3">
                                {guild.icon ? (
                                    <Image
                                        src={guild.icon}
                                        alt={guild.name}
                                        width={48}
                                        height={48}
                                        className="rounded-xl"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center text-white font-bold text-lg">
                                        {guild.name.charAt(0)}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-medium truncate">{guild.name}</h3>
                                    <p className="text-xs text-slate-500 font-mono">{guild.id}</p>

                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="flex items-center gap-1 text-sm text-slate-400">
                                            <Users className="w-3.5 h-3.5" />
                                            {guild.memberCount}
                                        </span>

                                        {guild.hasPlayer && (
                                            <span className="flex items-center gap-1 text-sm text-green-400">
                                                <Music className="w-3.5 h-3.5" />
                                                Playing
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <span
                                    onClick={(e) => {
                                        e.preventDefault();
                                        window.open(`/dashboard?guild=${guild.id}`, '_blank');
                                    }}
                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </span>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
