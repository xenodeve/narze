'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
    Users as UsersIcon,
    Search,
    Music,
    Clock,
    ExternalLink,
    RefreshCw
} from 'lucide-react';
import Image from 'next/image';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface UserData {
    id: string;
    discordId: string;
    username: string;
    avatar?: string;
    lastActive?: Date;
    playCount?: number;
    tracksCount?: number;
}

interface ActiveUser {
    userId: string;
    username: string;
    avatarURL: string;
    guildId: string;
    guildName: string;
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());
    const eventSourceRef = useRef<EventSource | null>(null);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            // Fetch from bot's in-memory cache (real-time updates)
            const res = await fetch(`${BOT_API_URL}/api/admin/users/cached`);

            // Check if response is JSON
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn('[AdminUsers] Bot returned non-JSON response - bot may be offline');
                setError('Bot appears to be offline');
                return;
            }

            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();

            const usersData: UserData[] = (data.users || []).map((user: any) => ({
                id: user.id,
                discordId: user.discordId || '',
                username: user.username || 'Unknown',
                avatar: user.avatar
                    ? (user.avatar.startsWith('http')
                        ? user.avatar
                        : `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`)
                    : undefined,
                lastActive: user.lastActive ? new Date(user.lastActive) : undefined,
                playCount: user.playCount || 0,
                tracksCount: user.tracksCount || 0
            }));

            setUsers(usersData);
            setError(null);
        } catch (err: any) {
            console.warn('[AdminUsers] Error fetching users (bot may be offline):', err?.message);
            setError('Bot appears to be offline');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // SSE connection for real-time dashboard presence (online users on website)
    useEffect(() => {
        const eventSource = new EventSource(`${BOT_API_URL}/api/admin/presence/events`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'dashboardPresence') {
                    const ids = new Set<string>(data.users.map((u: { discordId: string }) => u.discordId));
                    setActiveUserIds(ids);
                }
            } catch (e) {
                // Ignore parse errors
            }
        };

        eventSource.onerror = () => {
            // Reconnect handled by browser
        };

        return () => {
            eventSource.close();
        };
    }, []);

    // SSE connection for real-time user cache updates (play counts)
    useEffect(() => {
        const eventSource = new EventSource(`${BOT_API_URL}/api/admin/users/cached/events`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'userCacheUpdate' && data.users) {
                    const usersData: UserData[] = data.users.map((user: any) => ({
                        id: user.id,
                        discordId: user.discordId || '',
                        username: user.username || 'Unknown',
                        avatar: user.avatar
                            ? (user.avatar.startsWith('http')
                                ? user.avatar
                                : `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`)
                            : undefined,
                        lastActive: user.lastActive ? new Date(user.lastActive) : undefined,
                        playCount: user.playCount || 0,
                        tracksCount: user.tracksCount || 0
                    }));
                    setUsers(usersData);
                }
            } catch (e) {
                // Ignore parse errors
            }
        };

        eventSource.onerror = () => {
            // Reconnect handled by browser
        };

        return () => {
            eventSource.close();
        };
    }, []);

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.discordId.includes(search)
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <UsersIcon className="w-6 h-6 text-blue-400" />
                    <h1 className="text-2xl font-bold text-white">All Users</h1>
                </div>

                <button
                    onClick={fetchUsers}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card-surface p-4 rounded-xl">
                    <p className="text-slate-400 text-sm">Total Users</p>
                    <p className="text-2xl font-bold text-white">{users.length}</p>
                </div>
                <div className="card-surface p-4 rounded-xl">
                    <p className="text-slate-400 text-sm">Active Today</p>
                    <p className="text-2xl font-bold text-green-400">
                        {users.filter(u => {
                            if (!u.lastActive) return false;
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return u.lastActive >= today;
                        }).length}
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by username or Discord ID..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500/50"
                    />
                </div>

                <span className="text-sm text-slate-500">
                    {filteredUsers.length} users
                </span>
            </div>

            {/* Table */}
            <div className="card-surface rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead className="bg-white/5">
                        <tr>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">User</th>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">Discord ID</th>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">Plays</th>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">Tracks</th>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">Last Active</th>
                            <th className="text-right px-6 py-4 text-slate-400 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="border-t border-white/5">
                                    <td colSpan={6} className="px-6 py-4">
                                        <div className="h-4 bg-slate-700 rounded w-full animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map((user) => (
                                <tr key={user.id} className="border-t border-white/5 hover:bg-white/5">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                {user.avatar ? (
                                                    <Image
                                                        src={user.avatar}
                                                        alt={user.username}
                                                        width={32}
                                                        height={32}
                                                        className="rounded-full"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm">
                                                        {user.username.charAt(0)}
                                                    </div>
                                                )}
                                                {/* Online status indicator */}
                                                <span
                                                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${activeUserIds.has(user.discordId)
                                                        ? 'bg-green-500'
                                                        : 'bg-slate-500'
                                                        }`}
                                                    title={
                                                        activeUserIds.has(user.discordId)
                                                            ? 'On Dashboard'
                                                            : 'Offline'
                                                    }
                                                />
                                            </div>
                                            <span className="text-white font-medium">{user.username}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-slate-400 font-mono text-sm">{user.discordId}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-1 text-slate-400">
                                            <Music className="w-3.5 h-3.5" />
                                            {user.playCount || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-slate-400">
                                            {user.tracksCount || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`flex items-center gap-1 text-sm ${activeUserIds.has(user.discordId) ? 'text-green-400' : 'text-slate-400'
                                            }`}>
                                            <Clock className="w-3.5 h-3.5" />
                                            {activeUserIds.has(user.discordId)
                                                ? 'Now'
                                                : user.lastActive
                                                    ? new Date(user.lastActive).toLocaleString()
                                                    : 'Never'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/admin/users/${user.discordId}`}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors text-sm"
                                        >
                                            View Details
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
