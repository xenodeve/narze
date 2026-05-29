'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { X, Volume2, Users, Loader2, Mic2 } from 'lucide-react';
import Image from 'next/image';
import { useSSE } from '@/hooks/useSSE';

interface VoiceChannelMember {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    isBot?: boolean;
}

interface VoiceChannel {
    id: string;
    name: string;
    type: number;
    memberCount: number;
    members: VoiceChannelMember[];
}

interface VoiceChannelSelectorModalProps {
    isOpen: boolean;
    guildId: string;
    onClose: () => void;
    onSelect: (channelId: string) => void;
    onBack?: () => void;  // Optional back button to return to guild selector
}

export const VoiceChannelSelectorModal = memo(function VoiceChannelSelectorModal({
    isOpen,
    guildId,
    onClose,
    onSelect,
    onBack,
}: VoiceChannelSelectorModalProps) {
    const { data: sseData } = useSSE(guildId || null);
    const [channels, setChannels] = useState<VoiceChannel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

    // Handle SSE voiceChannelsUpdate event
    useEffect(() => {
        if (!sseData || sseData.type !== 'voiceChannelsUpdate') return;
        console.log('[VoiceChannelModal] Voice channels update received via SSE');
        if (sseData.data.channels && Array.isArray(sseData.data.channels)) {
            setChannels(sseData.data.channels);
        }
    }, [sseData]);

    // Fetch voice channels when modal opens
    useEffect(() => {
        if (!isOpen || !guildId) return;

        const fetchVoiceChannels = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/guild/${guildId}/voice-channels`);

                // Check if response is JSON (bot might return HTML error page if offline)
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    console.warn('[VoiceChannel] Bot returned non-JSON response - bot may be offline');
                    setError('Bot appears to be offline');
                    return;
                }

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to fetch voice channels');
                }

                setChannels(data.channels || []);
            } catch (err: any) {
                console.warn('[VoiceChannel] Error fetching voice channels:', err?.message);
                setError(err.message || 'Failed to load voice channels');
            } finally {
                setLoading(false);
            }
        };

        fetchVoiceChannels();
    }, [isOpen, guildId]);

    // Handle close with animation
    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            setSelectedChannelId(null);
            onClose();
        }, 200);
    }, [onClose]);

    // Handle channel selection
    const handleSelect = useCallback((channelId: string) => {
        setSelectedChannelId(channelId);
        onSelect(channelId);
        handleClose();
    }, [onSelect, handleClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'animate-backdropFadeIn'
                    }`}
                onClick={handleClose}
            />

            {/* Modal */}
            <div
                className={`relative z-10 w-full max-w-lg card-surface overflow-hidden transition-all duration-200 ${isClosing ? 'opacity-0 scale-95 translate-y-4' : 'animate-modalSlideUp'
                    }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors mr-1"
                                aria-label="กลับ"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                        )}
                        <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
                            <Mic2 className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">เลือก Voice Channel</h3>
                            <p className="text-sm text-slate-400">เลือกห้องที่ต้องการให้บอทเข้าไปเล่นเพลง</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="ปิด"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 max-h-[400px] overflow-y-auto">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                            <p className="text-slate-400">กำลังโหลดรายการห้อง...</p>
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8">
                            <p className="text-red-400 mb-2">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="text-sm text-purple-400 hover:text-purple-300"
                            >
                                ลองใหม่
                            </button>
                        </div>
                    )}

                    {!loading && !error && channels.length === 0 && (
                        <div className="text-center py-8">
                            <Volume2 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-400">ไม่พบ Voice Channel ใน Server นี้</p>
                        </div>
                    )}

                    {!loading && !error && channels.length > 0 && (
                        <div className="space-y-2">
                            {channels.map((channel) => (
                                <button
                                    key={channel.id}
                                    onClick={() => handleSelect(channel.id)}
                                    disabled={selectedChannelId === channel.id}
                                    className={`w-full p-4 rounded-xl border transition-all duration-200 text-left ${selectedChannelId === channel.id
                                        ? 'bg-purple-600/20 border-purple-500'
                                        : 'bg-white/5 border-white/10 hover:border-purple-500/50 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        {/* Channel Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Volume2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                                <span className="text-white font-medium truncate">{channel.name}</span>
                                                {channel.memberCount > 0 && (
                                                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-white/10 px-2 py-0.5 rounded-full">
                                                        <Users className="h-3 w-3" />
                                                        {channel.memberCount}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Members Preview */}
                                            {channel.members.length > 0 && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="flex -space-x-2">
                                                        {channel.members.slice(0, 5).map((member) => (
                                                            <div
                                                                key={member.id}
                                                                className="relative w-7 h-7 rounded-full border-2 border-[#0d0d0d] overflow-hidden bg-white/10"
                                                                title={member.displayName}
                                                            >
                                                                {member.avatar ? (
                                                                    <Image
                                                                        src={member.avatar}
                                                                        alt={member.displayName}
                                                                        fill
                                                                        className="object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                                                                        {member.displayName.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {channel.members.length > 5 && (
                                                            <div className="w-7 h-7 rounded-full border-2 border-[#0d0d0d] bg-white/10 flex items-center justify-center text-xs text-slate-400">
                                                                +{channel.members.length - 5}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-slate-500 truncate">
                                                        {channel.members
                                                            .slice(0, 3)
                                                            .map((m) => m.displayName)
                                                            .join(', ')}
                                                        {channel.members.length > 3 && ` และอีก ${channel.members.length - 3} คน`}
                                                    </span>
                                                </div>
                                            )}

                                            {channel.members.length === 0 && (
                                                <p className="text-xs text-slate-500 mt-1">ไม่มีใครในห้องขณะนี้</p>
                                            )}
                                        </div>

                                        {/* Select indicator */}
                                        {selectedChannelId === channel.id && (
                                            <div className="flex-shrink-0">
                                                <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-5 py-3 border-t border-white/10 bg-white/5">
                    <p className="text-xs text-slate-500 text-center">
                        บอทจะเข้าร่วมห้องที่คุณเลือกและเริ่มเล่นเพลง
                    </p>
                </div>
            </div>
        </div>
    );
});
