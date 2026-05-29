'use client';

import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Hash, Check, Loader2, AlertCircle, Crown, Search, X, ChevronDown, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSSE } from '@/hooks/useSSE';

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface GuildSettingsData {
  guildId: string;
  guildName?: string;
  ownerId: string;
  musicChannelId?: string;
}

interface GuildSettingsProps {
  guildId?: string;
}

export const GuildSettingsSection = memo(function GuildSettingsSection({ guildId }: GuildSettingsProps) {
  const { user } = useAuth();
  const { data: sseData } = useSSE(guildId || null);
  const [settings, setSettings] = useState<GuildSettingsData | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);

  // Search state for channel dropdown
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownButtonRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Owner info state
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [copiedOwnerId, setCopiedOwnerId] = useState(false);

  // Handle SSE settingsUpdate event
  useEffect(() => {
    if (!sseData || sseData.type !== 'settingsUpdate') return;
    console.log('[GuildSettings] Settings update received via SSE');
    setSettings(sseData.data);
    setSelectedChannel(sseData.data.musicChannelId || '');
    if (user?.discordId === sseData.data.ownerId) {
      setIsOwner(true);
    }
  }, [sseData, user?.discordId]);

  // Fetch settings and channels
  useEffect(() => {
    if (!guildId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch settings and channels in parallel
        const [settingsRes, channelsRes] = await Promise.all([
          fetch(`/api/guild/${guildId}/settings`),
          fetch(`/api/guild/${guildId}/channels`)
        ]);

        if (settingsRes.ok) {
          // Check if response is JSON
          const contentType = settingsRes.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn('[GuildSettings] Bot returned non-JSON response - bot may be offline');
            return;
          }

          const settingsData = await settingsRes.json();
          setSettings(settingsData);
          setSelectedChannel(settingsData.musicChannelId || '');

          // Check if current user is owner
          if (user?.discordId === settingsData.ownerId) {
            setIsOwner(true);
          }

          // Fetch owner username
          if (settingsData.ownerId) {
            try {
              const ownerRes = await fetch(`/api/guild/${guildId}/member/${settingsData.ownerId}`);
              const ownerContentType = ownerRes.headers.get('content-type');
              if (ownerRes.ok && ownerContentType?.includes('application/json')) {
                const ownerData = await ownerRes.json();
                setOwnerUsername(ownerData.username || ownerData.displayName || null);
              }
            } catch {
              // Silent fail - will show ID instead
            }
          }
        } else if (settingsRes.status === 404) {
          // No settings found - bot may not have saved settings for this guild yet
          setSettings(null);
        }

        if (channelsRes.ok) {
          const channelsContentType = channelsRes.headers.get('content-type');
          if (channelsContentType?.includes('application/json')) {
            const channelsData = await channelsRes.json();
            setChannels(channelsData.channels || []);
          }
        }
      } catch (err) {
        // Silent fail for network errors
        if (err instanceof Error && err.name !== 'TypeError') {
          console.error('Failed to fetch guild settings:', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [guildId, user?.discordId]);

  // Save music channel
  const handleSaveChannel = useCallback(async () => {
    if (!guildId || !user) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/guild/${guildId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          musicChannelId: selectedChannel || null,
          user: { username: user.username, discordId: user.discordId }
        })
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('[GuildSettings] Bot returned non-JSON response - bot may be offline');
        setError('Bot appears to be offline');
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setSuccess('บันทึกการตั้งค่าสำเร็จ!');
        setSettings(data.settings);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'TypeError') {
        setError('Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  }, [guildId, selectedChannel, user]);

  // Filter channels based on search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const query = searchQuery.toLowerCase();
    return channels.filter(channel =>
      channel.name.toLowerCase().includes(query)
    );
  }, [channels, searchQuery]);

  // Get selected channel name
  const selectedChannelName = useMemo(() => {
    if (!selectedChannel) return null;
    const channel = channels.find(c => c.id === selectedChannel);
    return channel?.name || null;
  }, [selectedChannel, channels]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownButtonRef.current && !dropdownButtonRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update dropdown position on scroll
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (dropdownButtonRef.current) {
        const rect = dropdownButtonRef.current.getBoundingClientRect();
        setDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isDropdownOpen]);

  // Update dropdown position when opening
  useEffect(() => {
    if (isDropdownOpen && dropdownButtonRef.current) {
      const rect = dropdownButtonRef.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [isDropdownOpen]);

  // Handle channel selection
  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannel(channelId);
    setIsDropdownOpen(false);
    setSearchQuery('');
  }, []);

  if (!guildId) {
    return (
      <div className="bg-white/5 rounded-xl p-6 border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-2 text-slate-400">
          <Settings className="h-5 w-5" />
          <span>เลือก server เพื่อดูการตั้งค่า</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden animate-pulse backdrop-blur-md">
        {/* Header skeleton */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-white/10 rounded" />
            <div className="h-5 w-28 bg-white/10 rounded" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="p-4 space-y-4">
          {/* Owner info skeleton */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 bg-white/5 rounded" />
            <div className="h-6 w-32 bg-white/10 rounded" />
          </div>

          {/* Channel selection skeleton */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-white/5 rounded" />
              <div className="h-4 w-36 bg-white/10 rounded" />
            </div>
            <div className="h-3 w-56 bg-white/5 rounded" />
            <div className="h-10 w-full bg-white/10 rounded-lg" />
          </div>

          {/* Save button skeleton */}
          <div className="h-10 w-full bg-white/10 rounded-lg" />

          {/* Permission info skeleton */}
          <div className="bg-white/5 p-3 rounded-lg space-y-2">
            <div className="h-4 w-40 bg-white/10 rounded" />
            <div className="space-y-1.5 ml-2">
              <div className="h-3 w-64 bg-white/5 rounded" />
              <div className="h-3 w-72 bg-white/5 rounded" />
              <div className="h-3 w-60 bg-white/5 rounded" />
              <div className="h-3 w-56 bg-white/5 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 backdrop-blur-md">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-purple-400" />
          <h3 className="font-semibold text-white">ตั้งค่า Server</h3>
        </div>
        {isOwner && (
          <div className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full">
            <Crown className="h-3 w-3" />
            <span>Owner</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Owner info */}
        {settings && (
          <div className="text-sm text-slate-400 flex items-center gap-2">
            <span>Bot Owner: </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(settings.ownerId);
                setCopiedOwnerId(true);
                setTimeout(() => setCopiedOwnerId(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 text-slate-300 bg-white/10 px-2 py-1 rounded
                         hover:bg-white/20 transition-colors cursor-pointer group"
              title={`คลิกเพื่อคัดลอก ID: ${settings.ownerId}`}
            >
              <span>{ownerUsername || settings.ownerId}</span>
              {copiedOwnerId ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
              )}
            </button>
            {copiedOwnerId && (
              <span className="text-xs text-green-400">คัดลอกแล้ว!</span>
            )}
          </div>
        )}

        {/* Music Channel Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Hash className="h-4 w-4 text-slate-500" />
            Music Text Channel
          </label>
          <p className="text-xs text-slate-500">
            เลือก channel ที่บอทจะส่งข้อความเมื่อมีเพลงเล่น
          </p>

          {/* Searchable Dropdown */}
          <div className="relative" ref={dropdownButtonRef}>
            {/* Selected/Search Input */}
            <div
              onClick={() => {
                if (!saving) {
                  setIsDropdownOpen(true);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }
              }}
              className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 
                         flex items-center justify-between cursor-pointer
                         hover:border-white/20 transition-colors
                         ${saving ? 'opacity-50 cursor-not-allowed' : ''}
                         ${isDropdownOpen ? 'ring-2 ring-purple-500 border-transparent' : ''}`}
            >
              {isDropdownOpen ? (
                <div className="flex items-center gap-2 flex-1">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหา channel..."
                    className="bg-transparent border-none outline-none text-white placeholder-slate-400 flex-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <span className={selectedChannel ? 'text-white' : 'text-slate-400'}>
                  {selectedChannelName ? `#${selectedChannelName}` : 'ไม่ระบุ (ใช้ channel ที่สั่งเพลง)'}
                </span>
              )}
              <div className="flex items-center gap-1">
                {selectedChannel && !isDropdownOpen && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedChannel('');
                    }}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <X className="h-3 w-3 text-slate-400" />
                  </button>
                )}
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Dropdown List with Portal */}
            {isDropdownOpen && typeof document !== 'undefined' && createPortal(
              <div
                ref={dropdownRef}
                className="fixed bg-[#0d0d0d]/30 backdrop-blur-2xl border border-white/20 rounded-xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden"
                style={{
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  width: dropdownPosition.width,
                  zIndex: 9999,
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
              >
                {/* No selection option */}
                <div
                  onClick={() => handleSelectChannel('')}
                  className={`px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-white/10 transition-colors
                             ${!selectedChannel ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400'}`}
                >
                  <span className="text-slate-500">—</span>
                  <span>ไม่ระบุ (ใช้ channel ที่สั่งเพลง)</span>
                </div>

                {/* Channel list */}
                {filteredChannels.length > 0 ? (
                  filteredChannels.map((channel) => (
                    <div
                      key={channel.id}
                      onClick={() => handleSelectChannel(channel.id)}
                      className={`px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-white/10 transition-colors
                                 ${selectedChannel === channel.id ? 'bg-purple-500/20 text-purple-300' : 'text-white'}`}
                    >
                      <Hash className="h-4 w-4 text-slate-500" />
                      <span>{channel.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-slate-500">
                    ไม่พบ channel ที่ตรงกับ "{searchQuery}"
                  </div>
                )}
              </div>,
              document.body
            )}
          </div>
        </div>

        {/* Error/Success messages */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 px-3 py-2 rounded-lg">
            <Check className="h-4 w-4" />
            <span>{success}</span>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSaveChannel}
          disabled={saving || selectedChannel === (settings?.musicChannelId || '')}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 
                     disabled:bg-white/10 disabled:cursor-not-allowed
                     text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>กำลังบันทึก...</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              <span>save</span>
            </>
          )}
        </button>

        {/* Permission Info */}
        <div className="text-xs text-slate-500 bg-white/5 p-3 rounded-lg space-y-1">
          <p className="font-medium text-slate-400">📋 เกี่ยวกับสิทธิ์การใช้บอท:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li><span className="text-green-400">ดูสถานะ</span> - สมาชิก Server ทุกคนสามารถดูเพลงที่กำลังเล่นได้</li>
            <li><span className="text-yellow-400">Owner/Admin</span> - Server Owner หรือคนที่เชิญบอทสามารถควบคุมได้ทุกที่</li>
            <li><span className="text-blue-400">เริ่มเล่นเพลง</span> - ถ้าบอทไม่ได้เล่นอยู่ สามารถเพิ่มเพลงได้จาก Voice Channel ใดก็ได้</li>
            <li><span className="text-purple-400">ควบคุมบอท</span> - ต้องอยู่ใน Voice Channel เดียวกับบอทถึงจะควบคุมได้</li>
          </ul>
        </div>
      </div>
    </div>
  );
});
