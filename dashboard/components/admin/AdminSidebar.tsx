'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Image from 'next/image';
import {
    LayoutDashboard,
    Terminal,
    Shield,
    Server,
    Users,
    BarChart3,
    Settings,
    ChevronLeft,
    ChevronRight,
    ArrowLeftRight,
    LogOut
} from 'lucide-react';

interface NavItem {
    href: string;
    icon: React.ReactNode;
    label: string;
    devOnly?: boolean;
}

const navItems: NavItem[] = [
    { href: '/admin', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard' },
    { href: '/admin/terminal', icon: <Terminal className="w-5 h-5" />, label: 'Terminal' },
    { href: '/admin/whitelist', icon: <Shield className="w-5 h-5" />, label: 'Whitelist' },
    { href: '/admin/guilds', icon: <Server className="w-5 h-5" />, label: 'Guilds' },
    { href: '/admin/users', icon: <Users className="w-5 h-5" />, label: 'Users' },
    { href: '/admin/performance', icon: <BarChart3 className="w-5 h-5" />, label: 'Performance' },
    { href: '/admin/settings', icon: <Settings className="w-5 h-5" />, label: 'Settings', devOnly: true },
];

export default function AdminSidebar() {
    const pathname = usePathname();
    const { user, isDeveloper, adminRole, signOut } = useAuth();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside
            className={`fixed left-0 top-0 h-full z-40 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'
                }`}
        >
            {/* Glassmorphism background */}
            <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xl border-r border-white/10" />

            <div className="relative h-full flex flex-col">
                {/* Header / Logo */}
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white">
                            A
                        </div>
                        {!collapsed && (
                            <div>
                                <h1 className="text-white font-bold">Admin Panel</h1>
                                <p className="text-xs text-slate-400 capitalize">{adminRole || 'Guest'}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        // Hide dev-only items for non-developers
                        if (item.devOnly && !isDeveloper) return null;

                        const isActive = pathname === item.href ||
                            (item.href !== '/admin' && pathname.startsWith(item.href));

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <span className={isActive ? 'text-purple-400' : 'text-slate-400 group-hover:text-white'}>
                                    {item.icon}
                                </span>
                                {!collapsed && <span>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* Bottom section */}
                <div className="p-3 border-t border-white/10 space-y-2">
                    {/* Switch to User Dashboard */}
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <ArrowLeftRight className="w-5 h-5" />
                        {!collapsed && <span>User Dashboard</span>}
                    </Link>

                    {/* User info */}
                    {user && (
                        <div className="flex items-center gap-3 px-3 py-2">
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
                                    {user.username?.charAt(0) || '?'}
                                </div>
                            )}
                            {!collapsed && (
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{user.username}</p>
                                    <p className="text-xs text-slate-400 truncate">{user.discordId}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Sign out */}
                    <button
                        onClick={() => signOut()}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        {!collapsed && <span>Sign Out</span>}
                    </button>
                </div>

                {/* Collapse button */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                    {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>
        </aside>
    );
}
