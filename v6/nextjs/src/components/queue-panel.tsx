'use client';

import Image from 'next/image';
import { useState } from 'react';
import { X } from 'lucide-react';
import { usePlayer } from '@/providers/player-provider';
import { useSocket } from '@/providers/socket-provider';
import type { Track } from '@/types/player';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function QueueItem({
  track,
  index,
  isActive,
  onRemove,
}: {
  track: Track;
  index: number;
  isActive: boolean;
  onRemove: () => void;
}) {
  return (
    <li
      className={[
        'group flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-100',
        isActive ? 'text-accent' : 'hover:bg-elevated',
      ].join(' ')}
      style={isActive ? { backgroundColor: 'oklch(0.66 0.180 195 / 0.12)' } : undefined}
    >
      <span className="w-5 shrink-0 text-center text-[11px] text-muted">{index + 1}</span>
      {track.thumbnailUrl && (
        <Image
          src={track.thumbnailUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] font-medium ${isActive ? 'text-accent' : 'text-ink'}`}>
          {track.title}
        </p>
        <p className="truncate text-[11px] text-muted">{track.artist}</p>
      </div>
      <span className="shrink-0 text-[11px] text-muted">{fmt(track.durationMs)}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${track.title}`}
        className="shrink-0 rounded p-1 text-muted opacity-0 transition-[colors,opacity] duration-100 hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <X size={14} />
      </button>
    </li>
  );
}

export function QueuePanel() {
  const { state } = usePlayer();
  const { socket } = useSocket();
  const { queue, guildId, currentTrack } = state;
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = () => {
    socket?.emit('queue:clear', { guildId });
    setConfirmClear(false);
  };

  return (
    <section className="flex h-full flex-col rounded-lg bg-card" aria-label="Queue">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-medium text-ink">Queue</h2>
        {queue.length > 0 && (
          confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">Clear {queue.length} tracks?</span>
              <button
                onClick={handleClear}
                className="text-[11px] text-red-400 transition-colors duration-100 hover:text-red-300"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="text-[11px] text-muted transition-colors duration-100 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-[11px] text-muted transition-colors duration-100 hover:text-ink"
            >
              Clear all
            </button>
          )
        )}
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-muted">
            Queue is empty — search for a track to get started.
          </p>
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto p-2">
          {queue.map((track, i) => (
            <QueueItem
              key={`${track.uri}-${i}`}
              track={track}
              index={i}
              isActive={track.uri === currentTrack?.uri && i === 0}
              onRemove={() => socket?.emit('queue:remove', { guildId, index: i })}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
