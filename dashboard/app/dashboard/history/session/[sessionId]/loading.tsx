'use client';

import { memo } from 'react';

export default function SessionDetailLoading() {
    return (
        <div className="relative">
            {/* Dynamic Background Skeleton */}
            <div className="absolute -top-4 sm:-top-6 md:-top-8 -left-4 sm:-left-6 md:-left-8 -right-4 sm:-right-6 md:-right-8 h-96 bg-gradient-to-b from-purple-900/20 to-transparent opacity-40 pointer-events-none" />

            {/* Header Skeleton */}
            <div className="relative z-10 flex flex-col md:flex-row md:items-end gap-6 mb-8">
                {/* Thumbnail Skeleton */}
                <div className="w-48 h-48 md:w-56 md:h-56 rounded-xl bg-white/10 animate-pulse flex-shrink-0" />

                {/* Info Skeleton */}
                <div className="flex-1 space-y-4">
                    <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                    <div className="h-8 w-64 bg-white/10 rounded animate-pulse" />
                    <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />

                    {/* Participant Avatars Skeleton */}
                    <div className="flex items-center gap-2 mt-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
                        ))}
                    </div>

                    {/* Stats Skeleton */}
                    <div className="flex items-center gap-4 mt-2">
                        <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                        <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                        <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                    </div>
                </div>
            </div>

            {/* Track List Header Skeleton */}
            <div className="border-b border-white/10 mb-2">
                <div className="grid grid-cols-[40px_1fr_80px] md:grid-cols-[40px_2fr_1fr_80px] gap-4 px-4 py-2">
                    <div className="h-4 w-4 bg-white/5 rounded animate-pulse" />
                    <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
                    <div className="hidden md:block h-4 w-20 bg-white/5 rounded animate-pulse" />
                    <div className="h-4 w-12 bg-white/5 rounded animate-pulse ml-auto" />
                </div>
            </div>

            {/* Track List Skeleton */}
            <div className="space-y-1">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="grid grid-cols-[40px_1fr_80px] md:grid-cols-[40px_2fr_1fr_80px] gap-4 px-4 py-3">
                        <div className="h-4 w-4 bg-white/10 rounded animate-pulse mx-auto" />
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-white/10 animate-pulse flex-shrink-0" />
                            <div className="space-y-2 flex-1 min-w-0">
                                <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
                                <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
                            </div>
                        </div>
                        <div className="hidden md:block h-4 w-16 bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-10 bg-white/5 rounded animate-pulse ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    );
}
