'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { GripVertical, X } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
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
  total,
  isActive,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
}: {
  track: Track;
  index: number;
  total: number;
  isActive: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={track}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        'group flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-100',
        isActive ? '' : 'hover:bg-elevated',
      ].join(' ')}
      style={isActive ? { backgroundColor: 'oklch(0.66 0.180 195 / 0.12)' } : undefined}
    >
      {/* Drag handle */}
      <span
        onPointerDown={(e) => controls.start(e)}
        className="shrink-0 cursor-grab touch-none opacity-0 transition-opacity duration-100 group-hover:opacity-100 active:cursor-grabbing"
        aria-hidden
      >
        <GripVertical size={14} className="text-muted" />
      </span>

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

      {/* Keyboard reorder + remove (visible on hover / focus-within) */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label={`Move ${track.title} up`}
          className="rounded p-1 text-muted transition-colors duration-100 hover:text-ink disabled:opacity-30"
        >
          ▲
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          aria-label={`Move ${track.title} down`}
          className="rounded p-1 text-muted transition-colors duration-100 hover:text-ink disabled:opacity-30"
        >
          ▼
        </button>
        <button
          onClick={onRemove}
          aria-label={`Remove ${track.title}`}
          className="rounded p-1 text-muted transition-colors duration-100 hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    </Reorder.Item>
  );
}

export function QueuePanel() {
  const { state } = usePlayer();
  const { socket } = useSocket();
  const { queue, guildId, currentTrack } = state;
  const [confirmClear, setConfirmClear] = useState(false);
  const [localQueue, setLocalQueue] = useState<Track[]>(queue);
  const draggedUriRef = useRef<string | null>(null);

  // Sync local queue when server state changes (e.g. after confirmed move)
  useEffect(() => { setLocalQueue(queue); }, [queue]);

  const emitMove = (from: number, to: number) => {
    if (from !== to) socket?.emit('queue:move', { guildId, from, to });
  };

  const handleReorder = (newOrder: Track[]) => setLocalQueue(newOrder);

  const handleDragEnd = () => {
    if (!draggedUriRef.current) return;
    const uri = draggedUriRef.current;
    draggedUriRef.current = null;
    const from = queue.findIndex((t) => t.uri === uri);
    const to = localQueue.findIndex((t) => t.uri === uri);
    emitMove(from, to);
  };

  const handleMoveKeyboard = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= localQueue.length) return;
    const next = [...localQueue];
    [next[index], next[to]] = [next[to], next[index]];
    setLocalQueue(next);
    emitMove(index, to);
  };

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

      {localQueue.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-muted">
            Queue is empty — search for a track to get started.
          </p>
        </div>
      ) : (
        <Reorder.Group
          as="ol"
          axis="y"
          values={localQueue}
          onReorder={handleReorder}
          className="flex-1 overflow-y-auto p-2"
        >
          {localQueue.map((track, i) => (
            <QueueItem
              key={track.uri}
              track={track}
              index={i}
              total={localQueue.length}
              isActive={track.uri === currentTrack?.uri && i === 0}
              onRemove={() => socket?.emit('queue:remove', { guildId, index: i })}
              onMoveUp={() => handleMoveKeyboard(i, -1)}
              onMoveDown={() => handleMoveKeyboard(i, 1)}
              onDragStart={() => { draggedUriRef.current = track.uri; }}
              onDragEnd={handleDragEnd}
            />
          ))}
        </Reorder.Group>
      )}
    </section>
  );
}
