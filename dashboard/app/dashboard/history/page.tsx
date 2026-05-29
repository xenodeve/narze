'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, memo, useCallback, useMemo, useRef } from 'react';
import { Search, Loader2, Music, History as HistoryIcon, Play, Users, Clock } from 'lucide-react';
import { ListeningSession } from '@/types/session';
import Image from 'next/image';
import { useSSE } from '@/hooks/useSSE';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface Guild {
  id: string;
  name: string;
  icon?: string;
}

function formatDate(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today, ' + date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } else if (diffDays === 1) {
    return 'Yesterday, ' + date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } else if (diffDays < 7) {
    return date.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  } else {
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  }
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}

// Session Card Component (Grid Style like Playlist)
const SessionCard = memo(function SessionCard({
  session,
  guild,
  onClick,
}: {
  session: ListeningSession;
  guild?: Guild;
  onClick: () => void;
}) {
  const thumbnail = session.tracks[0]?.thumbnail;
  const trackCount = session.tracks.length;
  const participantCount = session.participants?.length || 0;

  // Calculate session duration
  const sessionDuration = session.endTime
    ? session.endTime - session.startTime
    : Date.now() - session.startTime;

  return (
    <div
      onClick={onClick}
      className="group card-surface p-4 rounded-xl hover:bg-white/10 transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10"
    >
      {/* Thumbnail */}
      <div className="relative aspect-square rounded-lg overflow-hidden mb-3">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt="Session"
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Music className="h-12 w-12 text-white/50" />
          </div>
        )}

        {/* Play button overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center hover:scale-110 transition-transform">
            <Play className="h-5 w-5 text-white ml-0.5" />
          </button>
        </div>

        {/* Live badge */}
        {session.isActive && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-green-500 text-white text-xs font-medium animate-pulse">
            Live
          </div>
        )}

        {/* Participants Avatars - inside thumbnail bottom left */}
        {session.participants && session.participants.length > 0 && (
          <div className="absolute bottom-2 left-2 flex -space-x-1.5">
            {session.participants.slice(0, 4).map((p, i) => (
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

        {/* Track count badge */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium flex items-center gap-1">
          <Music className="h-3 w-3" />
          {trackCount}
        </div>
      </div>

      {/* Info */}
      <h3 className="font-semibold text-white truncate group-hover:text-purple-400 transition-colors">
        {formatDate(session.startTime)}
      </h3>
      <div className="flex items-center gap-1.5 mt-0.5">
        {guild?.icon && (
          <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0">
            <Image
              src={guild.icon}
              alt={guild.name || ''}
              width={16}
              height={16}
              className="object-cover"
            />
          </div>
        )}
        <p className="text-sm text-slate-400 truncate">
          {session.guildName || guild?.name || 'Unknown Server'}
        </p>
      </div>


      {/* Stats */}
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {participantCount}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(sessionDuration)}
        </span>
      </div>
    </div>
  );
});

// Skeleton Card
const SessionCardSkeleton = memo(function SessionCardSkeleton() {
  return (
    <div className="card-surface p-4 rounded-xl animate-pulse">
      <div className="aspect-square rounded-lg bg-white/10 mb-3" />
      <div className="h-4 w-3/4 bg-white/10 rounded mb-2" />
      <div className="h-3 w-1/2 bg-white/5 rounded mb-2" />
      <div className="flex gap-3 mt-2">
        <div className="h-3 w-12 bg-white/5 rounded" />
        <div className="h-3 w-12 bg-white/5 rounded" />
      </div>
    </div>
  );
});

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState<ListeningSession[]>([]);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Cache key for localStorage
  const cacheKey = `session_history_${user?.discordId}`;

  // Load from cache on mount (SWR - Stale While Revalidate)
  useEffect(() => {
    if (!user?.discordId) return;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { sessions: cachedSessions, guilds: cachedGuilds, timestamp } = JSON.parse(cached);
        // Only use cache if less than 1 hour old
        if (Date.now() - timestamp < 60 * 60 * 1000) {
          setSessions(cachedSessions || []);
          setGuilds(cachedGuilds || []);
          console.log(`[SessionCache] Loaded ${cachedSessions?.length || 0} sessions from cache`);
        }
      }
    } catch (err) {
      console.error('[SessionCache] Failed to load from cache:', err);
    }
  }, [user?.discordId, cacheKey]);

  // Fetch sessions (optimized - single API call for all guilds)
  // Uses SWR: shows cache first, then fetches fresh data and merges
  const fetchHistory = useCallback(async () => {
    if (!user?.discordId) return;

    setLoading(true);
    setError(null);

    try {
      // Single API call to get all sessions from all guilds
      const res = await fetch(`${BOT_API_URL}/api/user/${encodeURIComponent(user.discordId)}/sessions?limit=50`);

      if (res.ok) {
        const data = await res.json();

        // Set guilds from response
        const loadedGuilds: Guild[] = (data.guilds || []).map((g: any) => ({
          id: g.guildId,
          name: g.name,
          icon: g.icon ? `https://cdn.discordapp.com/icons/${g.guildId}/${g.icon}.png` : undefined,
        }));
        setGuilds(loadedGuilds);

        // Merge new sessions with existing (SWR pattern)
        setSessions(prevSessions => {
          const newSessions = data.sessions || [];
          const existingIds = new Set(prevSessions.map((s: ListeningSession) => s.sessionId));

          // Find sessions in API response that aren't in cache
          const sessionsToAdd = newSessions.filter((s: ListeningSession) => !existingIds.has(s.sessionId));

          // Also update existing sessions with fresh data
          const updatedSessions = prevSessions.map((existing: ListeningSession) => {
            const fresh = newSessions.find((s: ListeningSession) => s.sessionId === existing.sessionId);
            return fresh || existing;
          });

          // Combine: updated existing + new sessions
          const merged = [...updatedSessions, ...sessionsToAdd];

          // Sort by startTime (newest first) and remove duplicates
          const uniqueMap = new Map(merged.map((s: ListeningSession) => [s.sessionId, s]));
          const final = Array.from(uniqueMap.values()).sort((a, b) => b.startTime - a.startTime);

          // Save to cache
          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              sessions: final,
              guilds: loadedGuilds,
              timestamp: Date.now()
            }));
            console.log(`[SessionCache] Saved ${final.length} sessions to cache`);
          } catch (err) {
            console.error('[SessionCache] Failed to save to cache:', err);
          }

          return final;
        });
      } else {
        setError('Failed to load history');
      }
    } catch (error: any) {
      // Use warn instead of error to prevent Next.js error overlay
      console.warn('[History] Failed to fetch (bot may be offline):', error?.message || error);
      // Only show error if we have no cached data
      if (sessions.length === 0) {
        setError('Bot appears to be offline. Showing cached data if available.');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.discordId, cacheKey]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchHistory();
  }, [user, authLoading, fetchHistory]);

  // SSE Realtime Updates - subscribe to all user's guilds
  const sseConnectionsRef = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    if (guilds.length === 0) return;

    const connections = sseConnectionsRef.current;

    // Create SSE connection for each guild
    guilds.forEach(guild => {
      if (connections.has(guild.id)) return; // Already connected

      // Include userId for secure server-side session filtering
      const sseUrl = `${BOT_API_URL}/api/guild/${guild.id}/events?userId=${encodeURIComponent(user?.discordId || '')}`;
      const eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'sessionUpdate' || message.type === 'sessionEnd') {
            const updatedSession = message.data as ListeningSession;

            // Only process if user is a participant in this session
            const isParticipant = updatedSession.participants?.some(
              (p: any) => p.userId === user?.discordId
            );

            if (!isParticipant) {
              return; // Ignore sessions user is not part of
            }

            setSessions(prevSessions => {
              const existingIndex = prevSessions.findIndex(s => s.sessionId === updatedSession.sessionId);

              if (existingIndex >= 0) {
                // Update existing session
                const newSessions = [...prevSessions];
                newSessions[existingIndex] = updatedSession;
                return newSessions.sort((a, b) => b.startTime - a.startTime);
              } else {
                // Add new session
                return [updatedSession, ...prevSessions].sort((a, b) => b.startTime - a.startTime);
              }
            });
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      connections.set(guild.id, eventSource);
    });

    // Cleanup on unmount
    return () => {
      connections.forEach(es => es.close());
      connections.clear();
    };
  }, [guilds, user?.discordId]);

  const getGuild = (guildId: string): Guild | undefined => {
    return guilds.find(g => g.id === guildId);
  };

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const query = searchQuery.toLowerCase();
    return sessions.filter(s =>
      s.guildName?.toLowerCase().includes(query) ||
      s.tracks.some(t => t.title?.toLowerCase().includes(query) || t.author?.toLowerCase().includes(query))
    );
  }, [sessions, searchQuery]);

  // Show skeleton while auth is loading
  if (authLoading) {
    return (
      <div className="space-y-6">
        {/* Search Bar Skeleton */}
        <div className="relative max-w-md mx-auto">
          <div className="w-full h-12 rounded-full bg-white/5 animate-pulse" />
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search sessions, songs, or servers"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-full bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Session History ({filteredSessions.length})
        </h2>
      </div>

      {/* Content */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-200 rounded-lg p-4">
          {error}
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="flex items-center justify-center h-[400px]">
          <div className="card-surface p-12 rounded-2xl text-center max-w-lg w-full">
            <div className="mb-6">
              <HistoryIcon className="h-16 w-16 mx-auto text-slate-600" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">
              No Listening Sessions Yet
            </h2>
            <p className="text-slate-400">
              Once you start listening to music with friends, your sessions will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              guild={getGuild(session.guildId)}
              onClick={() => {
                router.push(`/dashboard/history/session/${session.sessionId}?guildId=${session.guildId}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
