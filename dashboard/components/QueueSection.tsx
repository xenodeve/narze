import { Music, Trash2, GripVertical } from 'lucide-react';
import { useState, useEffect, memo, useCallback, useRef, DragEvent } from 'react';
import { useSSE } from '@/hooks/useSSE';
import { useAuth } from '@/hooks/useAuth';
import { useQueueRecheck } from '@/hooks/useQueueRecheck';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';

interface QueueTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  addedBy?: string;
  thumbnail?: string;
  requesterAvatar?: string;
  requesterName?: string;
}

interface QueueSectionProps {
  guildId?: string;
  tracks?: QueueTrack[];
  onOptimisticAdd?: (track: QueueTrack) => void;
  onQueueLengthChange?: (length: number) => void;
  canControl?: boolean;
}

interface TrackItemWrapperProps {
  children: React.ReactNode;
  trackId: string;
  isRemoving: boolean;
  isFirstTrackPlaying: boolean;
  shouldSlideUp: boolean;
  isNewTrack: boolean;
  isJumping: boolean;
}

const TrackItemWrapper = memo(function TrackItemWrapper({ children, trackId, isRemoving, isFirstTrackPlaying, shouldSlideUp, isNewTrack, isJumping }: TrackItemWrapperProps) {
  return (
    <div className={`
      ${isRemoving ? 'animate-jumpOutToPlay' : ''}
      ${isFirstTrackPlaying ? 'animate-slideOutAndFade' : ''}
      ${shouldSlideUp ? 'animate-slideUp' : ''}
      ${isNewTrack ? 'animate-slideInFromLeft' : ''}
      ${isJumping ? 'animate-jumpOutToPlay' : ''}
    `}>
      {children}
    </div>
  );
});

// ========== Sub-components ==========

const formatDuration = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// Animated Number component - flips when number changes
const AnimatedNumber = memo(function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      // Wait for half animation before changing number (at the "hidden" point)
      const timer1 = setTimeout(() => {
        setDisplayValue(value);
      }, 120);
      // Clear animation after full duration
      const timer2 = setTimeout(() => {
        setIsAnimating(false);
      }, 300);
      prevValueRef.current = value;
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [value]);

  return (
    <span className={`inline-block ${isAnimating ? 'animate-numberFlip' : ''}`}>
      {displayValue}
    </span>
  );
});

// Draggable Track Item
interface DraggableTrackItemProps {
  track: QueueTrack;
  index: number;
  totalTracks: number;
  dragFromIndex: number | null;
  onRemove: (id: string) => void;
  onPlay: (index: number) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, index: number) => void;
  isDragging: boolean;
  isDragOver: boolean;
  canControl: boolean;
}

// Drop indicator line component
const DropIndicator = memo(function DropIndicator({
  fromIndex,
  toIndex,
  totalTracks,
}: {
  fromIndex: number;
  toIndex: number;
  totalTracks: number;
}) {
  // Calculate where the track will end up
  const actualPosition = fromIndex < toIndex ? toIndex : toIndex + 1;

  return (
    <div className="relative h-1 bg-purple-500 mx-2 rounded-full">
      <div className="absolute left-1/2 -translate-x-1/2 -top-5 bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg">
        Move to #{actualPosition}
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-purple-500 rounded-full" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-purple-500 rounded-full" />
    </div>
  );
});

const DraggableTrackItem = memo(function DraggableTrackItem({
  track,
  index,
  totalTracks,
  dragFromIndex,
  onRemove,
  onPlay,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging,
  isDragOver,
  canControl,
}: DraggableTrackItemProps) {
  const isDraggingRef = useRef(false);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only play if we didn't drag
    if (!isDraggingRef.current) {
      if (canControl) {
        onPlay(index);
      }
    }
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (!canControl) return; // Prevent drag
    isDraggingRef.current = true;
    onDragStart(e, index);
  };

  return (
    <div className="relative">
      {/* Drop indicator above this item */}
      {isDragOver && dragFromIndex !== null && dragFromIndex !== index && (
        <DropIndicator fromIndex={dragFromIndex} toIndex={index} totalTracks={totalTracks} />
      )}
      <div
        draggable={canControl}
        onDragStart={handleDragStart}
        onDragOver={(e) => onDragOver(e, index)}
        onDragEnd={() => {
          isDraggingRef.current = false;
          onDragEnd();
        }}
        onDrop={(e) => onDrop(e, index)}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        className={`p-4 transition-all duration-300 flex items-center gap-3 group
          ${isDragging ? 'opacity-30 bg-purple-900/30 scale-95' : 'hover:bg-white/5'}
          ${canControl ? 'cursor-pointer' : 'cursor-default'}
        `}
      >
        {/* Drag Handle icon - only if canControl */}
        <div className={`p-1 -m-1 ${canControl ? '' : 'opacity-0'}`}>
          <GripVertical className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
        </div>

        {/* Track position number with flip animation */}
        <span className="text-slate-400 font-medium w-6">
          <AnimatedNumber value={index + 1} />
        </span>

        {/* Thumbnail with requester avatar */}
        <div className="relative w-10 h-10 flex-shrink-0">
          <div className="w-10 h-10 rounded-md overflow-hidden bg-white/10">
            {track.thumbnail ? (
              <img
                src={track.thumbnail}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="h-4 w-4 text-slate-500" />
              </div>
            )}
          </div>
          {/* Requester avatar badge */}
          {(track.requesterAvatar || track.requesterName) && (
            track.requesterAvatar ? (
              <img
                src={track.requesterAvatar}
                alt={track.requesterName || 'Requester'}
                title={track.requesterName || 'Requester'}
                className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full border-2 border-slate-900 object-cover"
              />
            ) : (
              <div
                title={track.requesterName || 'Requester'}
                className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full border-2 border-slate-900 bg-white/20 flex items-center justify-center text-[8px] text-white font-medium overflow-hidden"
              >
                {(track.requesterName || '?')[0].toUpperCase()}
              </div>
            )
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white truncate">{track.title}</p>
          <p className="text-xs text-slate-400 truncate">{track.artist}</p>
        </div>
        <span className="text-xs text-slate-500">{formatDuration(track.duration)}</span>

        {canControl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(track.id);
            }}
            className="p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            title="Remove track"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
});

// Queue Header
const QueueHeader = memo(function QueueHeader({
  count,
  onClear,
  canControl,
  isClearing
}: {
  count: number;
  onClear?: () => void;
  canControl?: boolean;
  isClearing?: boolean;
}) {
  return (
    <div className="p-6 border-b border-slate-700 transition-all duration-300 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-white transition-all duration-300">Queue ({count})</h3>
        <p className="text-xs text-slate-500 mt-1">Drag to reorder</p>
      </div>
      {canControl && count > 0 && onClear && (
        <button
          onClick={onClear}
          disabled={isClearing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear all tracks from queue"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {isClearing ? 'Clearing...' : 'Clear'}
        </button>
      )}
    </div>
  );
});

// ========== Main Component ==========

export const QueueSection = memo(function QueueSection({ guildId, tracks: initialTracks = [], onOptimisticAdd, onQueueLengthChange, canControl = false }: QueueSectionProps) {
  const [tracks, setTracks] = useState<QueueTrack[]>(initialTracks);
  // Start with loading true only if we have a guildId (will fetch)
  const [loading, setLoading] = useState(!!guildId);
  const [isExiting, setIsExiting] = useState(false);
  const [removingTracks, setRemovingTracks] = useState<Set<string>>(new Set());
  const [playingFirstTrack, setPlayingFirstTrack] = useState(false);
  const isFirstLoad = useRef(true);
  const prevTracksRef = useRef<QueueTrack[]>(initialTracks);
  const [prevPropGuildId, setPrevPropGuildId] = useState<string | undefined>(undefined);
  // Flag to ignore SSE/fetch updates during animation
  const isAnimatingRef = useRef(false);
  // Track newly added tracks for slide-in animation
  const [newTrackIds, setNewTrackIds] = useState<Set<string>>(new Set());
  // Track which track is being jumped to (for jump animation)
  const [jumpingTrackIndex, setJumpingTrackIndex] = useState<number | null>(null);
  // Flag to suppress the next skipTrack call (after jumpToTrack)
  const suppressNextSkipRef = useRef(false);
  // Flag to suppress animation during drag and drop
  const isDraggingRef = useRef(false);
  // Track pending optimistic adds - store track titles that were added optimistically
  // This helps prevent duplicate display when SSE update arrives
  const pendingOptimisticAddsRef = useRef<Set<string>>(new Set());
  // Track if clear queue operation is in progress
  const [isClearing, setIsClearing] = useState(false);
  // Show custom confirmation modal for clear queue
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Use SSE for real-time updates
  const { data: sseData, connected: sseConnected } = useSSE(guildId || null);
  const { user } = useAuth();

  // Loop-based state reset (updates during render to prevent flash of old content)
  if (guildId !== prevPropGuildId) {
    setPrevPropGuildId(guildId);
    setTracks([]);
    prevTracksRef.current = [];
    setLoading(true);
    isFirstLoad.current = true;
  }

  // Use Queue Recheck System
  const { scheduleRecheck } = useQueueRecheck(guildId || null);

  // Sync listener for QueueRecheckManager
  useEffect(() => {
    (window as any).__queueRecheckSync = (syncTracks: any[]) => {
      console.log('[QueueSection] Received Hard Sync from RecheckManager', syncTracks);
      // Map QueueSong to QueueTrack
      const mappedTracks: QueueTrack[] = syncTracks.map((s, i) => ({
        id: `${i}`,
        title: s.title,
        artist: s.artist,
        duration: s.duration,
        addedBy: s.addedBy
      }));
      setTracks(mappedTracks);
    };
    return () => {
      delete (window as any).__queueRecheckSync;
    };
  }, []);

  // Expose optimistic add to parent
  useEffect(() => {
    // Pass a function that adds track optimistically
    const addTrack = (track: QueueTrack) => {
      const newId = `${tracks.length}`;

      // Track this as a pending optimistic add
      pendingOptimisticAddsRef.current.add(track.title);

      setTracks(prev => [...prev, { ...track, id: newId }]);
      // Mark as new track for animation
      setNewTrackIds(prev => new Set(prev).add(newId));

      // Schedule recheck to confirm with server
      scheduleRecheck();

      // Remove from new tracks after animation completes
      setTimeout(() => {
        setNewTrackIds(prev => {
          const next = new Set(prev);
          next.delete(newId);
          return next;
        });
      }, 400);

      // Clear from pending after a reasonable time for SSE to arrive
      setTimeout(() => {
        pendingOptimisticAddsRef.current.delete(track.title);
      }, 2000);
    };
    // Store reference for parent to call
    (window as any).__queueOptimisticAdd = addTrack;

    return () => {
      delete (window as any).__queueOptimisticAdd;
    };
  }, [tracks.length, scheduleRecheck]);

  // Expose function to check if there are tracks in the queue
  useEffect(() => {
    const hasTracks = () => tracks.length > 0;
    (window as any).__queueHasTracks = hasTracks;

    return () => {
      delete (window as any).__queueHasTracks;
    };
  }, [tracks.length]); // Re-run when tracks length changes

  // Notify parent of queue length changes for realtime updates
  useEffect(() => {
    if (onQueueLengthChange) {
      onQueueLengthChange(tracks.length);
    }
  }, [tracks.length, onQueueLengthChange]);

  // Expose function to get first track from queue (for optimistic update on trackEnd)
  useEffect(() => {
    const getFirstTrack = () => {
      if (tracks.length === 0) return null;
      return tracks[0];
    };
    (window as any).__queueGetFirstTrack = getFirstTrack;

    return () => {
      delete (window as any).__queueGetFirstTrack;
    };
  }, [tracks]);

  // Expose optimistic skip to NowPlayingSection
  useEffect(() => {
    // Function to optimistically remove first track from queue (when skip is called)
    const skipTrack = () => {
      // If we just did a jumpToTrack, suppress this skip
      if (suppressNextSkipRef.current) {
        console.log('[QueueSection] Suppressing skipTrack after jumpToTrack');
        suppressNextSkipRef.current = false;
        return;
      }

      // Set animating flag to ignore SSE updates during animation
      isAnimatingRef.current = true;

      // Trigger animation for first track
      setPlayingFirstTrack(true);

      // Wait for animation to complete before removing
      setTimeout(() => {
        setTracks(prev => {
          if (prev.length === 0) return prev;
          // Remove first track and re-index remaining tracks
          return prev.slice(1).map((track, index) => ({ ...track, id: `${index}` }));
        });
        setPlayingFirstTrack(false);

        // Clear animating flag after a small delay to allow state to settle
        setTimeout(() => {
          isAnimatingRef.current = false;
        }, 100);

        // Schedule recheck to confirm with server
        scheduleRecheck();
      }, 500); // Match animation duration
    };
    // Store reference for NowPlayingSection to call
    (window as any).__queueOptimisticSkip = skipTrack;

    return () => {
      delete (window as any).__queueOptimisticSkip;
    };
  }, [scheduleRecheck]);

  // Detect when first track is removed (played) and trigger animation
  // Only trigger if not already animating from optimistic skip or drag and drop
  useEffect(() => {
    // Skip if already animating from optimistic update or drag operation
    if (isAnimatingRef.current || isDraggingRef.current) {
      prevTracksRef.current = tracks;
      return;
    }

    if (prevTracksRef.current.length > 0 && tracks.length > 0) {
      const prevFirst = prevTracksRef.current[0];
      const currentFirst = tracks[0];

      // If the first track changed (was removed/played)
      // Also check if length changed to distinguish from reorder
      if ((prevFirst.id !== currentFirst.id || prevFirst.title !== currentFirst.title) &&
        prevTracksRef.current.length !== tracks.length) {
        setPlayingFirstTrack(true);
        setTimeout(() => setPlayingFirstTrack(false), 100);
      }
    }
    prevTracksRef.current = tracks;
  }, [tracks]);

  // Handle SSE messages
  useEffect(() => {
    if (!sseData || !guildId) return;

    // Ignore SSE updates during animation to prevent flickering
    if (isAnimatingRef.current) {
      console.log('[QueueSection] Ignoring SSE message during animation');
      return;
    }

    console.log('[QueueSection] SSE message:', sseData);

    if (sseData.type === 'queueUpdate') {
      const formattedTracks = (sseData.data.queue || []).map((track: any, index: number) => ({
        id: `${index}`,
        title: track.title,
        artist: track.author || 'Unknown Artist',
        duration: track.duration || 0,
        thumbnail: track.thumbnail,
        requesterAvatar: track.requesterAvatar,
        requesterName: track.requesterName,
      }));

      // Detect new tracks by comparing with previous
      // BUT skip animation for tracks that were already added optimistically
      const prevTrackTitles = new Set(tracks.map(t => t.title));
      const newTrackTitles = new Set(formattedTracks.map((t: QueueTrack) => t.title));
      const newIds = new Set<string>();

      formattedTracks.forEach((track: QueueTrack, index: number) => {
        // Only mark as new if:
        // 1. It wasn't in previous tracks AND
        // 2. It's not a pending optimistic add (already shown with animation)
        if (!prevTrackTitles.has(track.title) && !pendingOptimisticAddsRef.current.has(track.title)) {
          newIds.add(`${index}`);
        }
      });

      // Detect removed tracks (in prev but not in new)
      const removedTrackIds: string[] = [];
      tracks.forEach((track, index) => {
        if (!newTrackTitles.has(track.title)) {
          removedTrackIds.push(track.id);
        }
      });

      // Clear pending optimistic adds that are now confirmed by server
      formattedTracks.forEach((track: QueueTrack) => {
        pendingOptimisticAddsRef.current.delete(track.title);
      });

      // If there are tracks to remove, animate first then update
      if (removedTrackIds.length > 0) {
        // Mark tracks as removing for animation
        setRemovingTracks(new Set(removedTrackIds));

        // Wait for animation to complete before updating
        setTimeout(() => {
          setRemovingTracks(new Set());
          setTracks(formattedTracks);

          // Handle new tracks after removal animation
          if (newIds.size > 0) {
            setNewTrackIds(newIds);
            setTimeout(() => {
              setNewTrackIds(new Set());
            }, 400);
          }
        }, 350); // Slightly shorter than animation duration for smoother transition
      } else {
        // No removed tracks, update immediately
        if (newIds.size > 0) {
          setNewTrackIds(newIds);
          setTimeout(() => {
            setNewTrackIds(new Set());
          }, 400);
        }

        setTracks(formattedTracks);
      }
    }

    // Handle init event (page refresh) - receive queue data with thumbnail/requester
    if (sseData.type === 'init' && sseData.data.queue) {
      const formattedTracks = (sseData.data.queue || []).map((track: any, index: number) => ({
        id: `${index}`,
        title: track.title,
        artist: track.author || 'Unknown Artist',
        duration: track.duration || 0,
        thumbnail: track.thumbnail,
        requesterAvatar: track.requesterAvatar,
        requesterName: track.requesterName,
      }));
      setTracks(formattedTracks);
      console.log('[QueueSection] Queue initialized from SSE init event:', formattedTracks.length, 'tracks');
    }

    // Handle jumpToTrack event from another client
    if (sseData.type === 'jumpToTrack') {
      const { fromIndex } = sseData.data;
      console.log(`[QueueSection] jumpToTrack event received, index: ${fromIndex}`);

      // Suppress the next skipTrack call for this client too
      suppressNextSkipRef.current = true;

      // Only animate if we're not already animating (another client triggered this)
      // Use prevTracksRef to avoid dependency on tracks
      const currentTracksLength = prevTracksRef.current.length;
      if (!isAnimatingRef.current && fromIndex >= 0 && fromIndex < currentTracksLength) {
        isAnimatingRef.current = true;
        setJumpingTrackIndex(fromIndex);

        setTimeout(() => {
          setTracks(prev => {
            const newTracks = [...prev];
            newTracks.splice(fromIndex, 1);
            return newTracks.map((t, i) => ({ ...t, id: `${i}` }));
          });
          setJumpingTrackIndex(null);

          setTimeout(() => {
            isAnimatingRef.current = false;
          }, 100);
        }, 400);
      }
    }
  }, [sseData, guildId]);

  // Fallback: ดึงข้อมูล queue ถ้า SSE ไม่ได้เชื่อมต่อ
  useEffect(() => {
    if (!guildId) {
      setTracks([]);
      return;
    }

    const fetchQueue = async () => {
      // Ignore fetch updates during animation to prevent flickering
      if (isAnimatingRef.current) {
        return;
      }

      // Only show loading on first load when SSE not connected
      const showLoading = isFirstLoad.current && !sseConnected;
      if (showLoading) {
        setLoading(true);
      }

      try {
        const response = await fetch(`${BOT_API_URL}/api/queue/${guildId}`);

        // Check again after async operation
        if (isAnimatingRef.current) {
          return;
        }

        if (response.status === 404) {
          // No player/queue - clear tracks and stop loading
          setTracks((prev) => prev.length === 0 ? prev : []);
          // Don't return early - let finally block handle loading state
        } else if (!response.ok) {
          throw new Error('Failed to fetch queue');
        } else {
          // Check if response is JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn('[QueueSection] Bot returned non-JSON response - bot may be offline');
            setTracks((prev) => prev.length === 0 ? prev : []);
            return;
          }

          const data = await response.json();

          // Check again after parsing
          if (isAnimatingRef.current) {
            return;
          }

          if (data.queue && Array.isArray(data.queue)) {
            setTracks((prev) => {
              const newTracks = data.queue.map((track: any, index: number) => ({
                id: `${index}`,
                title: track.title,
                artist: track.author || 'Unknown Artist',
                duration: track.duration || 0,
                thumbnail: track.thumbnail,
                requesterAvatar: track.requesterAvatar,
                requesterName: track.requesterName,
              }));

              // Compare to avoid unnecessary re-renders
              if (prev.length === newTracks.length &&
                prev.every((t, i) => t.title === newTracks[i].title)) {
                return prev;
              }
              return newTracks;
            });
          } else {
            // Response ok but no queue data - clear tracks
            setTracks((prev) => prev.length === 0 ? prev : []);
          }
        }
      } catch (error: any) {
        // Silently handle network errors (bot offline) - don't spam console
        if (error?.name !== 'TypeError' && !error?.message?.includes('fetch')) {
          console.error('Failed to fetch queue:', error);
        }
        // Clear tracks when bot is offline or error
        setTracks((prev) => prev.length === 0 ? prev : []);
      } finally {
        // Always set loading false on first load completion
        if (isFirstLoad.current) {
          setLoading(false);
          isFirstLoad.current = false;
        }
      }
    };

    fetchQueue();

    // Only poll if SSE is NOT connected
    let interval: NodeJS.Timeout | null = null;
    if (!sseConnected) {
      interval = setInterval(fetchQueue, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [guildId, sseConnected]);

  // Reset first load when guildId changes
  useEffect(() => {
    isFirstLoad.current = true;
  }, [guildId]);

  const handleRemoveTrack = async (trackId: string) => {
    if (!guildId) return;
    if (!canControl) return; // Block if cannot control

    // Mark as removing to trigger animation
    setRemovingTracks(prev => new Set(prev).add(trackId));

    // Wait for animation before actually removing (matches jumpOutToPlay animation duration)
    await new Promise(resolve => setTimeout(resolve, 400));

    // Optimistic update - remove after animation
    const previousTracks = tracks;
    setTracks(prev => prev.filter(t => t.id !== trackId));
    setRemovingTracks(prev => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });

    // Schedule recheck to confirm with server
    scheduleRecheck();

    try {
      const response = await fetch(`/api/queue/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', trackId, user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });

      if (!response.ok) {
        // Revert on error
        setTracks(previousTracks);
      }
    } catch (error) {
      // Revert on error
      setTracks(previousTracks);
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to remove track:', error);
      }
    }
  };

  // Wrap with useCallback to prevent sub-component re-renders
  const handleRemoveCallback = useCallback((trackId: string) => {
    handleRemoveTrack(trackId);
  }, [guildId, canControl]);

  // Open confirmation modal
  const handleClearQueue = useCallback(() => {
    if (!guildId || !canControl || tracks.length === 0) return;
    setShowClearConfirm(true);
  }, [guildId, canControl, tracks.length]);

  // Execute clear after confirmation
  const executeClearQueue = useCallback(async () => {
    if (!guildId || !canControl) return;

    setShowClearConfirm(false);
    setIsClearing(true);
    const previousTracks = [...tracks];

    // Optimistic update
    setTracks([]);

    try {
      const response = await fetch(`/api/queue/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });

      if (!response.ok) {
        // Revert on error
        setTracks(previousTracks);
        console.error('Failed to clear queue');
      }
    } catch (error) {
      // Revert on error
      setTracks(previousTracks);
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to clear queue:', error);
      }
    } finally {
      setIsClearing(false);
    }
  }, [guildId, canControl, tracks, user]);

  // Play a specific track from queue (move to front and play now)
  const handlePlayTrack = useCallback(async (index: number) => {
    if (!guildId || index < 0 || index >= tracks.length) return;
    if (!canControl) return; // Block if cannot control

    // Block SSE updates during animation
    isAnimatingRef.current = true;

    // Set flag to prevent trackEnd from resetting UI (especially for single-track queues)
    if (typeof window !== 'undefined') {
      (window as any).__jumpToTrackInProgress = Date.now();
    }

    // Trigger jump animation
    setJumpingTrackIndex(index);

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 400));

    // Optimistic update: remove the jumped track
    setTracks(prev => {
      const newTracks = [...prev];
      newTracks.splice(index, 1);
      return newTracks.map((t, i) => ({ ...t, id: `${i}` }));
    });

    setJumpingTrackIndex(null);

    // Suppress the next skipTrack call since we already handled the track change
    suppressNextSkipRef.current = true;

    // Schedule recheck to confirm with server
    scheduleRecheck();

    // Send to backend
    try {
      const response = await fetch(`/api/player/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'playnow',
          index,
          user: user ? { username: user.username, discordId: user.discordId } : undefined
        }),
      });

      if (!response.ok) {
        console.error('Failed to play track now');
      }
    } catch (error) {
      // Silent fail for network errors (bot offline)
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to skip to track:', error);
      }
    } finally {
      // Allow SSE updates after delay
      setTimeout(() => {
        isAnimatingRef.current = false;
      }, 200);
    }
  }, [guildId, tracks.length, user, canControl]);

  // ========== Drag and Drop ==========
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    if (!canControl) return; // Block drag start
    isDraggingRef.current = true;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, [canControl]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;

    setDragIndex(null);
    setDragOverIndex(null);

    if (fromIndex === null || fromIndex === toIndex || !guildId) return;

    // Optimistic update
    setTracks(prev => {
      const newTracks = [...prev];
      const [movedTrack] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, movedTrack);
      // Update ids to match new positions
      return newTracks.map((t, i) => ({ ...t, id: `${i}` }));
    });

    // Schedule recheck to confirm with server
    scheduleRecheck();

    // Send to API
    try {
      const response = await fetch(`/api/queue/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', from: fromIndex, to: toIndex, user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });

      if (!response.ok) {
        console.error('Failed to move track');
        // Revert on error - will be synced on next fetch
      }
    } catch (error) {
      // Silent fail for network errors (bot offline)
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to move track:', error);
      }
    }
  }, [dragIndex, guildId, user]);

  // Trigger exit animation before unmounting (MUST be before any early returns)
  useEffect(() => {
    if (tracks.length === 0 && !loading) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsExiting(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [tracks.length, loading]);

  // Conditional renders AFTER all hooks
  if (loading) {
    return (
      <div className="card-surface p-6 animate-fadeIn">
        <h3 className="text-lg font-semibold text-white mb-4">Queue</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 100}ms` } as React.CSSProperties} />
          ))}
        </div>
      </div>
    );
  }

  if (tracks.length === 0 && !isExiting) {
    return null;
  }

  if (tracks.length === 0 && isExiting) {
    return (
      <div className="card-surface overflow-hidden animate-fadeOut">
        <QueueHeader count={0} canControl={canControl} isClearing={isClearing} />
      </div>
    );
  }

  return (
    <>
      {/* Clear Queue Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdropFadeIn"
            onClick={() => setShowClearConfirm(false)}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-sm card-surface overflow-hidden animate-modalSlideUp">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Clear Queue?</h3>
                <p className="text-sm text-slate-400">This action cannot be undone</p>
              </div>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              <p className="text-slate-300 text-sm leading-relaxed">
                Are you sure you want to remove all <span className="text-white font-semibold">{tracks.length}</span> tracks from the queue?
              </p>
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-end px-5 py-4 border-t border-white/10">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeClearQueue}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                Clear Queue
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card-surface overflow-hidden animate-fadeIn">
        <QueueHeader count={tracks.length} onClear={handleClearQueue} canControl={canControl} isClearing={isClearing} />
        <div className="divide-y divide-slate-700/50 max-h-96 overflow-y-auto py-1">
          {tracks.map((track, index) => (
            <TrackItemWrapper
              key={`${track.id}-${index}`}
              trackId={track.id}
              isRemoving={removingTracks.has(track.id)}
              isFirstTrackPlaying={index === 0 && playingFirstTrack}
              shouldSlideUp={index > 0 && playingFirstTrack}
              isNewTrack={newTrackIds.has(track.id)}
              isJumping={jumpingTrackIndex === index}
            >
              <DraggableTrackItem
                track={track}
                index={index}
                totalTracks={tracks.length}
                dragFromIndex={dragIndex}
                onRemove={handleRemoveCallback}
                onPlay={handlePlayTrack}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index && dragIndex !== index}
                canControl={canControl}
              />
            </TrackItemWrapper>
          ))}
          {/* Drop zone for last position */}
          {dragIndex !== null && dragIndex !== tracks.length && (
            <div
              className="relative h-8"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverIndex(tracks.length);
              }}
              onDrop={(e) => handleDrop(e, tracks.length)}
            >
              {dragOverIndex === tracks.length && (
                <DropIndicator fromIndex={dragIndex} toIndex={tracks.length} totalTracks={tracks.length} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
});
