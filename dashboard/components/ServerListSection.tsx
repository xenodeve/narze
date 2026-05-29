import { ChevronRight, Server, Music, Users, Crown, Mic, Eye, Lock } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback } from 'react';

interface Guild {
  guildId: string;
  guildName: string;
  guildIcon?: string;
  memberCount?: number;
  hasPlayer?: boolean;
  isPlaying?: boolean;
  queueLength?: number;
  isOwner?: boolean;
  isInVoiceWithBot?: boolean;
  canControl?: boolean;
  userVoiceChannelId?: string | null;
}

interface ServerListProps {
  guilds?: Guild[];
  loading?: boolean;
  onSelectGuild?: (guildId: string) => void;
  selectedGuildId?: string | null;
}

// Individual server item - only re-renders when its own data changes
const ServerItem = memo(function ServerItem({
  guild,
  onSelect,
  isSelected
}: {
  guild: Guild;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
}) {
  const handleClick = useCallback(() => {
    onSelect?.(guild.guildId);
  }, [guild.guildId, onSelect]);

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group
        ${isSelected
          ? 'bg-purple-500/20 ring-2 ring-purple-500 hover:bg-purple-500/25'
          : 'bg-white/5 hover:bg-white/10'
        }`}
    >
      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
        {guild.guildIcon ? (
          <Image
            src={guild.guildIcon}
            alt={guild.guildName}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-slate-700 flex items-center justify-center text-white font-semibold">
            {guild.guildName.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-white truncate">{guild.guildName}</p>
          {guild.isOwner && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
              <Crown className="h-3 w-3" />
              Owner
            </span>
          )}
          {!guild.isOwner && guild.isInVoiceWithBot && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
              <Mic className="h-3 w-3" />
              In Voice
            </span>
          )}
          {!guild.isOwner && !guild.isInVoiceWithBot && guild.canControl && !guild.hasPlayer && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
              <Music className="h-3 w-3" />
              Can Play
            </span>
          )}
          {!guild.canControl && !guild.isOwner && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-white/10 text-slate-400 text-xs rounded">
              <Eye className="h-3 w-3" />
              View Only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {guild.isPlaying && (
            <span className="flex items-center gap-1 text-green-400">
              <Music className="h-3 w-3" />
              Playing
            </span>
          )}
          {guild.queueLength !== undefined && guild.queueLength > 0 && (
            <span>{guild.queueLength} in queue</span>
          )}
          {guild.memberCount !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {guild.memberCount}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition-colors flex-shrink-0" />
    </button>
  );
});

export const ServerListSection = memo(function ServerListSection({ guilds = [], loading = false, onSelectGuild, selectedGuildId }: ServerListProps) {
  if (loading) {
    return (
      <div className="card-surface p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Active Players</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-white/10 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="card-surface p-6 text-center">
        <Server className="h-12 w-12 mx-auto mb-3 text-slate-600" />
        <h3 className="text-lg font-semibold text-white mb-1">No Servers</h3>
        <p className="text-slate-400 text-sm">
          You&apos;re not a member of any servers with this bot
        </p>
      </div>
    );
  }

  return (
    <div className="card-surface p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Your Servers ({guilds.length})
      </h3>
      <div className="space-y-3">
        {guilds.map((guild) => (
          <ServerItem
            key={guild.guildId}
            guild={guild}
            onSelect={onSelectGuild}
            isSelected={guild.guildId === selectedGuildId}
          />
        ))}
      </div>
    </div>
  );
});
