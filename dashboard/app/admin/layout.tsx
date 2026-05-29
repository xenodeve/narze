'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, isAdmin, isDeveloper } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // Wait for auth to load
        if (loading) return;

        // Not logged in - redirect to login
        if (!user) {
            router.replace('/login');
            return;
        }

        // Not admin or developer - redirect to user dashboard
        if (!isAdmin && !isDeveloper) {
            router.replace('/dashboard');
            return;
        }
    }, [user, loading, isAdmin, isDeveloper, router]);

    // Show loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    <p className="text-slate-400">Loading admin panel...</p>
                </div>
            </div>
        );
    }

    // Not authorized
    if (!isAdmin && !isDeveloper) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                    <p className="text-slate-400">You don't have permission to access the admin panel.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            {/* Background gradient */}
            <div className="fixed inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-pink-900/20 pointer-events-none" />

            {/* Sidebar */}
            <AdminSidebar />

            {/* Main content */}
            <main className="ml-64 min-h-screen p-6">
                {children}
            </main>
        </div>
    );
}
