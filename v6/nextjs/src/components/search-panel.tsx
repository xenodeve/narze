'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/providers/socket-provider';
import { usePlayer } from '@/providers/player-provider';
import type { Track, TrackSource } from '@/types/player';

type SearchResult = Track & { id: string };

const SOURCES: { label: string; value: TrackSource | 'all' }[] = [
  { label: 'All',        value: 'all'        },
  { label: 'YouTube',   value: 'youtube'    },
  { label: 'Spotify',   value: 'spotify'    },
  { label: 'SoundCloud',value: 'soundcloud' },
];

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function SearchPanel() {
  const { socket } = useSocket();
  const { state } = usePlayer();
  const [query, setQuery]   = useState('');
  const [source, setSource] = useState<TrackSource | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [added, setAdded]   = useState<Set<string>>(new Set());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for search results from backend
  useEffect(() => {
    if (!socket) return;
    const onResults = (data: SearchResult[]) => setResults(data);
    socket.on('search:results', onResults);
    return () => { socket.off('search:results', onResults); };
  }, [socket]);

  // Debounced search emit — 300ms (PRD §4.3.6)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim() || !state.guildId) { setResults([]); return; }
    debounce.current = setTimeout(() => {
      socket?.emit('search:query', {
        guildId: state.guildId,
        query,
        source: source === 'all' ? undefined : source,
      });
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, source, socket, state.guildId]);

  const addTrack = (track: SearchResult) => {
    socket?.emit('queue:add', { guildId: state.guildId, uri: track.uri, source: track.source });
    setAdded((prev) => new Set(prev).add(track.id));
    setTimeout(() => {
      setAdded((prev) => { const s = new Set(prev); s.delete(track.id); return s; });
    }, 1000);
  };

  const visible = source === 'all' ? results : results.filter((r) => r.source === source);

  return (
    <section className="flex h-full flex-col rounded-lg bg-card" aria-label="Search">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks…"
          aria-label="Search tracks"
          className="w-full rounded-md bg-elevated px-3 py-2 text-[13px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        {/* Source filter tabs */}
        <div className="mt-2 flex gap-1" role="group" aria-label="Filter by source">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSource(s.value)}
              aria-pressed={source === s.value}
              className={[
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-100',
                // Active tab: accent bg + ink (white) text — never text-bg
                source === s.value
                  ? 'bg-accent text-ink'
                  : 'text-muted hover:bg-elevated hover:text-ink',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {query.trim() && visible.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-muted">No results for &ldquo;{query}&rdquo;</p>
        </div>
      )}
      <ul className="flex-1 overflow-y-auto p-2">
        {visible.map((track) => (
          <li
            key={track.id}
            className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-100 hover:bg-elevated"
          >
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
              <p className="truncate text-[13px] font-medium text-ink">{track.title}</p>
              <p className="truncate text-[11px] text-muted">
                {track.artist} · {fmt(track.durationMs)}
              </p>
            </div>
            <button
              onClick={() => addTrack(track)}
              aria-label={added.has(track.id) ? `Added ${track.title}` : `Add ${track.title} to queue`}
              className="shrink-0 rounded-full bg-elevated px-2.5 py-0.5 text-[11px] font-medium text-muted transition-colors duration-100 hover:bg-accent hover:text-ink"
            >
              {added.has(track.id) ? '✓' : '+'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
