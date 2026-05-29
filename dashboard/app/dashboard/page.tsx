'use client';

import { NowPlayingSection } from '@/components/NowPlayingSection';
import { ServerListSection } from '@/components/ServerListSection';
import { QueueSection } from '@/components/QueueSection';
import { BotStatusBadge } from '@/components/BotStatusBadge';
import { VoiceChannelSelectorModal } from '@/components/VoiceChannelSelectorModal';
import { useBotStatus } from '@/hooks/useBotStatus';
import { useAuth } from '@/hooks/useAuth';
import { useControlPermission } from '@/hooks/useControlPermission';
import { useUserSSE } from '@/hooks/useUserSSE';
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ExternalLink, Search, X, Loader2, Music, Video, Disc3, Lock, ListMusic } from 'lucide-react';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// ========== Sub-components ==========

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Get source badge info - support both 'uri' (search) and 'url' (top-played)
function getSourceInfo(track: any): { icon: React.ReactNode; label: string; color: string } {
  const source = track.source?.toLowerCase() || '';
  const trackUrl = (track.uri || track.url || '').toLowerCase();

  if (source === 'spotify' || trackUrl.includes('spotify')) {
    return { icon: <Disc3 className="h-3 w-3" />, label: 'Spotify', color: 'bg-green-600' };
  }
  if (trackUrl.includes('music.youtube.com') || (source === 'youtube' && track.isAudioOnly)) {
    return { icon: <Music className="h-3 w-3" />, label: 'YT Music', color: 'bg-red-600' };
  }
  if (source === 'youtube' || trackUrl.includes('youtube') || trackUrl.includes('youtu.be')) {
    return { icon: <Video className="h-3 w-3" />, label: 'YouTube', color: 'bg-red-500' };
  }
  return { icon: <Music className="h-3 w-3" />, label: 'Audio', color: 'bg-slate-600' };
}

// Bot Info Section - แยก primitive values เพื่อให้ memo ทำงานได้ถูกต้อง
const BotInfoSection = memo(function BotInfoSection({
  isOnline,
  totalServers,
  activePlayersCount,
  uptime,
}: {
  isOnline: boolean;
  totalServers: number;
  activePlayersCount: number;
  uptime: string;
}) {
  return (
    <div className="card-surface p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Bot Info</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Status</span>
          <span className="text-white font-semibold">
            {isOnline ? '🟢 Online' : '🔴 Offline'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Total Servers</span>
          <span className="text-white font-semibold">{totalServers}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Active Players</span>
          <span className="text-white font-semibold">{activePlayersCount}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Uptime</span>
          <span className="text-white font-semibold">{uptime}</span>
        </div>
      </div>
    </div>
  );
});

// Guild Selector - แยกออกมาเพื่อลด re-render
const GuildSelector = memo(function GuildSelector({
  selectedGuildId,
  guilds,
  loading,
  onSelectGuild
}: {
  selectedGuildId: string;
  guilds: any[];
  loading: boolean;
  onSelectGuild: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = (e: Event) => {
      // Don't close if scrolling inside the dropdown
      if (dropdownRef.current?.contains(e.target as Node)) {
        return;
      }
      // Update dropdown position when page scrolls
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 8,
          left: rect.left,
          width: rect.width
        });
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  const selectedGuild = guilds.find(g => g.guildId === selectedGuildId);

  return (
    <div className="card-section flex items-center gap-3 p-4">
      <label className="text-slate-300 text-sm">Current Server</label>
      <div className="relative w-full max-w-md">
        {/* Trigger Button */}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full bg-white/5 border border-white/10 text-white px-4 py-3 pr-10 rounded-xl 
                     hover:border-purple-500/60 transition-colors cursor-pointer shadow-inner shadow-black/30 
                     backdrop-blur-md text-left flex items-center justify-between
                     ${isOpen ? 'ring-2 ring-purple-500 border-transparent' : ''}`}
        >
          <span className={selectedGuild ? 'text-white' : 'text-slate-400'}>
            {selectedGuild ? (
              <>
                {selectedGuild.guildName} {selectedGuild.isPlaying ? '🎵' : ''}
              </>
            ) : 'Select a server'}
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu - Rendered as Portal */}
        {isOpen && typeof document !== 'undefined' && createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-[#0d0d0d]/50 backdrop-blur-2xl border border-white/20 rounded-xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              zIndex: 9999,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* No selection option */}
            <button
              type="button"
              onClick={() => {
                onSelectGuild('');
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2
                         ${!selectedGuildId ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400'}`}
            >
              <span className="text-slate-500">—</span>
              <span>Select a server</span>
            </button>

            {/* Guild list */}
            {guilds.map((guild: any) => (
              <button
                key={guild.guildId}
                type="button"
                onClick={() => {
                  onSelectGuild(guild.guildId);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-3
                           ${selectedGuildId === guild.guildId ? 'bg-purple-500/20 text-purple-300' : 'text-white'}`}
              >
                {/* Guild icon */}
                {guild.guildIcon ? (
                  <img src={guild.guildIcon} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-purple-600/50 flex items-center justify-center text-xs text-white">
                    {guild.guildName?.charAt(0) || '?'}
                  </div>
                )}
                <span className="flex-1 truncate">{guild.guildName}</span>
                {guild.isPlaying && <span className="text-green-400">🎵</span>}
              </button>
            ))}

            {guilds.length === 0 && (
              <div className="px-4 py-3 text-center text-slate-500">
                No servers available
              </div>
            )}
          </div>,
          document.body
        )}
      </div>
      {guilds.length === 0 && !loading && (
        <span className="text-slate-500 text-sm">No active players</span>
      )}
    </div>
  );
});

// ========== Main Component ==========

export default function DashboardPage() {
  // Try to restore selectedGuildId from sessionStorage for smoother navigation
  const [selectedGuildId, setSelectedGuildId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('selectedGuildId') || '';
    }
    return '';
  });
  const [guilds, setGuilds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { status: botStatus } = useBotStatus();
  const { user } = useAuth();
  const { canControl, canView, reason: controlReason } = useControlPermission(selectedGuildId);

  // User SSE for real-time server list updates
  const { guilds: sseGuilds, connected: sseConnected, loading: sseLoading } = useUserSSE(user?.discordId || null);

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchClosing, setIsSearchClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const [topPlayedTracks, setTopPlayedTracks] = useState<any[]>([]);
  const [topPlayedLoading, setTopPlayedLoading] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<{
    name: string;
    trackCount: number;
    thumbnail: string | null;
    url: string;
  } | null>(null);

  // Voice channel selector modal state
  const [isVoiceChannelModalOpen, setIsVoiceChannelModalOpen] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<any>(null);

  const isFirstLoad = useRef(true);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ดึงข้อมูล guilds ที่ user มี permission ควบคุม
  const fetchGuilds = useCallback(async () => {
    // ต้องรอให้ user load เสร็จก่อน
    if (!user?.discordId) {
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
      return;
    }

    // Only show loading on first load, not on refresh
    if (isFirstLoad.current) {
      setLoading(true);
    }

    try {
      // ใช้ GET กับ query param userId เพื่อ filter guilds ที่ user มี permission
      const response = await fetch(`${BOT_API_URL}/api/guilds?userId=${encodeURIComponent(user.discordId)}`);

      if (response.ok) {
        const data = await response.json();

        const guildList = data.guilds || [];
        setGuilds((prev) => {
          // Deep compare to avoid unnecessary updates
          if (prev.length === guildList.length &&
            prev.every((g, i) =>
              g.guildId === guildList[i]?.guildId &&
              g.isPlaying === guildList[i]?.isPlaying
            )) {
            return prev;
          }
          return guildList;
        });

        // เลือก guild แรกถ้ายังไม่ได้เลือก
        setSelectedGuildId((prev) => {
          if (guildList.length > 0 && !prev) {
            return guildList[0].guildId;
          }
          return prev;
        });
      }
    } catch (error: any) {
      // Silently handle network errors (bot offline) - don't spam console
      if (error?.name !== 'TypeError' && !error?.message?.includes('fetch')) {
        console.error('Failed to fetch guilds:', error);
      }
      // Clear guilds when bot is offline
      setGuilds((prev) => prev.length === 0 ? prev : []);
    } finally {
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
    }
  }, [user?.discordId]);

  useEffect(() => {
    // Only use polling as fallback when SSE is not connected
    if (sseConnected) {
      // SSE is connected, use SSE data
      return;
    }

    fetchGuilds();

    // Refresh guilds every 10 seconds only when SSE is disconnected
    const interval = setInterval(fetchGuilds, 10000);
    return () => clearInterval(interval);
  }, [fetchGuilds, sseConnected]);

  // Sync SSE guilds to local state
  useEffect(() => {
    if (sseConnected && sseGuilds.length > 0) {
      setGuilds(sseGuilds);
      setLoading(false);

      // Auto-select first guild if none selected
      if (!selectedGuildId && sseGuilds.length > 0) {
        setSelectedGuildId(sseGuilds[0].guildId);
      }
    }
  }, [sseGuilds, sseConnected, selectedGuildId]);

  // Save selectedGuildId to sessionStorage for restoration on page navigation
  useEffect(() => {
    if (selectedGuildId) {
      sessionStorage.setItem('selectedGuildId', selectedGuildId);
    }
  }, [selectedGuildId]);

  // Load top played tracks when modal opens
  useEffect(() => {
    if (!isSearchOpen) return;

    const loadTopPlayed = async () => {
      const userIdForHistory = user?.discordId || user?.id;
      if (!userIdForHistory) return;

      setTopPlayedLoading(true);

      try {
        // Use global user history API (not guild-specific)
        const res = await fetch(`/api/player/user-history?userId=${encodeURIComponent(userIdForHistory)}`);
        const json = await res.json();

        if (res.ok) {
          const items = Array.isArray(json.tracks) ? json.tracks : [];
          setTopPlayedTracks(items.slice(0, 6)); // Show up to 6 tracks
        } else {
          setTopPlayedTracks([]);
        }
      } catch (error: any) {
        if (error?.name !== 'TypeError' && !error?.message?.includes('fetch')) {
          console.error('Failed to load top played:', error);
        }
        setTopPlayedTracks([]);
      } finally {
        setTopPlayedLoading(false);
      }
    };

    loadTopPlayed();
  }, [isSearchOpen, user?.discordId, user?.id]);

  // Debounced search when modal open
  useEffect(() => {
    if (!isSearchOpen) return;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Clear results if no guild or empty query
    if (!selectedGuildId || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setPlaylistInfo(null);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);

      try {
        const url = `/api/player/${selectedGuildId}/search?q=${encodeURIComponent(searchQuery)}${user?.discordId ? `&userId=${encodeURIComponent(user.discordId)}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok) {
          setSearchResults(data.tracks || []);
          setPlaylistInfo(data.playlistInfo || null);
        } else {
          setSearchError(data.error || 'Search failed');
          setSearchResults([]);
          setPlaylistInfo(null);
        }
      } catch (error: any) {
        if (error?.name !== 'TypeError' && !error?.message?.includes('fetch')) {
          console.error('Search failed:', error);
        }
        setSearchError('Network error');
        setSearchResults([]);
        setPlaylistInfo(null);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, selectedGuildId, isSearchOpen, user?.discordId]);

  // Callback สำหรับ GuildSelector
  const handleSelectGuild = useCallback((id: string) => {
    setSelectedGuildId(id);
  }, []);

  // Close search modal with animation
  const handleCloseSearch = useCallback(() => {
    setIsSearchClosing(true);
    setTimeout(() => {
      setIsSearchOpen(false);
      setIsSearchClosing(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setTopPlayedTracks([]);
    }, 200);
  }, []);

  // Internal function to play track with optional voice channel
  const playTrackWithChannel = useCallback(async (track: any, targetVoiceChannelId?: string) => {
    if (!selectedGuildId || !user?.discordId) return;

    // For playlists, use the playlist URL (uri) as the trackId to match the button check
    const trackId = track.isPlaylist
      ? (track.uri || track.url)
      : (track.identifier || track.uri || track.url || track.title);
    setAddingTrackId(trackId);
    setSearchError(null);

    try {
      let playValue: string;
      const trackUrl = track.uri || track.url;
      const trackArtist = track.author || track.artist || '';

      if (trackUrl) {
        const urlMatch = trackUrl.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          playValue = urlMatch[0];
        } else if (trackUrl.startsWith('http')) {
          playValue = trackUrl;
        } else {
          playValue = trackUrl;
        }
      } else if (track.identifier && track.source) {
        if (track.source === 'spotify') {
          playValue = `https://open.spotify.com/track/${track.identifier}`;
        } else if (track.source === 'youtube' || track.source === 'youtube music') {
          playValue = `https://www.youtube.com/watch?v=${track.identifier}`;
        } else {
          playValue = `${track.title} ${trackArtist}`.slice(0, 100);
        }
      } else {
        playValue = `${track.title} ${trackArtist}`.slice(0, 100);
      }

      const requestBody: any = {
        action: 'play',
        value: playValue,
        user: { username: user.username, discordId: user.discordId },
      };

      // Add targetVoiceChannelId if provided (owner selected a channel)
      if (targetVoiceChannelId) {
        requestBody.targetVoiceChannelId = targetVoiceChannelId;
      }

      const res = await fetch(`/api/player/${selectedGuildId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();
      if (!res.ok) {
        // Check if we need to show voice channel selector
        if (data.requiresVoiceChannel && data.canSelectChannel) {
          // User is owner but not in voice channel - show selector
          // Do NOT optimistic update here - wait for voice channel selection
          setPendingTrack(track);
          setIsVoiceChannelModalOpen(true);
          setAddingTrackId(null);
          return;
        }
        setSearchError(data.error || 'Failed to add track');
        setAddingTrackId(null);
      } else {
        // Success - perform optimistic update NOW (after confirming no voice channel selection needed)
        // Only update current track optimistically - let SSE handle queue updates to avoid duplicates
        const hasCurrentTrack = typeof window !== 'undefined' && (window as any).__nowPlayingHasTrack?.();
        const hasQueueTracks = typeof window !== 'undefined' && (window as any).__queueHasTracks?.();

        if (!hasCurrentTrack && !hasQueueTracks) {
          // No track playing, no queue - this will be the current track
          if ((window as any).__nowPlayingSetCurrent) {
            (window as any).__nowPlayingSetCurrent({
              title: track.title,
              author: track.author || track.artist || 'Unknown Artist',
              duration: track.duration || 0,
              thumbnail: track.thumbnail,
            });
          }
        }
        // Queue updates are handled by SSE (queueUpdate event) to avoid duplicates

        setTimeout(() => {
          setAddingTrackId(null);
        }, 800);
      }
    } catch (error: any) {
      if (error?.name !== 'TypeError' && !error?.message?.includes('fetch')) {
        console.error('Add track failed:', error);
      }
      setSearchError('Network error');
      setAddingTrackId(null);
    }
  }, [selectedGuildId, user?.discordId, user?.username]);

  // Add track to queue via player API
  const handleAddTrack = useCallback(async (track: any) => {
    if (!selectedGuildId) {
      setSearchError('Please select a server first');
      return;
    }
    if (!user?.discordId) {
      setSearchError('Please sign in to control the bot');
      return;
    }

    // Check if user is owner (can bypass voice channel requirement)
    const selectedGuild = guilds.find(g => g.guildId === selectedGuildId);
    const isOwner = selectedGuild?.isOwner || false;

    // If user can control or is owner, try to play
    if (canControl || isOwner) {
      await playTrackWithChannel(track);
    } else {
      // Non-owner without control - show error
      setSearchError(controlReason || 'You must be in the same voice channel as the bot to add songs');
    }
  }, [selectedGuildId, user?.discordId, guilds, canControl, controlReason, playTrackWithChannel]);

  // Handle voice channel selection from modal
  const handleVoiceChannelSelect = useCallback(async (channelId: string) => {
    if (pendingTrack) {
      await playTrackWithChannel(pendingTrack, channelId);
      setPendingTrack(null);
    }
    setIsVoiceChannelModalOpen(false);
  }, [pendingTrack, playTrackWithChannel]);

  // Close voice channel modal
  const handleVoiceChannelModalClose = useCallback(() => {
    setIsVoiceChannelModalOpen(false);
    setPendingTrack(null);
    setAddingTrackId(null);
  }, []);

  // Handle queue length changes for realtime updates in server list
  const handleQueueLengthChange = useCallback((length: number) => {
    if (!selectedGuildId) return;
    setGuilds(prev => prev.map(guild =>
      guild.guildId === selectedGuildId
        ? { ...guild, queueLength: length }
        : guild
    ));
  }, [selectedGuildId]);

  // Memoize active players count - count guilds where music is currently playing
  const activePlayersCount = useMemo(() => guilds.filter(g => g.isPlaying).length, [guilds]);

  // Memoize bot info values - จะ re-render เฉพาะเมื่อค่าจริงๆ เปลี่ยน
  const isOnline = botStatus?.state === 'online';
  const totalServers = botStatus?.guilds || 0;

  // Format uptime เป็น string และ memoize - จะเปลี่ยนเฉพาะเมื่อหน่วยเปลี่ยน (นาที/ชั่วโมง)
  const uptimeString = useMemo(() => {
    if (!botStatus?.uptime) return 'N/A';
    return formatUptime(botStatus.uptime);
  }, [botStatus?.uptime ? Math.floor(botStatus.uptime / 60000) : 0]); // เปลี่ยนทุกนาที ไม่ใช่ทุกวินาที

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="card-surface p-6 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Control center</p>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-semibold text-white">Music Dashboard</h1>
                {botStatus && <BotStatusBadge status={botStatus.state} />}
              </div>
              <p className="text-sm text-slate-400 max-w-2xl">Pick a server, queue songs, and manage playback from a clean card-driven layout inspired by the Rythm interface.</p>
            </div>
            <a
              href="https://resume-web-steel.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="pill-button border-white/10 bg-white/5"
            >
              <ExternalLink className="h-4 w-4" />
              Xeno Developer
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.4fr,1fr] items-center relative z-20">
            <GuildSelector
              selectedGuildId={selectedGuildId}
              guilds={guilds}
              loading={loading}
              onSelectGuild={handleSelectGuild}
            />

            <div className="flex flex-wrap justify-end gap-3">
              <button
                onClick={() => setIsSearchOpen(true)}
                disabled={!selectedGuildId}
                className={`pill-button ${selectedGuildId
                  ? 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-500 border-transparent shadow-lg shadow-purple-900/30'
                  : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                  }`}
              >
                <Search className="h-4 w-4" />
                Search songs
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <NowPlayingSection guildId={selectedGuildId} onPlayTrack={handleAddTrack} botStatus={botStatus?.state} />

            <QueueSection
              key={selectedGuildId}
              guildId={selectedGuildId}
              onOptimisticAdd={(track) => {
                // Callback for optimistic updates
              }}
              onQueueLengthChange={handleQueueLengthChange}
              canControl={canControl}
            />
          </div>

          <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
            <ServerListSection guilds={guilds} loading={loading} onSelectGuild={handleSelectGuild} selectedGuildId={selectedGuildId} />
            <BotInfoSection
              isOnline={isOnline}
              totalServers={totalServers}
              activePlayersCount={activePlayersCount}
              uptime={uptimeString}
            />
          </div>
        </div>
      </div>

      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${isSearchClosing ? 'opacity-0' : 'animate-backdropFadeIn'
              }`}
            onClick={handleCloseSearch}
          />

          <div className={`relative z-10 w-full max-w-5xl card-surface overflow-hidden transition-all duration-200 ${isSearchClosing ? 'opacity-0 scale-95 translate-y-4' : 'animate-modalSlideUp'
            }`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-white">
                <Search className="h-5 w-5 text-purple-400" />
                <span className="font-semibold">Search music</span>
              </div>
              <button
                onClick={handleCloseSearch}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close search"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={selectedGuildId ? 'Search songs, artists, or paste a link' : 'Select a server to search'}
                disabled={!selectedGuildId}
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 transition-all duration-200 backdrop-blur-md"
              />

              {searchError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded">
                  {searchError}
                </div>
              )}

              <div className="max-h-[560px] overflow-y-auto overflow-x-hidden">
                {searchLoading && (
                  <div className="flex items-center gap-2 text-slate-400 py-3 animate-fadeIn">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching...</span>
                  </div>
                )}

                {!searchLoading && searchResults.length === 0 && searchQuery && (
                  <div className="text-slate-500 text-sm py-3 animate-fadeIn">No results</div>
                )}

                {/* Search Results - card layout with top result */}
                {searchQuery.trim() && searchResults.length > 0 && (
                  <div className={`transition-opacity duration-200 ${searchLoading ? 'opacity-30' : 'opacity-100'}`}>
                    <div className="grid grid-cols-1 md:grid-cols-[340px,1fr] gap-4 items-start">
                      {/* Top Result / Playlist - sticky when scrolling */}
                      <div className="card-surface relative overflow-hidden p-6 flex flex-col gap-4 bg-white/5 backdrop-blur-xl self-start h-fit sticky top-4">
                        {(() => {
                          const top = searchResults[0];
                          const sourceInfo = getSourceInfo(top);

                          // Use playlist info if available, otherwise use track info
                          const displayThumbnail = playlistInfo?.thumbnail || top.thumbnail;
                          const displayTitle = playlistInfo?.name || top.title;
                          const displaySubtitle = playlistInfo
                            ? `${playlistInfo.trackCount} tracks`
                            : top.author;
                          const isPlaylistMode = !!playlistInfo;

                          return (
                            <>
                              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-white/10">
                                {displayThumbnail ? (
                                  <img src={displayThumbnail} alt={displayTitle} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="flex items-center justify-center w-full h-full">
                                    <Music className="h-10 w-10 text-slate-500" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                                <div className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
                                  {sourceInfo.icon}
                                  <span>{sourceInfo.label}</span>
                                </div>
                                {isPlaylistMode && (
                                  <div className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-purple-600/80 px-2 py-1 text-xs text-white backdrop-blur">
                                    <ListMusic className="h-3 w-3" />
                                    <span>Playlist</span>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                  {isPlaylistMode ? 'Playlist' : 'Top Result'}
                                </p>
                                <div className="flex items-center gap-2">
                                  <p className="text-white font-semibold truncate text-lg">{displayTitle}</p>
                                  {!isPlaylistMode && top.isVideo && (
                                    <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">VIDEO</span>
                                  )}
                                </div>
                                <p className="text-slate-300 text-sm truncate">{displaySubtitle}</p>
                              </div>
                              <button
                                onClick={() => {
                                  // When in playlist mode, pass the playlist URL instead of single track
                                  if (isPlaylistMode && playlistInfo?.url) {
                                    handleAddTrack({
                                      ...top,
                                      uri: playlistInfo.url,
                                      url: playlistInfo.url,
                                      title: playlistInfo.name,
                                      isPlaylist: true
                                    });
                                  } else {
                                    handleAddTrack(top);
                                  }
                                }}
                                disabled={addingTrackId === (isPlaylistMode ? playlistInfo?.url : (top.identifier || top.uri || top.title))}
                                className={`pill-button w-fit px-5 py-2 text-sm font-semibold ${addingTrackId === (isPlaylistMode ? playlistInfo?.url : (top.identifier || top.uri || top.title))
                                  ? 'bg-green-600 text-white border-transparent'
                                  : 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-500 border-transparent text-white shadow-lg shadow-purple-900/40'
                                  }`}
                              >
                                {addingTrackId === (isPlaylistMode ? playlistInfo?.url : (top.identifier || top.uri || top.title))
                                  ? '✓ Added'
                                  : isPlaylistMode ? 'Play Playlist' : 'Play Top Result'}
                              </button>
                            </>
                          );
                        })()}
                      </div>

                      {/* Other songs - when playlist mode, show ALL tracks since top result shows playlist info */}
                      <div className="card-surface p-2 divide-y divide-white/10 bg-white/5">
                        {(playlistInfo ? searchResults : searchResults.slice(1)).map((track, index) => (
                          <div
                            key={`${track.identifier || track.uri || track.title}-${index}`}
                            className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/10 transition-colors"
                            style={{ animationDelay: `${index * 40}ms` }}
                          >
                            <div className="relative w-12 h-12 rounded-md bg-white/10 flex items-center justify-center overflow-hidden">
                              {track.thumbnail ? (
                                <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                              ) : (
                                <Music className="h-5 w-5 text-slate-400" />
                              )}
                              {(() => {
                                const sourceInfo = getSourceInfo(track);
                                return (
                                  <div className={`absolute bottom-0 right-0 ${sourceInfo.color} rounded-tl-md px-1 py-0.5`}>
                                    {sourceInfo.icon}
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <p className="text-white font-semibold line-clamp-2 break-words">{track.title}</p>
                                {track.isVideo && (
                                  <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">VIDEO</span>
                                )}
                              </div>
                              <p className="text-slate-400 text-sm truncate">{track.author}</p>
                            </div>
                            <button
                              onClick={() => handleAddTrack(track)}
                              disabled={!playlistInfo && addingTrackId === (track.identifier || track.uri || track.title)}
                              className={`px-3 py-1.5 rounded-lg text-white transition-all duration-200 ${!playlistInfo && addingTrackId === (track.identifier || track.uri || track.title)
                                ? 'bg-green-600 scale-95'
                                : 'bg-purple-600 hover:bg-purple-500 hover:scale-105'
                                }`}
                            >
                              {!playlistInfo && addingTrackId === (track.identifier || track.uri || track.title) ? '✓ Added' : 'Add'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Played Tracks - Show when not searching */}
                {!searchQuery.trim() && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2">
                      <h3 className="text-sm font-semibold text-slate-300">เพลงที่คุณฟังบ่อย</h3>
                      {topPlayedLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    </div>

                    {!topPlayedLoading && topPlayedTracks.length === 0 && (
                      <div className="text-slate-500 text-sm py-4 text-center">
                        ยังไม่มีประวัติการฟังเพลง
                      </div>
                    )}

                    {!topPlayedLoading && topPlayedTracks.length > 0 && (
                      <div className="transition-opacity duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-[340px,1fr] gap-4 items-start">
                          {/* Top played card */}
                          <div className="card-surface relative overflow-hidden p-6 flex flex-col gap-4 bg-white/5 backdrop-blur-xl self-start h-fit">
                            {(() => {
                              const top = topPlayedTracks[0];
                              const sourceInfo = getSourceInfo(top);
                              return (
                                <>
                                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-white/10">
                                    {top.thumbnail ? (
                                      <img src={top.thumbnail} alt={top.title} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="flex items-center justify-center w-full h-full">
                                        <Music className="h-10 w-10 text-slate-500" />
                                      </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                                    <div className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
                                      {sourceInfo.icon}
                                      <span>{sourceInfo.label}</span>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Top Played</p>
                                    <div className="flex items-center gap-2">
                                      <p className="text-white font-semibold truncate text-lg">{top.title}</p>
                                      {top.isVideo && (
                                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">VIDEO</span>
                                      )}
                                    </div>
                                    <p className="text-slate-300 text-sm truncate">{top.author || top.artist}</p>
                                  </div>
                                  <button
                                    onClick={() => handleAddTrack(top)}
                                    disabled={addingTrackId === (top.identifier || top.uri || top.url || top.title)}
                                    className={`pill-button w-fit px-5 py-2 text-sm font-semibold ${addingTrackId === (top.identifier || top.uri || top.url || top.title)
                                      ? 'bg-green-600 text-white border-transparent'
                                      : 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-500 border-transparent text-white shadow-lg shadow-purple-900/40'
                                      }`}
                                  >
                                    {addingTrackId === (top.identifier || top.uri || top.url || top.title) ? '✓ Added' : 'Play Top Result'}
                                  </button>
                                </>
                              );
                            })()}
                          </div>

                          {/* Other played songs */}
                          <div className="card-surface p-2 divide-y divide-white/10 bg-white/5">
                            {topPlayedTracks.slice(1).map((track, index) => (
                              <div
                                key={`${track.identifier || track.uri || track.title}-${index}`}
                                className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/10 transition-colors"
                                style={{ animationDelay: `${index * 40}ms` }}
                              >
                                <div className="relative w-12 h-12 rounded-md bg-white/10 flex items-center justify-center overflow-hidden">
                                  {track.thumbnail ? (
                                    <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <Music className="h-5 w-5 text-slate-400" />
                                  )}
                                  {(() => {
                                    const sourceInfo = getSourceInfo(track);
                                    return (
                                      <div className={`absolute bottom-0 right-0 ${sourceInfo.color} rounded-tl-md px-1 py-0.5`}>
                                        {sourceInfo.icon}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-white font-semibold truncate">{track.title}</p>
                                    {track.isVideo && (
                                      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">VIDEO</span>
                                    )}
                                  </div>
                                  <p className="text-slate-400 text-sm truncate">
                                    {track.author || track.artist}
                                    {track.playCount && (
                                      <span className="text-slate-500 ml-2">• {track.playCount} plays</span>
                                    )}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleAddTrack(track)}
                                  disabled={addingTrackId === (track.identifier || track.uri || track.url || track.title)}
                                  className={`px-3 py-1.5 rounded-lg text-white transition-all duration-200 ${addingTrackId === (track.identifier || track.uri || track.url || track.title)
                                    ? 'bg-green-600 scale-95'
                                    : 'bg-purple-600 hover:bg-purple-500 hover:scale-105'
                                    }`}
                                >
                                  {addingTrackId === (track.identifier || track.uri || track.url || track.title) ? '✓ Added' : 'Add'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voice Channel Selector Modal */}
      <VoiceChannelSelectorModal
        isOpen={isVoiceChannelModalOpen}
        guildId={selectedGuildId}
        onClose={handleVoiceChannelModalClose}
        onSelect={handleVoiceChannelSelect}
      />
    </div>
  );
}
