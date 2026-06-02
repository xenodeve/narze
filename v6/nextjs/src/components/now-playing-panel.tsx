'use client';

import Image from 'next/image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { usePlayer } from '@/providers/player-provider';
import { useSocket } from '@/providers/socket-provider';
import type { TrackSource } from '@/types/player';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Source badge colors at 15% opacity (DESIGN.md §5 source badges)
const sourceBadge: Record<TrackSource, { bg: string; text: string; label: string }> = {
  youtube:    { bg: 'rgba(255,0,0,0.15)',    text: '#ff4444', label: 'YouTube'    },
  spotify:    { bg: 'rgba(30,215,96,0.15)',  text: '#1ed760', label: 'Spotify'    },
  soundcloud: { bg: 'rgba(255,85,0,0.15)',   text: '#ff5500', label: 'SoundCloud' },
};

const ProgressBar = memo(function ProgressBar({
  position,
  durationMs,
  isPlaying,
  isPaused,
  onSeek,
}: {
  position: number;
  durationMs: number;
  isPlaying: boolean;
  isPaused: boolean;
  onSeek: (pos: number) => void;
}) {
  const [localPos, setLocalPos] = useState(position);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setLocalPos(position); }, [position]);

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (isPlaying && !isPaused) {
      tickRef.current = setInterval(() => setLocalPos((p) => p + 250), 250);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isPlaying, isPaused]);

  const fillPct = Math.min((localPos / durationMs) * 100, 100);

  return (
    <div>
      <input
        type="range"
        min={0}
        max={durationMs}
        value={Math.min(localPos, durationMs)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek"
        aria-valuenow={localPos}
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuetext={fmt(localPos)}
        className="slider-filled w-full"
        style={{ '--fill-pct': `${fillPct}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{fmt(localPos)}</span>
        <span>{fmt(durationMs)}</span>
      </div>
    </div>
  );
});

export function NowPlayingPanel() {
  const { state } = usePlayer();
  const { socket } = useSocket();
  const { currentTrack, isPlaying, isPaused, volume, loopMode, guildId } = state;

  const emit = useCallback((event: string, extra?: object) =>
    socket?.emit(event, { guildId, ...extra }), [socket, guildId]);

  const loopNext = { off: 'track', track: 'queue', queue: 'off' } as const;
  const badge = currentTrack ? sourceBadge[currentTrack.source] : null;

  return (
    <section className="flex h-full flex-col gap-5 overflow-y-auto rounded-lg bg-card p-6" aria-label="Now Playing">
      {currentTrack ? (
        <>
          {/* Album art — crossfade on track change (DESIGN.md §6 Do's) */}
          <div className="relative aspect-square w-full overflow-hidden rounded-md">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.uri}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="absolute inset-0"
              >
                <Image
                  src={currentTrack.thumbnailUrl}
                  alt={currentTrack.title}
                  width={400}
                  height={400}
                  className="h-full w-full object-cover"
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Track info */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
                {currentTrack.title}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted">{currentTrack.artist}</p>
            </div>
            {badge && (
              <span
                className="mt-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: badge.bg, color: badge.text }}
              >
                {badge.label}
              </span>
            )}
          </div>

          {/* Progress bar — memoized, re-renders independently of parent */}
          <ProgressBar
            position={state.position}
            durationMs={currentTrack.durationMs}
            isPlaying={isPlaying}
            isPaused={isPaused}
            onSeek={(pos) => emit('player:seek', { position: pos })}
          />

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => emit('player:loop', { mode: loopNext[loopMode] })}
              aria-label={`Loop: ${loopMode}`}
              className={`rounded-md px-2 py-1 text-[13px] font-medium transition-colors duration-100 ${
                loopMode !== 'off' ? 'text-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {loopMode === 'off' ? 'Loop off' : loopMode === 'track' ? 'Loop track' : 'Loop queue'}
            </button>

            <div className="flex items-center gap-3">
              <button
                disabled
                aria-label="Previous (unavailable in V6)"
                className="cursor-not-allowed rounded-md p-2 text-muted opacity-30"
              >
                <SkipBack size={20} />
              </button>
              <button
                onClick={() => emit('player:pause')}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-ink transition-opacity duration-100 hover:opacity-90"
              >
                {isPlaying
                  ? <Pause size={22} fill="currentColor" />
                  : <Play size={22} fill="currentColor" />}
              </button>
              <button
                onClick={() => emit('player:skip')}
                aria-label="Skip"
                className="rounded-md p-2 text-muted transition-colors duration-100 hover:text-ink"
              >
                <SkipForward size={20} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">Vol</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => emit('player:volume', { volume: Number(e.target.value) })}
                aria-label="Volume"
                className="slider-filled w-20"
                style={{ '--fill-pct': `${volume}%` } as React.CSSProperties}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          {state.guildId
            ? <p className="text-sm text-muted">No track playing</p>
            : <p className="text-sm text-muted">Select a server to get started</p>
          }
        </div>
      )}
    </section>
  );
}
