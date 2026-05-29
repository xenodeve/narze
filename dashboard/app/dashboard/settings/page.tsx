'use client';

import { GuildSettingsSection } from '@/components/GuildSettingsSection';
import { BotStatusBadge } from '@/components/BotStatusBadge';
import { useBotStatus } from '@/hooks/useBotStatus';
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Settings } from 'lucide-react';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

// Guild Selector Component with Portal dropdown
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

  // Update dropdown position on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({ top: rect.bottom + 8, left: rect.left, width: rect.width });
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    }
  }, [isOpen]);

  const selectedGuild = guilds.find(g => g.guildId === selectedGuildId);

  return (
    <div className="mb-6 flex items-center gap-3">
      <label className="text-slate-400">เลือก Server:</label>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`bg-white/5 border border-white/10 text-white px-4 py-2 pr-10 rounded-lg 
                     hover:border-purple-500/50 transition-colors cursor-pointer min-w-[200px] backdrop-blur-md
                     text-left flex items-center justify-between
                     ${isOpen ? 'ring-2 ring-purple-500 border-transparent' : ''}`}
        >
          <span className={selectedGuild ? 'text-white' : 'text-slate-400'}>
            {selectedGuild ? (
              <>{selectedGuild.guildName} {selectedGuild.isPlaying ? '🎵' : ''}</>
            ) : 'เลือก server'}
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu with Portal */}
        {isOpen && typeof document !== 'undefined' && createPortal(
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
            <button
              type="button"
              onClick={() => { onSelectGuild(''); setIsOpen(false); }}
              className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2
                         ${!selectedGuildId ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400'}`}
            >
              <span className="text-slate-500">—</span>
              <span>เลือก server</span>
            </button>

            {guilds.map((guild: any) => (
              <button
                key={guild.guildId}
                type="button"
                onClick={() => { onSelectGuild(guild.guildId); setIsOpen(false); }}
                className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-3
                           ${selectedGuildId === guild.guildId ? 'bg-purple-500/20 text-purple-300' : 'text-white'}`}
              >
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
              <div className="px-4 py-3 text-center text-slate-500">ไม่มี server</div>
            )}
          </div>,
          document.body
        )}
      </div>
      {guilds.length === 0 && !loading && (
        <span className="text-slate-500 text-sm">ไม่มี active players</span>
      )}
    </div>
  );
});

export default function SettingsPage() {
  const { status: botStatus } = useBotStatus();
  const [guilds, setGuilds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGuildId, setSelectedGuildId] = useState<string>('');

  // Fetch guilds
  useEffect(() => {
    const fetchGuilds = async () => {
      try {
        const response = await fetch(`${BOT_API_URL}/api/guilds`);
        if (response.ok) {
          const data = await response.json();
          setGuilds(data.guilds || []);

          // Auto-select first guild if none selected
          if (!selectedGuildId && data.guilds?.length > 0) {
            setSelectedGuildId(data.guilds[0].guildId);
          }
        }
      } catch (error) {
        // Silent fail for network errors
        if (error instanceof Error && error.name !== 'TypeError') {
          console.error('Failed to fetch guilds:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchGuilds();
    const interval = setInterval(fetchGuilds, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [selectedGuildId]);

  const handleSelectGuild = useCallback((guildId: string) => {
    setSelectedGuildId(guildId);
  }, []);

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
        {botStatus?.state && <BotStatusBadge status={botStatus.state} />}
      </div>

      {/* Guild Selector */}
      <GuildSelector
        selectedGuildId={selectedGuildId}
        guilds={guilds}
        loading={loading}
        onSelectGuild={handleSelectGuild}
      />

      {/* Settings Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Guild Settings */}
        <div className="lg:col-span-2">
          <GuildSettingsSection guildId={selectedGuildId} />
        </div>
      </div>
    </div>
  );
}
