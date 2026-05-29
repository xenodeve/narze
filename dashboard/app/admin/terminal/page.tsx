'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
    Terminal as TerminalIcon,
    Filter,
    Search,
    Trash2,
    Pause,
    Play,
    Download,
    ChevronDown
} from 'lucide-react';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface LogEntry {
    timestamp: Date | string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

export default function AdminTerminalPage() {
    const { isDeveloper } = useAuth();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
    const [search, setSearch] = useState('');
    const [paused, setPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [connected, setConnected] = useState(false);

    const terminalRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const pausedLogsRef = useRef<LogEntry[]>([]);

    useEffect(() => {
        // Connect to SSE log stream
        const eventSource = new EventSource(`${BOT_API_URL}/api/admin/logs/events`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            setConnected(true);
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'history') {
                    // Initial history load
                    setLogs(data.logs);
                } else {
                    // New log entry
                    const logEntry: LogEntry = data;

                    if (paused) {
                        // Store in buffer while paused
                        pausedLogsRef.current.push(logEntry);
                    } else {
                        setLogs(prev => [...prev.slice(-999), logEntry]);
                    }
                }
            } catch (err) {
                console.error('Failed to parse log:', err);
            }
        };

        eventSource.onerror = () => {
            setConnected(false);
        };

        return () => {
            eventSource.close();
        };
    }, []);

    // Handle un-pause: add buffered logs
    useEffect(() => {
        if (!paused && pausedLogsRef.current.length > 0) {
            setLogs(prev => [...prev, ...pausedLogsRef.current].slice(-1000));
            pausedLogsRef.current = [];
        }
    }, [paused]);

    // Auto scroll to bottom
    useEffect(() => {
        if (autoScroll && terminalRef.current && !paused) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs, autoScroll, paused]);

    // Filter and search logs
    const filteredLogs = logs.filter(log => {
        if (filter !== 'all' && log.level !== filter) return false;
        if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const clearLogs = () => {
        setLogs([]);
        pausedLogsRef.current = [];
    };

    const downloadLogs = () => {
        const content = logs.map(log =>
            `[${new Date(log.timestamp).toISOString()}] [${log.level.toUpperCase()}] ${log.message}`
        ).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bot-logs-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return 'text-red-400';
            case 'warn': return 'text-yellow-400';
            default: return 'text-slate-300';
        }
    };

    const getLevelBg = (level: string) => {
        switch (level) {
            case 'error': return 'bg-red-500/20';
            case 'warn': return 'bg-yellow-500/20';
            default: return '';
        }
    };

    // ANSI escape code to CSS color mapping
    const ansiToColor: Record<string, string> = {
        '30': '#1e1e1e', '31': '#f87171', '32': '#4ade80', '33': '#facc15',
        '34': '#60a5fa', '35': '#c084fc', '36': '#22d3ee', '37': '#e2e8f0',
        '90': '#6b7280', '91': '#fca5a5', '92': '#86efac', '93': '#fde047',
        '94': '#93c5fd', '95': '#d8b4fe', '96': '#67e8f9', '97': '#f8fafc',
    };

    const ansiBgToColor: Record<string, string> = {
        '40': '#1e1e1e', '41': '#dc2626', '42': '#16a34a', '43': '#ca8a04',
        '44': '#2563eb', '45': '#9333ea', '46': '#0891b2', '47': '#e2e8f0',
    };

    // Parse ANSI codes and return styled JSX
    const parseAnsi = (text: string) => {
        // Match ANSI escape sequences
        const ansiRegex = /\x1b\[([0-9;]+)m/g;
        const parts: { text: string; styles: React.CSSProperties }[] = [];

        let lastIndex = 0;
        let currentStyles: React.CSSProperties = {};
        let match;

        // Reset text - remove escape sequences for search/download
        const plainText = text.replace(ansiRegex, '');

        // If no ANSI codes, return plain text
        if (plainText === text) {
            return <span>{text}</span>;
        }

        while ((match = ansiRegex.exec(text)) !== null) {
            // Add text before this match with current styles
            if (match.index > lastIndex) {
                const textBefore = text.slice(lastIndex, match.index);
                if (textBefore) {
                    parts.push({ text: textBefore, styles: { ...currentStyles } });
                }
            }

            // Parse the ANSI codes
            const codes = match[1].split(';');
            for (const code of codes) {
                if (code === '0') {
                    // Reset
                    currentStyles = {};
                } else if (code === '1') {
                    // Bold
                    currentStyles.fontWeight = 'bold';
                } else if (code === '2') {
                    // Dim
                    currentStyles.opacity = 0.7;
                } else if (code === '3') {
                    // Italic
                    currentStyles.fontStyle = 'italic';
                } else if (code === '4') {
                    // Underline
                    currentStyles.textDecoration = 'underline';
                } else if (ansiToColor[code]) {
                    // Foreground color
                    currentStyles.color = ansiToColor[code];
                } else if (ansiBgToColor[code]) {
                    // Background color
                    currentStyles.backgroundColor = ansiBgToColor[code];
                }
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            const remaining = text.slice(lastIndex);
            if (remaining) {
                parts.push({ text: remaining, styles: { ...currentStyles } });
            }
        }

        return (
            <>
                {parts.map((part, i) => (
                    <span key={i} style={part.styles}>{part.text}</span>
                ))}
            </>
        );
    };

    return (
        <div className="h-[calc(100vh-3rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <TerminalIcon className="w-6 h-6 text-green-400" />
                    <h1 className="text-2xl font-bold text-white">Terminal</h1>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                        {connected ? 'Connected' : 'Disconnected'}
                    </span>
                    {paused && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400">
                            Paused ({pausedLogsRef.current.length} buffered)
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Download */}
                    <button
                        onClick={downloadLogs}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title="Download logs"
                    >
                        <Download className="w-4 h-4" />
                    </button>

                    {/* Clear */}
                    <button
                        onClick={clearLogs}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title="Clear logs"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Pause/Resume */}
                    <button
                        onClick={() => setPaused(!paused)}
                        className={`p-2 rounded-lg transition-colors ${paused
                            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
                            }`}
                        title={paused ? 'Resume' : 'Pause'}
                    >
                        {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>

                    {/* Auto scroll toggle */}
                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`p-2 rounded-lg transition-colors ${autoScroll
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                        title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 mb-4">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search logs..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500/50"
                    />
                </div>

                {/* Filter buttons */}
                <div className="flex items-center gap-1">
                    <Filter className="w-4 h-4 text-slate-400 mr-2" />
                    {(['all', 'info', 'warn', 'error'] as const).map((level) => (
                        <button
                            key={level}
                            onClick={() => setFilter(level)}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === level
                                ? level === 'error' ? 'bg-red-500/20 text-red-400'
                                    : level === 'warn' ? 'bg-yellow-500/20 text-yellow-400'
                                        : level === 'info' ? 'bg-blue-500/20 text-blue-400'
                                            : 'bg-purple-500/20 text-purple-400'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                }`}
                        >
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                    ))}
                </div>

                <span className="text-sm text-slate-500">
                    {filteredLogs.length} / {logs.length} logs
                </span>
            </div>

            {/* Terminal */}
            <div
                ref={terminalRef}
                className="flex-1 rounded-xl bg-slate-900/80 border border-white/10 overflow-auto font-mono text-sm"
            >
                {filteredLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-500">
                        {logs.length === 0 ? 'Waiting for logs...' : 'No logs match your filter'}
                    </div>
                ) : (
                    <div className="p-4 space-y-1">
                        {filteredLogs.map((log, i) => (
                            <div
                                key={i}
                                className={`flex gap-4 px-2 py-1 rounded ${getLevelBg(log.level)} hover:bg-white/5`}
                            >
                                <span className="text-slate-500 shrink-0">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={`shrink-0 uppercase w-12 ${getLevelColor(log.level)}`}>
                                    [{log.level}]
                                </span>
                                <span className="break-all">
                                    {parseAnsi(log.message)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
