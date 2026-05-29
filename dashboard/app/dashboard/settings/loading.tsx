'use client';

import { Settings } from 'lucide-react';

export default function SettingsLoading() {
    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Settings className="h-8 w-8 text-purple-500" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">ตั้งค่า Server</h1>
                        <p className="text-slate-400 text-sm">จัดการการตั้งค่าบอทสำหรับแต่ละ server</p>
                    </div>
                </div>
                {/* Bot status skeleton */}
                <div className="h-6 w-20 bg-white/10 rounded-full animate-pulse" />
            </div>

            {/* Guild Selector Skeleton */}
            <div className="mb-6 flex items-center gap-3 animate-pulse">
                <div className="h-5 w-24 bg-white/5 rounded" />
                <div className="h-10 w-52 bg-white/10 rounded-lg" />
            </div>

            {/* Settings Content Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="lg:col-span-2">
                    <div className="card-surface p-6 animate-pulse space-y-4">
                        {/* Section header skeleton */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-6 w-6 bg-white/10 rounded" />
                            <div className="h-6 w-40 bg-white/10 rounded" />
                        </div>

                        {/* Settings rows skeleton */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-white/10">
                                <div className="space-y-1">
                                    <div className="h-4 w-32 bg-white/10 rounded" />
                                    <div className="h-3 w-48 bg-white/5 rounded" />
                                </div>
                                <div className="h-8 w-48 bg-white/10 rounded-lg" />
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-white/10">
                                <div className="space-y-1">
                                    <div className="h-4 w-36 bg-white/10 rounded" />
                                    <div className="h-3 w-52 bg-white/5 rounded" />
                                </div>
                                <div className="h-8 w-20 bg-white/10 rounded-lg" />
                            </div>

                            <div className="flex items-center justify-between py-3">
                                <div className="space-y-1">
                                    <div className="h-4 w-28 bg-white/10 rounded" />
                                    <div className="h-3 w-44 bg-white/5 rounded" />
                                </div>
                                <div className="h-8 w-24 bg-white/10 rounded-lg" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
