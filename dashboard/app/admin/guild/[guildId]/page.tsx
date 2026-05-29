'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, use, useRef } from 'react';
import { ChevronLeft, Hash, Volume2, Users, Music, Clock, Calendar, MessageSquare, MessageCircle, Play, Loader2, Download, FileText, Film, Image as ImageIcon, File, X, Copy, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// ================= Types =================

interface GuildInfo {
    id: string;
    name: string;
    icon: string | null;
    banner: string | null;
    memberCount: number;
    ownerId: string;
    createdAt: number;
    description: string | null;
    features: string[];
    channels: {
        text: number;
        voice: number;
        category: number;
    };
}

interface VoiceChannel {
    id: string;
    name: string;
    type: number;
    memberCount: number;
    members: { id: string; username: string; displayName: string; avatar: string; isBot?: boolean }[];
}

interface TextChannel {
    id: string;
    name: string;
    type: number;
    isThread: boolean;
    parentId: string | null;
    parentName: string | null;
    position: number;
}

interface Session {
    sessionId: string;
    guildId: string;
    startTime: number;
    endTime?: number;
    isActive?: boolean;
    tracks: any[];
    participants: any[];
}

interface HistoryTrack {
    id: string;
    title: string;
    artist: string;
    playCount: number;
    thumbnail?: string;
}

interface Attachment {
    id: string;
    name: string;
    url: string;
    proxyURL: string;
    size: number;
    contentType: string | null;
    fileType: 'image' | 'video' | 'audio' | 'document' | 'file';
    width: number | null;
    height: number | null;
    spoiler: boolean;
}

interface Mention {
    id: string;
    username: string;
    avatar: string;
}

interface RoleMention {
    id: string;
    name: string;
    color: string;
}

interface Embed {
    type: string;
    title: string | null;
    description: string | null;
    url: string | null;
    color: number | null;
    provider: {
        name: string;
        url: string | null;
    } | null;
    author: {
        name: string;
        iconURL: string | null;
    } | null;
    thumbnail: string | null;
    image: string | null;
    video: string | null;
}

interface Reaction {
    emoji: string;
    count: number;
}

interface Reply {
    messageId: string;
    author: {
        username: string;
        avatar: string;
    } | null;
    content: string;
    mentions: { id: string; username: string }[];
}

interface ThreadInfo {
    id: string;
    name: string;
    messageCount: number;
    lastActivityAt: number;
    archived: boolean;
}

interface Message {
    id: string;
    content: string;
    author: {
        id: string;
        username: string;
        avatar: string;
        bot: boolean;
    };
    timestamp: number;
    mentions: Mention[];
    mentionedRoles: RoleMention[];
    attachments: Attachment[];
    embeds: Embed[];
    reactions: Reaction[];
    replyTo: Reply | null;
    thread: ThreadInfo | null;
}

// Helper to format file size
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to parse mentions in content and render as React elements
function parseMentions(content: string, mentions: Mention[]): React.ReactNode[] {
    if (!content) return [];

    // Create a map of user IDs to usernames
    const mentionMap = new Map<string, string>();
    mentions.forEach(m => mentionMap.set(m.id, m.username));

    // Split content by mention pattern <@ID> or <@!ID>
    const parts = content.split(/(<@!?\d+>)/g);

    return parts.map((part, index) => {
        const match = part.match(/^<@!?(\d+)>$/);
        if (match) {
            const userId = match[1];
            const username = mentionMap.get(userId);
            if (username) {
                return (
                    <span key={index} className="bg-purple-600/20 text-purple-400 px-0.5 rounded hover:bg-purple-600/30 cursor-pointer">
                        @{username}
                    </span>
                );
            }
            // Unknown user, show raw ID shortened
            return (
                <span key={index} className="bg-slate-600/20 text-slate-400 px-0.5 rounded">
                    @user
                </span>
            );
        }
        return part;
    });
}

// Helper to parse Discord markdown (bold, code, mentions, blockquotes) in embed descriptions
function parseDiscordMarkdown(content: string, mentions: Mention[] = [], roleMentions: RoleMention[] = []): React.ReactNode[] {
    if (!content) return [];

    // Create mention map
    const mentionMap = new Map<string, string>();
    mentions.forEach(m => mentionMap.set(m.id, m.username));

    // Create role mention map
    const roleMap = new Map<string, { name: string; color: string }>();
    roleMentions.forEach(r => roleMap.set(r.id, { name: r.name, color: r.color }));

    // Split by newlines first to handle blockquotes
    const lines = content.split('\n');
    const result: React.ReactNode[] = [];
    let keyIndex = 0;

    lines.forEach((line, lineIndex) => {
        // Check if line is a blockquote (starts with >)
        const isBlockquote = line.startsWith('>');

        let lineContent = line;
        if (isBlockquote) {
            lineContent = line.slice(1).trim();
        }

        // Check if line is a list item (starts with - or * followed by space)
        const listMatch = lineContent.match(/^(\s*)[-*]\s+(.*)$/);
        const isListItem = !!listMatch;

        if (isListItem) {
            lineContent = listMatch[2];
        }

        // Parse markdown within the line
        const parseLine = (text: string): React.ReactNode[] => {
            const lineResult: React.ReactNode[] = [];
            // Added masked link pattern [text](url) and URL pattern (https?://...)
            // Order matters: masked links must be matched before bare URLs
            // Match Discord user mentions <@ID>, role mentions <@&ID>
            const regex = /(\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|\*\*(.+?)\*\*|`([^`]+)`|<@&(\d+)>|<@!?(\d+)>|(https?:\/\/[^\s<]+))/g;
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    lineResult.push(text.slice(lastIndex, match.index));
                }

                if (match[2] && match[3]) {
                    // [text](url) - masked link
                    const linkText = match[2];
                    const linkUrl = match[3];

                    // Check if link text has formatting (bold, italic, etc.)
                    const formatLinkText = (txt: string): React.ReactNode => {
                        // Parse **bold** within link text
                        const boldMatch = txt.match(/^\*\*(.+)\*\*$/);
                        if (boldMatch) {
                            return <strong className="font-semibold">{boldMatch[1]}</strong>;
                        }
                        // Parse *italic* within link text
                        const italicMatch = txt.match(/^\*(.+)\*$/);
                        if (italicMatch) {
                            return <em>{italicMatch[1]}</em>;
                        }
                        // Parse __underline__ within link text
                        const underlineMatch = txt.match(/^__(.+)__$/);
                        if (underlineMatch) {
                            return <span className="underline">{underlineMatch[1]}</span>;
                        }
                        return txt;
                    };

                    lineResult.push(
                        <a
                            key={`${keyIndex++}`}
                            href={linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                            {formatLinkText(linkText)}
                        </a>
                    );
                } else if (match[4]) {
                    // **bold** - parse URLs within bold content
                    const boldContent = match[4];
                    const urlRegex = /(https?:\/\/[^\s<]+)/g;
                    const parts = boldContent.split(urlRegex);

                    if (parts.length === 1) {
                        // No URLs, just bold text
                        lineResult.push(<strong key={`${keyIndex++}`} className="text-white font-semibold">{boldContent}</strong>);
                    } else {
                        // Has URLs - render text as bold, URLs as clickable bold links
                        const boldElements: React.ReactNode[] = [];
                        let urlIndex = 0;
                        const urlMatches = boldContent.match(urlRegex) || [];

                        parts.forEach((part, idx) => {
                            if (part.match(/^https?:\/\//)) {
                                // This is a URL
                                boldElements.push(
                                    <a
                                        key={`bold-url-${keyIndex++}`}
                                        href={part}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 hover:underline font-semibold"
                                    >
                                        {part}
                                    </a>
                                );
                            } else if (part) {
                                // This is regular bold text
                                boldElements.push(<strong key={`bold-text-${keyIndex++}`} className="text-white font-semibold">{part}</strong>);
                            }
                        });

                        lineResult.push(<span key={`${keyIndex++}`}>{boldElements}</span>);
                    }
                } else if (match[5]) {
                    // `code`
                    lineResult.push(<code key={`${keyIndex++}`} className="bg-slate-700 text-slate-200 px-1 py-0.5 rounded text-xs">{match[5]}</code>);
                } else if (match[6]) {
                    // <@&roleId> - Role mention
                    const roleId = match[6];
                    const role = roleMap.get(roleId);
                    const roleColor = role?.color && role.color !== '#000000' ? role.color : '#99aab5';
                    lineResult.push(
                        <span
                            key={`${keyIndex++}`}
                            className="px-0.5 rounded whitespace-nowrap"
                            style={{
                                backgroundColor: `${roleColor}20`,
                                color: roleColor
                            }}
                        >
                            @{role?.name || 'role'}
                        </span>
                    );
                } else if (match[7]) {
                    // <@userId> - User mention
                    const userId = match[7];
                    const username = mentionMap.get(userId);
                    lineResult.push(
                        <span key={`${keyIndex++}`} className="bg-purple-600/20 text-purple-400 px-0.5 rounded whitespace-nowrap">
                            @{username || 'user'}
                        </span>
                    );
                } else if (match[8]) {
                    // URL - make it clickable
                    lineResult.push(
                        <a
                            key={`${keyIndex++}`}
                            href={match[8]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                            {match[8]}
                        </a>
                    );
                }

                lastIndex = regex.lastIndex;
            }

            if (lastIndex < text.length) {
                lineResult.push(text.slice(lastIndex));
            }

            return lineResult.length > 0 ? lineResult : [text];
        };

        const parsedContent = parseLine(lineContent);

        if (isBlockquote) {
            result.push(
                <div key={`line-${lineIndex}`} className="border-l-4 border-slate-500 pl-2 text-slate-300">
                    {parsedContent}
                </div>
            );
        } else if (isListItem) {
            const indent = listMatch[1] || '';
            result.push(
                <div key={`line-${lineIndex}`} style={{ paddingLeft: indent.length * 8 }}>
                    <span className="text-slate-400 mr-1">•</span>
                    {parsedContent}
                </div>
            );
        } else if (lineContent) {
            result.push(
                <span key={`line-${lineIndex}`}>
                    {lineIndex > 0 && <br />}
                    {parsedContent}
                </span>
            );
        }
    });

    return result;
}

// ================= Helper Functions =================

function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatTime(ms: number): string {
    return new Date(ms).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
}

// ================= Main Component =================

export default function AdminGuildDetailPage({ params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = use(params);
    const router = useRouter();
    const searchParams = useSearchParams();

    const [guildInfo, setGuildInfo] = useState<GuildInfo | null>(null);
    const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
    const [textChannels, setTextChannels] = useState<TextChannel[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [history, setHistory] = useState<HistoryTrack[]>([]);
    const [selectedChannel, setSelectedChannel] = useState<string | null>(searchParams.get('channel'));
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'channels' | 'sessions' | 'history'>(
        (searchParams.get('tab') as 'overview' | 'channels' | 'sessions' | 'history') || 'overview'
    );
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video' | 'gif'; url: string } | null>(null);

    // Update URL when tab or channel changes
    useEffect(() => {
        const params = new URLSearchParams();
        if (activeTab !== 'overview') params.set('tab', activeTab);
        if (selectedChannel) params.set('channel', selectedChannel);
        const queryString = params.toString();
        router.replace(`/admin/guild/${guildId}${queryString ? '?' + queryString : ''}`, { scroll: false });
    }, [activeTab, selectedChannel, guildId, router]);

    // Fetch all guild data
    useEffect(() => {
        async function fetchGuildData() {
            setLoading(true);
            try {
                // Fetch guild info
                const infoRes = await fetch(`${BOT_API_URL}/api/admin/guild/${guildId}/info`);
                if (infoRes.ok) {
                    setGuildInfo(await infoRes.json());
                }

                // Fetch voice channels
                const voiceRes = await fetch(`${BOT_API_URL}/api/guild/${guildId}/voice-channels`);
                if (voiceRes.ok) {
                    const data = await voiceRes.json();
                    setVoiceChannels(data.channels || []);
                }

                // Fetch text channels
                const textRes = await fetch(`${BOT_API_URL}/api/admin/guild/${guildId}/text-channels`);
                if (textRes.ok) {
                    const data = await textRes.json();
                    setTextChannels(data.channels || []);
                }

                // Fetch sessions
                const sessionsRes = await fetch(`${BOT_API_URL}/api/guild/${guildId}/sessions?limit=50`);
                if (sessionsRes.ok) {
                    const data = await sessionsRes.json();
                    setSessions(data.sessions || []);
                }

                // Fetch play history
                const historyRes = await fetch(`${BOT_API_URL}/api/guild/${guildId}/history`);
                if (historyRes.ok) {
                    const data = await historyRes.json();
                    setHistory(data.tracks || []);
                }
            } catch (error: any) {
                console.warn('[AdminGuildDetail] Error fetching guild data (bot may be offline):', error?.message);
            } finally {
                setLoading(false);
            }
        }

        fetchGuildData();
    }, [guildId]);

    // Fetch messages when channel is selected
    useEffect(() => {
        async function fetchMessages() {
            if (!selectedChannel) return;

            setMessagesLoading(true);
            try {
                const res = await fetch(`${BOT_API_URL}/api/admin/guild/${guildId}/messages/${selectedChannel}?limit=50`);
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages || []);
                }
            } catch (error: any) {
                console.warn('[AdminGuildDetail] Error fetching messages (bot may be offline):', error?.message);
            } finally {
                setMessagesLoading(false);
            }
        }

        fetchMessages();
    }, [guildId, selectedChannel]);

    // Auto-scroll to bottom when messages load
    useEffect(() => {
        if (!messagesLoading && messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        }
    }, [messages, messagesLoading]);

    // Handler for clicking a thread from message preview
    const handleThreadClick = (thread: { id: string; name: string }, parentChannelId: string | null) => {
        // Check if thread is already in textChannels
        const threadExists = textChannels.some(c => c.id === thread.id);

        if (!threadExists) {
            // Add thread to textChannels
            const newThread: TextChannel = {
                id: thread.id,
                name: thread.name,
                type: 11, // Public thread
                isThread: true,
                parentId: parentChannelId,
                parentName: null,
                position: 999
            };
            setTextChannels(prev => [...prev, newThread]);
        }

        // Select the thread
        setSelectedChannel(thread.id);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
        );
    }

    if (!guildInfo) {
        return (
            <div className="text-center py-12">
                <p className="text-slate-400">Guild not found</p>
                <button onClick={() => router.back()} className="text-purple-400 hover:text-purple-300 mt-4">
                    ← Back
                </button>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-4">
                        {guildInfo.icon ? (
                            <Image
                                src={guildInfo.icon}
                                alt={guildInfo.name}
                                width={64}
                                height={64}
                                className="rounded-xl"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl bg-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                                {guildInfo.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl font-bold text-white">{guildInfo.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-slate-400 mt-1">
                                <span className="flex items-center gap-1">
                                    <Users className="w-4 h-4" />
                                    {guildInfo.memberCount.toLocaleString()} members
                                </span>
                                <span className="flex items-center gap-1">
                                    <Hash className="w-4 h-4" />
                                    {guildInfo.channels.text} text
                                </span>
                                <span className="flex items-center gap-1">
                                    <Volume2 className="w-4 h-4" />
                                    {guildInfo.channels.voice} voice
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-white/10 pb-2">
                    {(['overview', 'channels', 'sessions', 'history'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab
                                ? 'bg-purple-600 text-white'
                                : 'text-slate-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            {tab === 'overview' && 'Overview'}
                            {tab === 'channels' && 'Channels'}
                            {tab === 'sessions' && `Sessions (${sessions.length})`}
                            {tab === 'history' && `History (${history.length})`}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Voice Channels */}
                        <div className="card-surface rounded-xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Volume2 className="w-5 h-5 text-purple-400" />
                                Voice Channels
                            </h2>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {voiceChannels.length === 0 ? (
                                    <p className="text-slate-500 text-sm">No voice channels</p>
                                ) : (
                                    voiceChannels.map(channel => (
                                        <div key={channel.id} className="p-3 bg-white/5 rounded-lg">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-white font-medium flex items-center gap-2">
                                                    <Volume2 className="w-4 h-4 text-slate-400" />
                                                    {channel.name}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    {channel.memberCount} connected
                                                </span>
                                            </div>
                                            {channel.members.length > 0 && (
                                                <div className="flex -space-x-2">
                                                    {channel.members.slice(0, 5).map(m => (
                                                        <Image
                                                            key={m.id}
                                                            src={m.avatar}
                                                            alt={m.username}
                                                            width={24}
                                                            height={24}
                                                            className="rounded-full ring-2 ring-slate-900"
                                                        />
                                                    ))}
                                                    {channel.members.length > 5 && (
                                                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white ring-2 ring-slate-900">
                                                            +{channel.members.length - 5}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Text Channels */}
                        <div className="card-surface rounded-xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Hash className="w-5 h-5 text-purple-400" />
                                Text Channels
                            </h2>
                            <div className="space-y-1 max-h-[300px] overflow-y-auto">
                                {textChannels.length === 0 ? (
                                    <p className="text-slate-500 text-sm">No text channels</p>
                                ) : (
                                    textChannels.map(channel => (
                                        <button
                                            key={channel.id}
                                            onClick={() => {
                                                setSelectedChannel(channel.id);
                                                setActiveTab('channels');
                                            }}
                                            className={`w-full text-left p-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 ${selectedChannel === channel.id ? 'bg-white/10' : ''
                                                }`}
                                        >
                                            <Hash className="w-4 h-4 text-slate-400" />
                                            <span className="text-slate-300">{channel.name}</span>
                                            {channel.parentName && (
                                                <span className="text-xs text-slate-500 ml-auto">
                                                    {channel.parentName}
                                                </span>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Recent Sessions */}
                        <div className="card-surface rounded-xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-purple-400" />
                                Recent Sessions
                            </h2>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {sessions.slice(0, 5).map(session => (
                                    <Link
                                        key={session.sessionId}
                                        href={`/admin/session/${session.sessionId}`}
                                        className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        {/* Thumbnail */}
                                        <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                            {session.tracks[0]?.thumbnail ? (
                                                <Image
                                                    src={session.tracks[0].thumbnail}
                                                    alt="Session"
                                                    width={48}
                                                    height={48}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Music className="w-5 h-5 text-white/50" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="text-white text-sm">
                                                    {formatDate(session.startTime)}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    {session.tracks.length} tracks
                                                </span>
                                            </div>
                                            {/* Participants avatars - now below date */}
                                            {session.participants && session.participants.length > 0 && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    <div className="flex -space-x-1">
                                                        {session.participants.slice(0, 4).map((p: any, i: number) => (
                                                            <div
                                                                key={p.userId || i}
                                                                className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-slate-900 bg-white/10 cursor-pointer"
                                                                title={p.username || 'Unknown'}
                                                            >
                                                                {p.avatarURL ? (
                                                                    <Image src={p.avatarURL} alt={p.username || ''} width={20} height={20} className="object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full bg-purple-600 text-[8px] text-white flex items-center justify-center">
                                                                        {p.username?.charAt(0) || '?'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {session.participants.length > 4 && (
                                                            <div
                                                                className="w-5 h-5 rounded-full ring-1 ring-slate-900 bg-slate-700 text-[8px] text-white flex items-center justify-center"
                                                                title={session.participants.slice(4).map((p: any) => p.username).join(', ')}
                                                            >
                                                                +{session.participants.length - 4}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {session.isActive && (
                                                <span className="inline-block mt-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                                                    Live
                                                </span>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                                {sessions.length === 0 && (
                                    <p className="text-slate-500 text-sm">No sessions</p>
                                )}
                            </div>
                        </div>

                        {/* Top Tracks */}
                        <div className="card-surface rounded-xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Music className="w-5 h-5 text-purple-400" />
                                Top Tracks
                            </h2>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {history.slice(0, 5).map((track, i) => (
                                    <div key={track.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                                        <span className="text-slate-500 text-sm w-6">{i + 1}</span>
                                        {track.thumbnail ? (
                                            <Image
                                                src={track.thumbnail}
                                                alt={track.title}
                                                width={40}
                                                height={40}
                                                className="rounded"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center">
                                                <Music className="w-4 h-4 text-slate-500" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm truncate">{track.title}</p>
                                            <p className="text-slate-400 text-xs truncate">{track.artist}</p>
                                        </div>
                                        <span className="text-slate-500 text-xs">{track.playCount} plays</span>
                                    </div>
                                ))}
                                {history.length === 0 && (
                                    <p className="text-slate-500 text-sm">No history</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'channels' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Channel List */}
                        <div className="card-surface rounded-xl p-4">
                            <h3 className="text-sm font-medium text-slate-400 mb-3">Text Channels</h3>
                            <div className="space-y-1 max-h-[500px] overflow-y-auto">
                                {/* Group channels: show only non-threads, then threads will be shown via inline render */}
                                {(() => {
                                    // Separate channels and threads
                                    const regularChannels = textChannels.filter(c => !c.isThread);
                                    const threads = textChannels.filter(c => c.isThread);

                                    // Build lookup for threads by parentId
                                    const threadsByParent = new Map<string, typeof threads>();
                                    threads.forEach(thread => {
                                        const parentId = thread.parentId;
                                        if (parentId) {
                                            if (!threadsByParent.has(parentId)) {
                                                threadsByParent.set(parentId, []);
                                            }
                                            threadsByParent.get(parentId)!.push(thread);
                                        }
                                    });

                                    return regularChannels.map(channel => (
                                        <div key={channel.id}>
                                            {/* Regular Channel */}
                                            <button
                                                onClick={() => setSelectedChannel(channel.id)}
                                                className={`w-full text-left p-2 rounded-lg transition-colors flex items-center gap-2 ${selectedChannel === channel.id
                                                    ? 'bg-purple-600/20 text-purple-400'
                                                    : 'hover:bg-white/10 text-slate-300'
                                                    }`}
                                            >
                                                <Hash className="w-4 h-4" />
                                                {channel.name}
                                            </button>

                                            {/* Threads under this channel */}
                                            {threadsByParent.get(channel.id)?.map(thread => (
                                                <button
                                                    key={thread.id}
                                                    onClick={() => setSelectedChannel(thread.id)}
                                                    className={`w-full text-left p-2 pl-8 rounded-lg transition-colors flex items-center gap-2 ${selectedChannel === thread.id
                                                        ? 'bg-purple-600/20 text-purple-400'
                                                        : 'hover:bg-white/10 text-slate-400'
                                                        }`}
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    <span className="text-sm">{thread.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="lg:col-span-2 card-surface rounded-xl p-4">
                            {!selectedChannel ? (
                                <div className="flex items-center justify-center h-[400px] text-slate-500">
                                    <MessageSquare className="w-8 h-8 mr-2" />
                                    Select a channel to view messages
                                </div>
                            ) : messagesLoading ? (
                                <div className="flex items-center justify-center h-[400px]">
                                    <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                                    {messages.length === 0 ? (
                                        <p className="text-slate-500 text-center py-8">No messages</p>
                                    ) : (
                                        messages.map(msg => (
                                            <div key={msg.id} className="group">
                                                {/* Reply Reference - Discord style */}
                                                {msg.replyTo && (
                                                    <div className="flex items-center ml-[20px] mb-1 relative">
                                                        {/* Curved connector line */}
                                                        <div className="absolute left-0 top-1/2 w-8 h-3 border-l-2 border-t-2 border-slate-600 rounded-tl-md -translate-x-[10px]" />

                                                        <div className="flex items-center gap-1.5 ml-7 text-xs">
                                                            {msg.replyTo.author?.avatar && (
                                                                <Image
                                                                    src={msg.replyTo.author.avatar}
                                                                    alt=""
                                                                    width={16}
                                                                    height={16}
                                                                    className="rounded-full"
                                                                />
                                                            )}
                                                            <span className="text-slate-400 hover:text-white cursor-pointer">
                                                                @{msg.replyTo.author?.username || 'Unknown'}
                                                            </span>
                                                            <span className="text-slate-500 truncate max-w-[250px]">
                                                                {parseMentions(msg.replyTo.content, msg.replyTo.mentions as Mention[])}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Main Message */}
                                                <div className="flex gap-3 p-2 hover:bg-white/5 rounded-lg items-start">
                                                    <Image
                                                        src={msg.author.avatar}
                                                        alt={msg.author.username}
                                                        width={40}
                                                        height={40}
                                                        className="rounded-full flex-shrink-0 w-10 h-10"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`font-medium ${msg.author.bot ? 'text-purple-400' : 'text-white'}`}>
                                                                {msg.author.username}
                                                            </span>
                                                            {msg.author.bot && (
                                                                <span className="px-1.5 py-0.5 bg-purple-600 text-white text-[10px] rounded">BOT</span>
                                                            )}
                                                            <span className="text-xs text-slate-500">
                                                                {formatDate(msg.timestamp)} {formatTime(msg.timestamp)}
                                                            </span>
                                                        </div>

                                                        {/* Message Content - hide if it's just a media URL */}
                                                        {(() => {
                                                            // Check if message is just a media URL
                                                            const hasPureMediaEmbed = msg.embeds.some(embed =>
                                                                !embed.title && !embed.description && !embed.author &&
                                                                (embed.type === 'gifv' || embed.type === 'image' || embed.image || embed.thumbnail)
                                                            );
                                                            const contentTrimmed = msg.content?.trim() || '';
                                                            const isJustUrl = /^https?:\/\/\S+$/i.test(contentTrimmed);

                                                            // If content is just a URL and we have a pure media embed, hide the URL
                                                            if (hasPureMediaEmbed && isJustUrl) {
                                                                return null;
                                                            }

                                                            // If no content but has attachments/embeds, don't show [Media/Embed]
                                                            if (!msg.content && (msg.attachments.length > 0 || msg.embeds.length > 0)) {
                                                                return null;
                                                            }

                                                            // If no content at all and no media, show nothing
                                                            if (!msg.content) {
                                                                return null;
                                                            }

                                                            return (
                                                                <div className="text-slate-300 text-sm break-words mt-1">
                                                                    {parseDiscordMarkdown(msg.content, msg.mentions, msg.mentionedRoles)}
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Attachments */}
                                                        {msg.attachments.length > 0 && (
                                                            <div className="mt-2 space-y-2">
                                                                {msg.attachments.map(att => (
                                                                    <div key={att.id}>
                                                                        {/* Image */}
                                                                        {att.fileType === 'image' && (
                                                                            <div className="relative inline-block max-w-[300px]">
                                                                                <button
                                                                                    onClick={() => setPreviewMedia({ type: 'image', url: att.proxyURL || att.url })}
                                                                                    className="cursor-pointer hover:opacity-90 transition-opacity"
                                                                                >
                                                                                    <img
                                                                                        src={att.proxyURL || att.url}
                                                                                        alt={att.name}
                                                                                        className="rounded-lg max-h-[200px] object-contain"
                                                                                    />
                                                                                </button>
                                                                                <a
                                                                                    href={att.url}
                                                                                    download={att.name}
                                                                                    className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-lg hover:bg-black/70 transition-colors"
                                                                                >
                                                                                    <Download className="w-4 h-4 text-white" />
                                                                                </a>
                                                                            </div>
                                                                        )}

                                                                        {/* Video */}
                                                                        {att.fileType === 'video' && (
                                                                            <div className="relative max-w-[400px]">
                                                                                <video
                                                                                    src={att.proxyURL || att.url}
                                                                                    controls
                                                                                    className="rounded-lg max-h-[250px] cursor-pointer"
                                                                                    onDoubleClick={() => setPreviewMedia({ type: 'video', url: att.proxyURL || att.url })}
                                                                                />
                                                                                <a
                                                                                    href={att.url}
                                                                                    download={att.name}
                                                                                    className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-lg hover:bg-black/70 transition-colors"
                                                                                >
                                                                                    <Download className="w-4 h-4 text-white" />
                                                                                </a>
                                                                            </div>
                                                                        )}

                                                                        {/* Audio */}
                                                                        {att.fileType === 'audio' && (
                                                                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg max-w-[350px]">
                                                                                <Music className="w-8 h-8 text-purple-400 flex-shrink-0" />
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-white text-sm truncate">{att.name}</p>
                                                                                    <audio src={att.proxyURL || att.url} controls className="w-full mt-1 h-8" />
                                                                                </div>
                                                                                <a href={att.url} download={att.name} className="p-2 hover:bg-white/10 rounded-lg">
                                                                                    <Download className="w-4 h-4 text-slate-400" />
                                                                                </a>
                                                                            </div>
                                                                        )}

                                                                        {/* Document / File */}
                                                                        {(att.fileType === 'document' || att.fileType === 'file') && (
                                                                            <a
                                                                                href={att.url}
                                                                                download={att.name}
                                                                                className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors max-w-[350px]"
                                                                            >
                                                                                {att.fileType === 'document' ? (
                                                                                    <FileText className="w-8 h-8 text-blue-400 flex-shrink-0" />
                                                                                ) : (
                                                                                    <File className="w-8 h-8 text-slate-400 flex-shrink-0" />
                                                                                )}
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-white text-sm truncate">{att.name}</p>
                                                                                    <p className="text-slate-500 text-xs">{formatFileSize(att.size)}</p>
                                                                                </div>
                                                                                <Download className="w-5 h-5 text-slate-400" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Embeds - Discord style */}
                                                        {msg.embeds.length > 0 && (
                                                            <div className="mt-2 space-y-2">
                                                                {msg.embeds.map((embed, i) => {
                                                                    // Check if this is a pure media embed (no text content)
                                                                    const isPureMedia = !embed.title && !embed.description && !embed.author &&
                                                                        (embed.type === 'gifv' || embed.type === 'image' ||
                                                                            (embed.image || embed.thumbnail));

                                                                    // Pure GIF/image - render without container, wrapped in link
                                                                    if (isPureMedia) {
                                                                        const linkUrl = embed.url || '';
                                                                        if (embed.type === 'gifv' && embed.video) {
                                                                            return (
                                                                                <a key={i} href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
                                                                                    <video
                                                                                        src={embed.video}
                                                                                        autoPlay
                                                                                        loop
                                                                                        muted
                                                                                        playsInline
                                                                                        className="rounded max-w-[400px] max-h-[300px] cursor-pointer hover:opacity-90 transition-opacity"
                                                                                    />
                                                                                </a>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <a key={i} href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
                                                                                <img
                                                                                    src={embed.image || embed.thumbnail || ''}
                                                                                    alt=""
                                                                                    className="rounded max-w-[400px] max-h-[300px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                                                                />
                                                                            </a>
                                                                        );
                                                                    }

                                                                    // Rich embed with container
                                                                    return (
                                                                        <div
                                                                            key={i}
                                                                            className="border-l-4 bg-[#2b2d31] rounded-r-lg p-3 max-w-[400px]"
                                                                            style={{ borderColor: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#5865f2' }}
                                                                        >
                                                                            {/* Provider (YouTube, etc) */}
                                                                            {embed.provider && (
                                                                                <p className="text-xs text-slate-400 mb-1">{embed.provider.name}</p>
                                                                            )}

                                                                            {/* Main content with thumbnail on right */}
                                                                            <div className="flex gap-3">
                                                                                <div className="flex-1 min-w-0">
                                                                                    {/* Author */}
                                                                                    {embed.author && (
                                                                                        <div className="flex items-center gap-2 mb-1">
                                                                                            {embed.author.iconURL && (
                                                                                                <img src={embed.author.iconURL} alt="" className="w-6 h-6 rounded-full" />
                                                                                            )}
                                                                                            <span className="text-white text-sm font-medium">{embed.author.name}</span>
                                                                                        </div>
                                                                                    )}

                                                                                    {/* Title */}
                                                                                    {embed.title && (
                                                                                        embed.url ? (
                                                                                            <a
                                                                                                href={embed.url}
                                                                                                target="_blank"
                                                                                                rel="noopener noreferrer"
                                                                                                className="text-purple-400 font-medium text-sm hover:underline block"
                                                                                            >
                                                                                                {embed.title}
                                                                                            </a>
                                                                                        ) : (
                                                                                            <p className="text-purple-400 font-medium text-sm">
                                                                                                {embed.title}
                                                                                            </p>
                                                                                        )
                                                                                    )}
                                                                                    {embed.description && (
                                                                                        <div className="text-slate-300 text-sm mt-1">
                                                                                            {parseDiscordMarkdown(embed.description, msg.mentions, msg.mentionedRoles)}
                                                                                        </div>
                                                                                    )}
                                                                                </div>

                                                                                {/* Thumbnail on right - only for rich embeds without large images */}
                                                                                {embed.thumbnail && !['video', 'gifv', 'image', 'article'].includes(embed.type) && !embed.image && (
                                                                                    <img
                                                                                        src={embed.thumbnail}
                                                                                        alt=""
                                                                                        className="w-20 h-20 rounded object-cover flex-shrink-0"
                                                                                    />
                                                                                )}
                                                                            </div>

                                                                            {/* Video player or large image/GIF */}
                                                                            {embed.type === 'video' && embed.video ? (
                                                                                <div className="mt-3 aspect-video w-full max-w-[400px]">
                                                                                    <iframe
                                                                                        src={embed.video.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                                                                                        className="w-full h-full rounded"
                                                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                                                        allowFullScreen
                                                                                    />
                                                                                </div>
                                                                            ) : embed.type === 'video' && embed.url ? (
                                                                                <div className="mt-3 aspect-video w-full max-w-[400px]">
                                                                                    <iframe
                                                                                        src={embed.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                                                                                        className="w-full h-full rounded"
                                                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                                                        allowFullScreen
                                                                                    />
                                                                                </div>
                                                                            ) : embed.type === 'gifv' && embed.video ? (
                                                                                /* GIFV - autoplay video */
                                                                                <video
                                                                                    src={embed.video}
                                                                                    autoPlay
                                                                                    loop
                                                                                    muted
                                                                                    playsInline
                                                                                    className="mt-3 rounded max-w-full max-h-[300px]"
                                                                                />
                                                                            ) : embed.image && embed.type !== 'rich' ? (
                                                                                /* Large image - only for image embeds, not rich embeds */
                                                                                <img
                                                                                    src={embed.image}
                                                                                    alt=""
                                                                                    className="mt-3 rounded max-w-full max-h-[300px] object-contain"
                                                                                />
                                                                            ) : null}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Reactions */}
                                                        {msg.reactions.length > 0 && (
                                                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                                                                {msg.reactions.map((r, i) => (
                                                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-full text-xs text-slate-300">
                                                                        {r.emoji} {r.count}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Thread Preview */}
                                                        {msg.thread && (
                                                            <button
                                                                onClick={() => handleThreadClick(msg.thread!, selectedChannel)}
                                                                className="mt-2 p-2 bg-[#2b2d31] hover:bg-[#35373c] rounded-lg border-l-2 border-slate-600 transition-colors w-full text-left group"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-purple-400 font-medium text-sm">
                                                                        {msg.thread.name}
                                                                    </span>
                                                                    <span className="text-xs text-slate-400 group-hover:text-slate-300">
                                                                        {msg.thread.messageCount} ข้อความ &gt;
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-slate-500 mt-1">
                                                                    {msg.thread.archived
                                                                        ? 'เธรดนี้ถูกเก็บถาวรแล้ว'
                                                                        : 'คลิกเพื่อดูเธรด'}
                                                                </p>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {
                    activeTab === 'sessions' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {sessions.map(session => (
                                <Link
                                    key={session.sessionId}
                                    href={`/admin/session/${session.sessionId}`}
                                    className="group card-surface p-4 rounded-xl hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10"
                                >
                                    <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                        {session.tracks[0]?.thumbnail ? (
                                            <Image
                                                src={session.tracks[0].thumbnail}
                                                alt="Session"
                                                fill
                                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <Music className="w-12 h-12 text-white/50" />
                                        )}

                                        {/* Play button overlay */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
                                                <Play className="h-5 w-5 text-white ml-0.5" />
                                            </div>
                                        </div>
                                        {session.isActive && (
                                            <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                                                Live
                                            </div>
                                        )}
                                        {/* Participants Avatars */}
                                        {session.participants && session.participants.length > 0 && (
                                            <div className="absolute bottom-2 left-2 flex -space-x-1.5">
                                                {session.participants.slice(0, 4).map((p: any, i: number) => (
                                                    <div
                                                        key={p.userId || i}
                                                        className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-black/50 bg-white/10"
                                                        title={p.username}
                                                    >
                                                        {p.avatarURL ? (
                                                            <Image
                                                                src={p.avatarURL}
                                                                alt={p.username || ''}
                                                                width={20}
                                                                height={20}
                                                                className="object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-[8px] text-white font-medium bg-purple-600">
                                                                {p.username?.charAt(0)?.toUpperCase() || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                {session.participants.length > 4 && (
                                                    <div className="w-5 h-5 rounded-full ring-1 ring-black/50 bg-black/60 flex items-center justify-center text-[8px] text-white font-medium">
                                                        +{session.participants.length - 4}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-white font-medium text-sm">{formatDate(session.startTime)}</p>
                                    <p className="text-slate-400 text-xs mt-1">
                                        {session.tracks.length} tracks • {session.participants?.length || 0} participants
                                    </p>
                                </Link>
                            ))}
                            {sessions.length === 0 && (
                                <div className="col-span-full text-center py-12 text-slate-500">
                                    No sessions found
                                </div>
                            )}
                        </div>
                    )
                }

                {
                    activeTab === 'history' && (
                        <div className="card-surface rounded-xl overflow-hidden">
                            <div className="hidden md:grid grid-cols-[40px_1fr_auto_80px] gap-4 px-4 py-3 text-xs text-slate-500 border-b border-white/10">
                                <span>#</span>
                                <span>Track</span>
                                <span>Artist</span>
                                <span className="text-right">Plays</span>
                            </div>
                            {history.map((track, i) => (
                                <div
                                    key={track.id}
                                    className="grid grid-cols-[40px_1fr_80px] md:grid-cols-[40px_1fr_auto_80px] gap-4 px-4 py-3 hover:bg-white/5 items-center"
                                >
                                    <span className="text-slate-500 text-sm">{i + 1}</span>
                                    <div className="flex items-center gap-3 min-w-0">
                                        {track.thumbnail ? (
                                            <Image
                                                src={track.thumbnail}
                                                alt={track.title}
                                                width={40}
                                                height={40}
                                                className="rounded flex-shrink-0"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center flex-shrink-0">
                                                <Music className="w-4 h-4 text-slate-500" />
                                            </div>
                                        )}
                                        <span className="text-white truncate">{track.title}</span>
                                    </div>
                                    <span className="hidden md:block text-slate-400 text-sm truncate">{track.artist}</span>
                                    <span className="text-slate-400 text-sm text-right">{track.playCount}</span>
                                </div>
                            ))}
                            {history.length === 0 && (
                                <div className="text-center py-12 text-slate-500">
                                    No play history
                                </div>
                            )}
                        </div>
                    )
                }
            </div>

            {/* Media Preview Modal */}
            {previewMedia && (
                <div
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                    onClick={() => setPreviewMedia(null)}
                >
                    {/* Action buttons - right side */}
                    <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <a
                            href={previewMedia.url}
                            download
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                            title="Download"
                        >
                            <Download className="w-5 h-5" />
                        </a>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(previewMedia.url);
                            }}
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                            title="Copy link"
                        >
                            <Copy className="w-5 h-5" />
                        </button>
                        <a
                            href={previewMedia.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                            title="Open in new tab"
                        >
                            <ExternalLink className="w-5 h-5" />
                        </a>
                        <button
                            className="p-2 text-white hover:text-slate-300 transition-colors"
                            onClick={() => setPreviewMedia(null)}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {previewMedia.type === 'video' ? (
                        <video
                            src={previewMedia.url}
                            controls
                            autoPlay
                            className="max-w-full max-h-[90vh] rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : previewMedia.type === 'gif' ? (
                        <video
                            src={previewMedia.url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="max-w-full max-h-[90vh] rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <img
                            src={previewMedia.url}
                            alt="Preview"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
            )}
        </>
    );
}
