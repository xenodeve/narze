'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
    getWhitelist,
    addToWhitelist,
    removeFromWhitelist,
    updateWhitelistRole,
    WhitelistEntry
} from '@/services/adminWhitelist';
import {
    Shield,
    UserPlus,
    Trash2,
    Edit2,
    Save,
    X,
    Crown,
    Code
} from 'lucide-react';

export default function AdminWhitelistPage() {
    const { user, isDeveloper } = useAuth();
    const [entries, setEntries] = useState<WhitelistEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [newDiscordId, setNewDiscordId] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'developer'>('admin');
    const [adding, setAdding] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editRole, setEditRole] = useState<'admin' | 'developer'>('admin');

    const fetchWhitelist = async () => {
        try {
            setLoading(true);
            const data = await getWhitelist();
            setEntries(data);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWhitelist();
    }, []);

    const handleAdd = async () => {
        if (!newDiscordId || !newUsername) {
            alert('Please fill in all fields');
            return;
        }

        setAdding(true);
        const success = await addToWhitelist(
            newDiscordId,
            newUsername,
            newRole,
            user?.discordId || 'unknown'
        );

        if (success) {
            setShowAddModal(false);
            setNewDiscordId('');
            setNewUsername('');
            setNewRole('admin');
            fetchWhitelist();
        } else {
            alert('Failed to add to whitelist');
        }
        setAdding(false);
    };

    const handleRemove = async (discordId: string) => {
        if (!confirm('Are you sure you want to remove this user?')) return;

        const success = await removeFromWhitelist(discordId);
        if (success) {
            fetchWhitelist();
        } else {
            alert('Failed to remove from whitelist');
        }
    };

    const handleUpdateRole = async (discordId: string) => {
        const success = await updateWhitelistRole(discordId, editRole);
        if (success) {
            setEditingId(null);
            fetchWhitelist();
        } else {
            alert('Failed to update role');
        }
    };

    const startEditing = (entry: WhitelistEntry) => {
        setEditingId(entry.discordId);
        setEditRole(entry.role);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-purple-400" />
                    <h1 className="text-2xl font-bold text-white">Whitelist Management</h1>
                </div>

                {isDeveloper && (
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        Add User
                    </button>
                )}
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
                    <p className="text-slate-400 text-sm">Total Users</p>
                    <p className="text-2xl font-bold text-white">{entries.length}</p>
                </div>
                <div className="card-surface p-4 rounded-xl">
                    <p className="text-slate-400 text-sm">Developers</p>
                    <p className="text-2xl font-bold text-purple-400">
                        {entries.filter(e => e.role === 'developer').length}
                    </p>
                </div>
                <div className="card-surface p-4 rounded-xl">
                    <p className="text-slate-400 text-sm">Admins</p>
                    <p className="text-2xl font-bold text-blue-400">
                        {entries.filter(e => e.role === 'admin').length}
                    </p>
                </div>
            </div>

            {/* Table */}
            <div className="card-surface rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead className="bg-white/5">
                        <tr>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">User</th>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">Discord ID</th>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">Role</th>
                            <th className="text-left px-6 py-4 text-slate-400 font-medium">Added</th>
                            {isDeveloper && (
                                <th className="text-right px-6 py-4 text-slate-400 font-medium">Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                    Loading...
                                </td>
                            </tr>
                        ) : entries.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                    No users in whitelist
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr key={entry.discordId} className="border-t border-white/5 hover:bg-white/5">
                                    <td className="px-6 py-4">
                                        <span className="text-white font-medium">{entry.username}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-slate-400 font-mono text-sm">{entry.discordId}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {editingId === entry.discordId ? (
                                            <select
                                                value={editRole}
                                                onChange={(e) => setEditRole(e.target.value as 'admin' | 'developer')}
                                                className="px-3 py-1 rounded bg-white/10 border border-white/20 text-white"
                                            >
                                                <option value="admin">Admin</option>
                                                <option value="developer">Developer</option>
                                            </select>
                                        ) : (
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${entry.role === 'developer'
                                                    ? 'bg-purple-500/20 text-purple-400'
                                                    : 'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {entry.role === 'developer' ? (
                                                    <Code className="w-3 h-3" />
                                                ) : (
                                                    <Crown className="w-3 h-3" />
                                                )}
                                                {entry.role}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-slate-400 text-sm">
                                            {new Date(entry.addedAt).toLocaleDateString()}
                                        </span>
                                    </td>
                                    {isDeveloper && (
                                        <td className="px-6 py-4 text-right">
                                            {editingId === entry.discordId ? (
                                                <div className="flex items-center gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleUpdateRole(entry.discordId)}
                                                        className="p-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                                    >
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="p-1.5 rounded bg-slate-500/20 text-slate-400 hover:bg-slate-500/30"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 justify-end">
                                                    <button
                                                        onClick={() => startEditing(entry)}
                                                        className="p-1.5 rounded bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemove(entry.discordId)}
                                                        className="p-1.5 rounded bg-white/5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="card-surface w-full max-w-md p-6 rounded-2xl">
                        <h2 className="text-xl font-bold text-white mb-4">Add User to Whitelist</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Discord ID</label>
                                <input
                                    type="text"
                                    value={newDiscordId}
                                    onChange={(e) => setNewDiscordId(e.target.value)}
                                    placeholder="123456789012345678"
                                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500/50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Username</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    placeholder="username"
                                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500/50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Role</label>
                                <select
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value as 'admin' | 'developer')}
                                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="developer">Developer</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={adding}
                                className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
                            >
                                {adding ? 'Adding...' : 'Add User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
