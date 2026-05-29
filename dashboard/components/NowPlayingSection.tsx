import { Music, Play, Pause, SkipForward, SkipBack, Volume2, Video, Disc3, Lock, Moon } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useSSE } from '@/hooks/useSSE';
import { useAuth } from '@/hooks/useAuth';
import { useControlPermission } from '@/hooks/useControlPermission';
import { fetchBillboardChart, billboardToChartTracks, type ChartTrack } from '@/lib/top-charts';
import { FastAverageColor } from 'fast-average-color';

interface NowPlayingProps {
  guildId?: string;
  onPlayTrack?: (track: any) => void;
  botStatus?: 'online' | 'offline' | 'starting' | 'idle' | 'playing' | 'paused' | 'unknown';
}

type RecommendedTrack = {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: number;
  url?: string;
  playCount?: number;
  source?: string; // Platform source (spotify, youtube, etc.)
  isVideo?: boolean; // True if YouTube video (not music)
  isMusic?: boolean; // True if music content
  isAudioOnly?: boolean; // True if audio-only (Spotify, YouTube Music)
};

// Get source badge info for track
function getTrackSourceInfo(track: RecommendedTrack): { icon: React.ReactNode; label: string; color: string } | null {
  const source = track.source?.toLowerCase() || '';
  const url = (track.url || '').toLowerCase();

  if (source === 'spotify' || url.includes('spotify')) {
    return { icon: <Disc3 className="h-2.5 w-2.5" />, label: 'Spotify', color: 'bg-green-600' };
  }
  if (url.includes('music.youtube.com') || (source === 'youtube' && track.isAudioOnly)) {
    return { icon: <Music className="h-2.5 w-2.5" />, label: 'YT Music', color: 'bg-red-600' };
  }
  if (track.isVideo || (source === 'youtube' && !track.isMusic)) {
    return { icon: <Video className="h-2.5 w-2.5" />, label: 'Video', color: 'bg-red-500' };
  }
  if (source === 'billboard') {
    return { icon: <Music className="h-2.5 w-2.5" />, label: 'Billboard', color: 'bg-amber-600' };
  }
  return null;
}

// ========== Progress Bar with its own internal timer ==========
const ProgressBarWithTimer = memo(function ProgressBarWithTimer({
  initialTime,
  duration,
  isPlaying,
  lastSyncTime,
  lastSeekTime,
  onSeek,
}: {
  initialTime: number;
  duration: number;
  isPlaying: boolean;
  lastSyncTime: number;
  lastSeekTime?: number;
  onSeek?: (position: number) => void;
}) {
  const [displayTime, setDisplayTime] = useState(initialTime);
  const animationRef = useRef<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  // Track the calculated time when pausing to avoid resetting
  const calculatedTimeRef = useRef<number>(initialTime);

  useEffect(() => {
    if (!isPlaying || duration <= 0) {
      // When paused, keep the current calculated time instead of resetting to initialTime
      // Only update if initialTime is significantly different (new track or seek)
      const timeDiff = Math.abs(initialTime - calculatedTimeRef.current);
      // Increased tolerance to 5s to prevent jumping on pause due to buffering drift
      // Unless it's a recent seek (within 2s)
      const isRecentSeek = lastSeekTime && (Date.now() - lastSeekTime < 2000);

      if (timeDiff > 5000 || isRecentSeek) {
        setDisplayTime(initialTime);
        calculatedTimeRef.current = initialTime;
      }
      // Otherwise keep the current display time (Stall visual)
      return;
    }

    const updateTime = (currentFrameTime: number) => {
      const elapsed = Date.now() - lastSyncTime;
      const newTime = Math.min(initialTime + elapsed, duration);

      setDisplayTime(prevDisplayTime => {
        // Smooth correction logic:
        // If we jump backwards small amount (< 5s) due to server lag/drift, 
        // STALL the bar instead of jumping back visually.
        // Except if we recently sought (intentional jump).
        const isRecentSeek = lastSeekTime && (Date.now() - lastSeekTime < 2000);

        if (!isRecentSeek && newTime < prevDisplayTime && prevDisplayTime - newTime < 5000) {
          // Stall: Keep previous time until newTime catches up
          calculatedTimeRef.current = prevDisplayTime;
          return prevDisplayTime;
        }

        calculatedTimeRef.current = newTime;
        return newTime;
      });

      if (duration > 0 && isPlaying) { // Continue animation loop
        animationRef.current = requestAnimationFrame(updateTime);
      }
    };

    animationRef.current = requestAnimationFrame(updateTime);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initialTime, duration, isPlaying, lastSyncTime, lastSeekTime]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !onSeek || duration <= 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newPosition = Math.floor(percentage * duration);

    onSeek(Math.max(0, Math.min(newPosition, duration)));
  }, [duration, onSeek]);

  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const currentMinutes = Math.floor(displayTime / 60000);
  const currentSeconds = Math.floor((displayTime % 60000) / 1000);
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  return (
    <div className="mb-4">
      <div
        ref={progressBarRef}
        onClick={handleProgressClick}
        className="relative h-2 cursor-pointer hover:h-3 transition-all group mb-2"
      >
        {/* Background track */}
        <div className="absolute inset-0 bg-white/10 rounded-full" />
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-purple-400 rounded-full"
          style={{ width: `${progress}%` }}
        />
        {/* Dot indicator - uses transform for responsive centering */}
        <div
          className="absolute top-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{
            left: `${progress}%`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{currentMinutes}:{String(currentSeconds).padStart(2, '0')}</span>
        <span>{minutes}:{String(seconds).padStart(2, '0')}</span>
      </div>
    </div>
  );
});

// ========== Static Sub-components ==========

const AlbumArt = memo(function AlbumArt({
  thumbnail,
  title,
  isFlipping = false,
  requesterAvatar,
  requesterName,
}: {
  thumbnail?: string;
  title: string;
  isFlipping?: boolean;
  requesterAvatar?: string;
  requesterName?: string;
}) {
  return (
    <div className="mb-6 flex justify-center perspective-1000">
      <div
        className={`relative w-48 h-48 rounded-lg overflow-hidden shadow-xl transition-transform duration-500 transform-style-3d ${isFlipping ? 'animate-cardFlip' : ''
          }`}
      >
        {thumbnail ? (
          <Image key={thumbnail} src={thumbnail} alt={title} fill className="object-cover backface-hidden" priority />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-slate-900 flex items-center justify-center backface-hidden">
            <Music className="h-24 w-24 text-slate-400" />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <Play className="h-12 w-12 text-white fill-white" />
        </div>
        {/* Requester badge - always visible, expands on hover */}
        {requesterAvatar && (
          <div
            className="absolute bottom-2 left-2 flex items-center bg-black/70 backdrop-blur-sm rounded-full p-1 
              transition-all duration-300 ease-out cursor-pointer group/requester
              hover:pr-3 hover:gap-2"
            title={requesterName || 'Requester'}
          >
            <img
              src={requesterAvatar}
              alt={requesterName || 'Requester'}
              className="w-6 h-6 rounded-full object-cover flex-shrink-0"
            />
            <span
              className="text-white text-xs font-medium truncate max-w-0 overflow-hidden 
                transition-all duration-300 ease-out opacity-0
                group-hover/requester:max-w-[100px] group-hover/requester:opacity-100"
            >
              {requesterName || 'Unknown'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

const TrackInfo = memo(function TrackInfo({ title, artist }: { title: string; artist: string; }) {
  return (
    <div className="text-center mb-6">
      <h2 className="text-2xl font-bold text-white mb-1">{title}</h2>
      <p className="text-slate-300">{artist}</p>
    </div>
  );
});

const PlayerControls = memo(function PlayerControls({
  isPlaying,
  loadingPrevious,
  loadingPlayPause,
  loadingSkip,
  canControl,
  controlReason,
  onPlayPause,
  onSkip,
  onPrevious,
}: {
  isPlaying: boolean;
  loadingPrevious: boolean;
  loadingPlayPause: boolean;
  loadingSkip: boolean;
  canControl: boolean;
  controlReason?: string;
  onPlayPause: () => void;
  onSkip: () => void;
  onPrevious: () => void;
}) {
  const disabled = !canControl;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={onPrevious}
          disabled={disabled || loadingPrevious}
          className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled ? controlReason : "Previous / Restart"}
        >
          <SkipBack className={`h-6 w-6 ${loadingPrevious ? 'animate-pulse' : ''}`} />
        </button>
        <button
          onClick={onPlayPause}
          disabled={disabled || loadingPlayPause}
          className="p-4 bg-purple-600 hover:bg-purple-700 rounded-full text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled ? controlReason : (isPlaying ? "Pause" : "Play")}
        >
          {isPlaying ? <Pause className={`h-6 w-6 fill-current ${loadingPlayPause ? 'animate-pulse' : ''}`} /> : <Play className={`h-6 w-6 fill-current ${loadingPlayPause ? 'animate-pulse' : ''}`} />}
        </button>
        <button
          onClick={onSkip}
          disabled={disabled || loadingSkip}
          className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled ? controlReason : "Skip"}
        >
          <SkipForward className={`h-6 w-6 ${loadingSkip ? 'animate-pulse' : ''}`} />
        </button>
      </div>
      {!canControl && controlReason && (
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-amber-400/80">
          <Lock className="h-3 w-3" />
          <span>{controlReason}</span>
        </div>
      )}
    </div>
  );
});

const VolumeControl = memo(function VolumeControl({
  volume,
  onVolumeChange,
  disabled = false
}: {
  volume: number;
  onVolumeChange: (volume: number) => void;
  disabled?: boolean;
}) {
  // Track dragging state to debounce API calls and prevent SSE interference
  const [isDragging, setIsDragging] = useState(false);
  const [localVolume, setLocalVolume] = useState(volume);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local volume with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalVolume(volume);
    }
  }, [volume, isDragging]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const newValue = Number(e.target.value);
    setLocalVolume(newValue);

    // Clear existing debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the actual API call (300ms after last change)
    debounceRef.current = setTimeout(() => {
      onVolumeChange(newValue);
    }, 300);
  }, [onVolumeChange, disabled]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    // When drag ends, immediately send the final value
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onVolumeChange(localVolume);
  }, [localVolume, onVolumeChange]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className={`flex items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <Volume2 className="h-5 w-5 text-slate-400" />
      <input
        type="range"
        min="0"
        max="100"
        value={localVolume}
        disabled={disabled}
        className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-600 disabled:cursor-not-allowed"
        onChange={handleChange}
        onMouseDown={handleDragStart}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={handleDragStart}
        onTouchEnd={handleDragEnd}
      />
      <span className="text-xs text-slate-400 w-8 text-right">{localVolume}%</span>
    </div>
  );
});

const RecommendationGrid = memo(function RecommendationGrid({
  tracks,
  loading,
  onPlay,
  onRetry,
  error,
  title,
  subtitle,
  emptyMessage,
  columns = 4,
}: {
  tracks: RecommendedTrack[];
  loading: boolean;
  onPlay?: (track: RecommendedTrack) => void;
  onRetry?: () => void;
  error?: string | null;
  title: string;
  subtitle: string;
  emptyMessage: string;
  columns?: number;
}) {
  const skeletonCards = Array.from({ length: columns });

  const renderCard = (track: RecommendedTrack, index: number) => (
    <button
      key={track.id || index}
      onClick={() => onPlay?.(track)}
      className="group relative text-left rounded-xl bg-white/5 border border-white/10 p-3 hover:-translate-y-1 hover:border-purple-500/60 transition-all duration-200 overflow-hidden animate-fadeIn backdrop-blur-md"
      style={{ animationDelay: `${index * 50}ms` }}
      disabled={!onPlay}
    >
      <div className="relative aspect-square rounded-lg overflow-hidden bg-white/10">
        {track.thumbnail ? (
          <Image src={track.thumbnail} alt={track.title} fill className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
            <Music className="h-10 w-10 text-slate-500" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {/* Source Badge */}
        {track.source && (
          <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${track.source === 'spotify'
            ? 'bg-green-500/90 text-white'
            : track.isVideo
              ? 'bg-red-500/90 text-white'
              : 'bg-red-500/90 text-white'
            }`}>
            {track.source === 'spotify' ? (
              <>
                <Disc3 className="h-2.5 w-2.5" />
                <span>Spotify</span>
              </>
            ) : track.isVideo ? (
              <>
                <Video className="h-2.5 w-2.5" />
                <span>Video</span>
              </>
            ) : (
              <>
                <Music className="h-2.5 w-2.5" />
                <span>Music</span>
              </>
            )}
          </div>
        )}
        <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="h-5 w-5 fill-current" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-sm font-semibold text-white line-clamp-1">{track.title || 'Unknown title'}</p>
        <p className="text-xs text-slate-400 line-clamp-1">{track.artist || 'Unknown artist'}</p>
        {track.playCount ? (
          <p className="text-[11px] text-slate-500 mt-1">{track.playCount} plays</p>
        ) : null}
      </div>
    </button>
  );

  const gridColsClass = columns === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4';

  return (
    <div className="card-surface p-6">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : null}
        {onRetry ? (
          <button
            onClick={onRetry}
            className="text-sm text-purple-300 hover:text-white transition-colors"
          >
            Refresh
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridColsClass} gap-4`}>
          {skeletonCards.map((_, idx) => (
            <div key={idx} className="rounded-xl bg-white/5 border border-white/10 p-3 animate-pulse backdrop-blur-md">
              <div className="aspect-square rounded-lg bg-white/10 mb-3" />
              <div className="h-3 bg-white/10 rounded w-3/4 mb-2" />
              <div className="h-3 bg-white/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : tracks.length > 0 ? (
        <div key={tracks[0]?.id || 'grid'} className={`grid grid-cols-1 sm:grid-cols-2 ${gridColsClass} gap-4`}>
          {tracks.map(renderCard)}
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center backdrop-blur-md">
          <p className="text-slate-400">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
});

// ========== Main Component ==========

export const NowPlayingSection = memo(function NowPlayingSection({ guildId, onPlayTrack, botStatus }: NowPlayingProps) {
  // Use separate primitive states to prevent unnecessary re-renders
  const [trackTitle, setTrackTitle] = useState('');
  const [trackArtist, setTrackArtist] = useState('');
  const [trackDuration, setTrackDuration] = useState(0);
  const [trackThumbnail, setTrackThumbnail] = useState<string | undefined>();
  const [trackRequesterAvatar, setTrackRequesterAvatar] = useState<string | undefined>();
  const [trackRequesterName, setTrackRequesterName] = useState<string | undefined>();
  const [trackCurrentTime, setTrackCurrentTime] = useState(0);
  const [hasTrack, setHasTrack] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [dominantColor, setDominantColor] = useState<string | null>(null);

  // Global user play history (across all servers)
  const [userHistory, setUserHistory] = useState<RecommendedTrack[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyInitialized, setHistoryInitialized] = useState(false); // Track if user history was fetched

  // Server-wide history (popular in this server)
  const [serverHistory, setServerHistory] = useState<RecommendedTrack[]>([]);
  const [serverHistoryLoading, setServerHistoryLoading] = useState(false);
  const [serverHistoryInitialized, setServerHistoryInitialized] = useState(false);
  const [serverHistoryShowLoading, setServerHistoryShowLoading] = useState(false);
  const [serverHistoryVisible, setServerHistoryVisible] = useState(false);
  const [serverHistoryCollapsing, setServerHistoryCollapsing] = useState(false);
  const [serverHistoryAnimating, setServerHistoryAnimating] = useState(false); // Track if should animate

  // Billboard top charts
  const [topCharts, setTopCharts] = useState<RecommendedTrack[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [chartsInitialized, setChartsInitialized] = useState(false);

  // Track previous bot status to detect online transitions
  const prevBotStatusRef = useRef<'online' | 'offline' | 'starting' | 'idle' | 'playing' | 'paused' | 'unknown' | undefined>(undefined);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(Number(process.env.NEXT_PUBLIC_VOLUMEDEFAULT) || 15);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [loadingPlayPause, setLoadingPlayPause] = useState(false);
  const [loadingSkip, setLoadingSkip] = useState(false);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());
  const [lastSeekTime, setLastSeekTime] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isTwentyFourSeven, setIsTwentyFourSeven] = useState(false);
  const [loading247, setLoading247] = useState(false);
  const last247ToggleRef = useRef<number>(0); // Track when 24/7 was last toggled
  const previousThumbnailRef = useRef<string | undefined>(undefined);
  const previousGuildIdRef = useRef<string | undefined>(undefined);

  const { data: sseData, connected: sseConnected } = useSSE(guildId || null);
  const { user } = useAuth();
  const { canControl, canView, reason: controlReason, loading: permissionLoading } = useControlPermission(guildId);

  // Warning animation state
  const shouldShowWarning = !canControl && !permissionLoading && controlReason !== 'No active player - can start playback';
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningExiting, setWarningExiting] = useState(false);
  const [displayReason, setDisplayReason] = useState('');

  useEffect(() => {
    if (shouldShowWarning) {
      // Show immediately and update reason
      setWarningVisible(true);
      setWarningExiting(false);
      setDisplayReason(controlReason || 'Join a voice channel to control the bot');
    } else if (warningVisible && !warningExiting) {
      // Start exit animation
      setWarningExiting(true);
      const timer = setTimeout(() => {
        setWarningVisible(false);
        setWarningExiting(false);
      }, 300); // Match globals.css animate-fadeOut duration
      return () => clearTimeout(timer);
    }
  }, [shouldShowWarning, warningVisible, warningExiting, controlReason]);

  // Track guildId changes - reset server-specific state but NOT hasTrack
  // hasTrack will be set correctly by SSE init event (cached or fresh)
  // This allows smooth transition when using SSE cache
  useEffect(() => {
    if (previousGuildIdRef.current !== guildId && guildId) {
      // Don't reset hasTrack here - let SSE cache handle it for smooth transition
      // If we reset hasTrack to false, it causes a flash before cached/fresh SSE data arrives

      // Reset server-specific initialized states
      setServerHistoryInitialized(false);
      setServerHistoryShowLoading(false);
      // Note: Don't clear topCharts - Billboard Charts are global, not server-specific
      // Note: userHistory is global, don't clear it
    }
    previousGuildIdRef.current = guildId;
  }, [guildId]);

  // Trigger flip animation when thumbnail changes
  useEffect(() => {
    if (trackThumbnail !== previousThumbnailRef.current && hasTrack) {
      setIsFlipping(true);
      const timer = setTimeout(() => {
        setIsFlipping(false);
      }, 600); // Match animation duration
      previousThumbnailRef.current = trackThumbnail;
      return () => clearTimeout(timer);
    }
  }, [trackThumbnail, hasTrack]);

  // Expose optimistic set current track function for dashboard to call when adding first track
  useEffect(() => {
    const setCurrentTrackOptimistic = (track: { title: string; author: string; duration: number; thumbnail?: string }) => {
      setTrackTitle(track.title);
      setTrackArtist(track.author || 'Unknown Artist');
      setTrackDuration(track.duration || 0);
      setTrackThumbnail(track.thumbnail);
      setTrackCurrentTime(0);
      setLastSyncTime(Date.now());
      setIsPlaying(true);
      setHasTrack(true);
    };

    // Expose function to check if there's a current track
    const hasCurrentTrack = () => hasTrack;

    (window as any).__nowPlayingSetCurrent = setCurrentTrackOptimistic;
    (window as any).__nowPlayingHasTrack = hasCurrentTrack;

    return () => {
      delete (window as any).__nowPlayingSetCurrent;
      delete (window as any).__nowPlayingHasTrack;
    };
  }, [hasTrack]); // Re-run when hasTrack changes to update the closure

  // Handle SSE messages
  useEffect(() => {
    if (!sseData) return;

    console.log(`[NowPlayingSection] SSE event: type=${sseData.type}, guildId=${sseData.guildId}`);

    if (sseData.type === 'init' || sseData.type === 'trackStart') {
      const track = sseData.data.track || sseData.data.current;

      // Always update 24/7 mode from init event (regardless of track)
      // BUT skip if user recently toggled (to prevent SSE init from overwriting)
      if (sseData.type === 'init' && typeof sseData.data.twentyFourSeven === 'boolean') {
        // Check both ref and sessionStorage (sessionStorage survives page refresh)
        let lastToggleTime = last247ToggleRef.current;
        try {
          const storedTime = sessionStorage.getItem(`247_toggle_${guildId}`);
          if (storedTime && parseInt(storedTime, 10) > lastToggleTime) {
            lastToggleTime = parseInt(storedTime, 10);
            last247ToggleRef.current = lastToggleTime; // Update ref too
          }
        } catch (e) {
          // Ignore sessionStorage errors
        }

        const timeSinceToggle = Date.now() - lastToggleTime;
        if (timeSinceToggle > 5000) { // Only update from SSE if no recent toggle
          console.log(`[NowPlayingSection] Setting 24/7 mode from init: ${sseData.data.twentyFourSeven}`);
          setIsTwentyFourSeven(sseData.data.twentyFourSeven);
        } else {
          console.log(`[NowPlayingSection] Skipping 24/7 init update (recently toggled ${timeSinceToggle}ms ago)`);
        }
      }

      if (track) {
        console.log(`[NowPlayingSection] New track: ${track.title}, thumbnail: ${track.thumbnail}`);
        setTrackTitle(track.title || '');
        setTrackArtist(track.author || 'Unknown Artist');
        setTrackDuration(track.duration || 0);
        setTrackThumbnail(track.thumbnail);
        setTrackRequesterAvatar(track.requesterAvatar);
        setTrackRequesterName(track.requesterName);
        setTrackCurrentTime(sseData.data.position || 0);
        setLastSyncTime(Date.now());
        setIsPlaying(sseData.data.playing ?? true);
        setHasTrack(true);
        // Update volume if provided
        if (typeof sseData.data.volume === 'number') {
          setVolume(sseData.data.volume);
        }
      } else {
        // init event but no track - server is not playing
        setHasTrack(false);
        setIsPlaying(false);
      }
    } else if (sseData.type === 'trackEnd') {
      // Check if jumpToTrack just happened - suppress trackEnd to prevent empty state flash
      const jumpTime = typeof window !== 'undefined' ? (window as any).__jumpToTrackInProgress : 0;
      if (jumpTime && Date.now() - jumpTime < 2000) {
        console.log(`[NowPlayingSection] Suppressing trackEnd after jumpToTrack (${Date.now() - jumpTime}ms ago)`);
        // Clear the flag after suppressing
        (window as any).__jumpToTrackInProgress = 0;
        // Also clear the queue suppress flag since we're not calling __queueOptimisticSkip
        if (typeof window !== 'undefined' && (window as any).__queueClearSuppressFlag) {
          (window as any).__queueClearSuppressFlag();
        }
        return; // Skip trackEnd handling - optimistic update already shows correct track
      }

      // Track ended - check if there's a next track in queue for optimistic update
      console.log(`[NowPlayingSection] trackEnd: checking queue for next track`);

      const hasQueueTracks = typeof window !== 'undefined' && (window as any).__queueHasTracks?.();
      const nextTrack = typeof window !== 'undefined' && (window as any).__queueGetFirstTrack?.();

      if (hasQueueTracks && nextTrack) {
        // Optimistically show next track from queue
        console.log(`[NowPlayingSection] Optimistic update: next track is ${nextTrack.title}`);
        setTrackTitle(nextTrack.title || '');
        setTrackArtist(nextTrack.artist || 'Unknown Artist');
        setTrackDuration(nextTrack.duration || 0);
        // Queue tracks usually don't have thumbnail, keep current or clear
        setTrackCurrentTime(0);
        setLastSyncTime(Date.now());
        setIsPlaying(true);

        // Trigger optimistic queue update to remove first track with animation
        if ((window as any).__queueOptimisticSkip) {
          (window as any).__queueOptimisticSkip();
        }
      } else {
        // No more tracks in queue - clear with transition
        console.log(`[NowPlayingSection] No more tracks in queue, clearing`);
        setIsTransitioning(true);
        setTimeout(() => {
          setHasTrack(false);
          setIsPlaying(false);
          setTrackTitle('');
          setTrackArtist('');
          setTrackDuration(0);
          setTrackThumbnail(undefined);
          setTrackCurrentTime(0);
          setIsTransitioning(false);
        }, 300);
      }
    } else if (sseData.type === 'queueEnd') {
      // Queue is empty - clear current track
      console.log(`[NowPlayingSection] queueEnd: queue is empty`);
      setIsTransitioning(true);
      setTimeout(() => {
        setHasTrack(false);
        setIsPlaying(false);
        setTrackTitle('');
        setTrackArtist('');
        setTrackDuration(0);
        setTrackThumbnail(undefined);
        setTrackCurrentTime(0);
        setIsTransitioning(false);
      }, 300);
    } else if (sseData.type === 'volumeChange' && typeof sseData.data.volume === 'number') {
      console.log(`[NowPlayingSection] Volume changed: ${sseData.data.volume}`);
      setVolume(sseData.data.volume);
    } else if (sseData.type === 'playerPause') {
      // Player paused by another client
      console.log(`[NowPlayingSection] Player paused by ${sseData.data.by}`);
      setIsPlaying(false);
      if (typeof sseData.data.position === 'number') {
        setTrackCurrentTime(sseData.data.position);
        setLastSyncTime(Date.now());
      }
    } else if (sseData.type === 'playerResume') {
      // Player resumed by another client
      console.log(`[NowPlayingSection] Player resumed by ${sseData.data.by}`);
      setIsPlaying(true);
      if (typeof sseData.data.position === 'number') {
        setTrackCurrentTime(sseData.data.position);
        setLastSyncTime(Date.now());
      }
    } else if (sseData.type === 'playerSeek') {
      // Player seeked by another client
      console.log(`[NowPlayingSection] Player seeked by ${sseData.data.by}`);
      if (typeof sseData.data.position === 'number') {
        setTrackCurrentTime(sseData.data.position);
        setLastSyncTime(Date.now());
        setLastSeekTime(Date.now()); // Mark as seek to avoid stalling logic
      }
    } else if (sseData.type === 'twentyFourSevenChange') {
      // 24/7 mode changed by another client
      console.log(`[NowPlayingSection] 24/7 mode changed by ${sseData.data.by}: ${sseData.data.enabled}`);
      setIsTwentyFourSeven(sseData.data.enabled);
    } else if (sseData.type === 'userHistoryUpdate') {
      // User history updated via SSE (when a track is played)
      console.log(`[NowPlayingSection] User history update received`);
      if (sseData.data.tracks && Array.isArray(sseData.data.tracks)) {
        setUserHistory(sseData.data.tracks);
      }
    } else if (sseData.type === 'serverHistoryUpdate') {
      // Server history updated via SSE (when a track is played)
      console.log(`[NowPlayingSection] Server history update received`);
      if (sseData.data.tracks && Array.isArray(sseData.data.tracks)) {
        setServerHistory(sseData.data.tracks);
        // Make section visible if it was hidden and now has data
        if (sseData.data.tracks.length > 0 && !serverHistoryVisible) {
          setServerHistoryVisible(true);
        }
      }
    }
  }, [sseData, serverHistoryVisible]);

  // Fallback: fetch player data
  useEffect(() => {
    if (!guildId || sseConnected) return;

    const fetchPlayerData = async () => {
      try {
        const response = await fetch(`/api/player/${guildId}`);

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('[NowPlaying] Bot returned non-JSON response - bot may be offline');
          setHasTrack(false);
          return;
        }

        const data = await response.json();

        if (data.track) {
          // Check if this is a stale track (finished playing but still returned)
          // This happens when queue ends with 24/7 mode - the last track info remains
          const trackDurationMs = data.track.duration || 0;
          const positionMs = data.position || 0;
          const isTrackFinished = !data.playing && trackDurationMs > 0 && positionMs >= trackDurationMs - 1000;

          if (isTrackFinished) {
            // Track has finished, clear the display
            setHasTrack(false);
            // Keep 24/7 mode status updated
            if (typeof data.twentyFourSeven === 'boolean') {
              setIsTwentyFourSeven(prev => data.twentyFourSeven !== prev ? data.twentyFourSeven : prev);
            }
          } else {
            // Active track - update display
            // Compare before setting to avoid unnecessary updates
            setTrackTitle(prev => data.track.title !== prev ? data.track.title : prev);
            setTrackArtist(prev => {
              const newVal = data.track.author || 'Unknown Artist';
              return newVal !== prev ? newVal : prev;
            });
            setTrackDuration(prev => {
              const newVal = data.track.duration || 0;
              return newVal !== prev ? newVal : prev;
            });
            setTrackThumbnail(prev => data.track.thumbnail !== prev ? data.track.thumbnail : prev);

            // Always update position and sync time for smooth playback
            setTrackCurrentTime(data.position || 0);
            setLastSyncTime(Date.now());

            setIsPlaying(prev => data.playing !== prev ? data.playing ?? false : prev);
            setHasTrack(true);

            // Update volume from player
            if (typeof data.volume === 'number') {
              setVolume(prev => data.volume !== prev ? data.volume : prev);
            }

            // Update 24/7 mode from player data
            if (typeof data.twentyFourSeven === 'boolean') {
              setIsTwentyFourSeven(prev => data.twentyFourSeven !== prev ? data.twentyFourSeven : prev);
            }
          }
        } else {
          setHasTrack(false);
          // Also update 24/7 mode even if no track playing
          if (typeof data.twentyFourSeven === 'boolean') {
            setIsTwentyFourSeven(prev => data.twentyFourSeven !== prev ? data.twentyFourSeven : prev);
          }
        }
      } catch (error: any) {
        // Silently handle network errors (bot offline) - don't spam console
        if (error?.name !== 'TypeError' && !error?.message?.includes('fetch')) {
          console.error('[NowPlaying] Failed to fetch:', error);
        }
        // Clear track when bot is offline
        setHasTrack(false);
      }
    };

    fetchPlayerData();
    const interval = setInterval(fetchPlayerData, 5000);
    return () => clearInterval(interval);
  }, [guildId, sseConnected]);

  // Helper: Convert RGB to HSL
  const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s * 100, l * 100];
  };

  // Helper: Convert HSL to RGB hex
  const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Extract dominant color from thumbnail
  useEffect(() => {
    if (!trackThumbnail) {
      setDominantColor(null);
      // Clear CSS custom property when no thumbnail
      document.documentElement.style.setProperty('--bg-dominant-color', '');
      return;
    }

    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.src = trackThumbnail;

    img.onload = () => {
      try {
        const fac = new FastAverageColor();

        // Try dominant first
        let color = fac.getColor(img, { algorithm: 'dominant' });
        let [h, s, l] = rgbToHsl(color.value[0], color.value[1], color.value[2]);

        // If color is too bright (white-ish) or too desaturated, try different algorithm
        if (l > 80 || s < 15) {
          console.log(`[Color] Dominant too light/desaturated (L:${l.toFixed(0)}, S:${s.toFixed(0)}), trying sqrt...`);
          const sqrtColor = fac.getColor(img, { algorithm: 'sqrt' });
          const [h2, s2, l2] = rgbToHsl(sqrtColor.value[0], sqrtColor.value[1], sqrtColor.value[2]);

          // Use sqrt if it's more vivid
          if (s2 > s || l2 < l) {
            color = sqrtColor;
            [h, s, l] = [h2, s2, l2];
            console.log(`[Color] Using sqrt: H:${h.toFixed(0)}, S:${s.toFixed(0)}, L:${l.toFixed(0)}`);
          }
        }

        // Adjust color if still too light or desaturated
        let finalHex = color.hex;
        if (l > 70) {
          // Darken overly bright colors
          l = Math.max(40, l - 30);
          finalHex = hslToHex(h, Math.min(s * 1.3, 100), l);
          console.log(`[Color] Darkened: ${finalHex}`);
        } else if (s < 25 && l > 30) {
          // Boost saturation for grayish colors
          s = Math.min(s * 2.5, 60);
          finalHex = hslToHex(h, s, Math.min(l, 50));
          console.log(`[Color] Saturated: ${finalHex}`);
        }

        setDominantColor(finalHex);
        // Export color to CSS custom property for layout background
        document.documentElement.style.setProperty('--bg-dominant-color', finalHex);
      } catch (e) {
        console.error('Failed to extract color:', e);
        setDominantColor(null);
        document.documentElement.style.setProperty('--bg-dominant-color', '');
      }
    };

    img.onerror = () => {
      setDominantColor(null);
      document.documentElement.style.setProperty('--bg-dominant-color', '');
    };
  }, [trackThumbnail]);

  // Load GLOBAL user play history (across all servers)
  const loadUserHistory = useCallback(async () => {
    const userIdForHistory = user?.discordId || user?.id;

    if (!userIdForHistory || hasTrack) {
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      // Use global user history API (not guild-specific)
      const res = await fetch(`/api/player/user-history?userId=${encodeURIComponent(userIdForHistory)}`);

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('[NowPlaying] User history API returned non-JSON response');
        setUserHistory([]);
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch history');
      }

      const items: RecommendedTrack[] = Array.isArray(json.tracks) ? json.tracks : [];
      // Show up to 4 most played tracks
      const topPlayed = items.slice(0, 4);
      setUserHistory(topPlayed);
    } catch (error: any) {
      console.warn('[NowPlaying] Failed to load user history:', error?.message);
      setUserHistory([]);
      setHistoryError(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.discordId, user?.id, hasTrack]);

  // Load server-wide history (popular in this server)
  const loadServerHistory = useCallback(async () => {
    if (!guildId || hasTrack) {
      return;
    }

    setServerHistoryLoading(true);

    try {
      const res = await fetch(`/api/player/${guildId}/server-history`);

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('[NowPlaying] Server history API returned non-JSON response');
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch server history');
      }

      const items: RecommendedTrack[] = Array.isArray(json.tracks) ? json.tracks : [];
      // Show up to 4 most played tracks in this server
      const topPlayed = items.slice(0, 4);
      // Removed immediate setServerHistory update to prevent empty flash

      // Update visibility with smooth transition
      if (topPlayed.length > 0) {
        setServerHistory(topPlayed); // Update data only if available

        // Only animate if not already visible
        if (!serverHistoryVisible) {
          setServerHistoryAnimating(true);
          // Clear animating flag after animation completes
          setTimeout(() => setServerHistoryAnimating(false), 400);
        }
        setServerHistoryVisible(true);
        setServerHistoryCollapsing(false);
      } else if (serverHistoryVisible) {
        // Trigger collapse animation
        // Don't clear serverHistory yet! Keep showing old data while collapsing
        setServerHistoryCollapsing(true);
        setTimeout(() => {
          setServerHistoryVisible(false);
          setServerHistoryCollapsing(false);
          setServerHistory([]); // Clear AFTER animation completes
        }, 300);
      } else {
        // Not visible and no data, ensure empty
        setServerHistory([]);
      }
    } catch (error: any) {
      console.warn('[NowPlaying] Failed to load server history:', error?.message);
      // Trigger collapse animation on error
      if (serverHistoryVisible) {
        setServerHistoryCollapsing(true);
        setTimeout(() => {
          setServerHistoryVisible(false);
          setServerHistoryCollapsing(false);
          setServerHistory([]); // Clear AFTER animation
        }, 300);
      } else {
        setServerHistory([]);
      }
    } finally {
      setServerHistoryLoading(false);
      setServerHistoryInitialized(true);
    }
  }, [guildId, hasTrack, serverHistoryVisible]);

  // Load Billboard top charts - GLOBAL, not server-specific
  // Only needs to run once when component mounts and there's no track playing
  const loadTopCharts = useCallback(async () => {
    // Billboard charts are global - don't depend on guildId
    if (hasTrack || chartsInitialized) {
      return;
    }

    setChartsLoading(true);

    try {
      const billboardData = await fetchBillboardChart();
      if (billboardData && billboardData.tracks.length > 0) {
        const charts = billboardToChartTracks(billboardData.tracks);
        // Show top 10
        const top10 = charts.slice(0, 10);

        // Compare with existing data to avoid unnecessary re-render
        setTopCharts((prev) => {
          // If same length and all IDs match, don't update
          if (prev.length === top10.length &&
            prev.every((track, i) => track.id === top10[i]?.id)) {
            return prev;
          }
          return top10;
        });
      } else {
        setTopCharts((prev) => prev.length === 0 ? prev : []);
      }
    } catch (error: any) {
      console.error('Failed to load Billboard chart:', error);
      setTopCharts((prev) => prev.length === 0 ? prev : []);
    } finally {
      setChartsLoading(false);
      setChartsInitialized(true);
    }
  }, [hasTrack, chartsInitialized]);

  // Fetch all recommendations when nothing is playing
  useEffect(() => {
    loadUserHistory();
    loadServerHistory();
    loadTopCharts();
  }, [loadUserHistory, loadServerHistory, loadTopCharts]);

  // Detect when bot comes online and reset initialized flags to trigger refetch
  useEffect(() => {
    // Define which states mean the bot is "working" (not offline)
    const workingStates = ['online', 'starting', 'idle', 'playing', 'paused'];
    const isNowWorking = botStatus && workingStates.includes(botStatus);
    const wasOffline = prevBotStatusRef.current === 'offline' || prevBotStatusRef.current === 'unknown';

    // If bot was offline/unknown and is now in a working state, reset flags to trigger refetch
    if (wasOffline && isNowWorking) {
      console.log('[NowPlaying] Bot came online, resetting data initialization flags');
      setHistoryInitialized(false);
      setServerHistoryInitialized(false);
      setChartsInitialized(false);
    }
    // Update previous status ref
    prevBotStatusRef.current = botStatus;
  }, [botStatus]);

  // Delay showing server history loading skeleton to prevent layout shift
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (serverHistoryLoading) {
      // Delay showing loading skeleton by 500ms
      timeoutId = setTimeout(() => {
        setServerHistoryShowLoading(true);
        // Show loading means we should be visible
        if (!serverHistoryVisible && !serverHistoryCollapsing) {
          setServerHistoryVisible(true);
        }
      }, 500);
    } else {
      // Immediately hide loading when done
      setServerHistoryShowLoading(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [serverHistoryLoading, serverHistoryVisible, serverHistoryCollapsing]);

  // All callbacks BEFORE conditional returns (Rules of Hooks)
  const handlePlayPause = useCallback(async () => {
    if (!guildId) return;

    // Optimistic update
    const previousState = isPlaying;
    const wasPaused = !previousState; // true if we're resuming from pause

    if (!wasPaused) {
      // PAUSING: Calculate and save the current position before pausing
      const currentPosition = trackCurrentTime + (Date.now() - lastSyncTime);
      setTrackCurrentTime(Math.min(currentPosition, trackDuration));
    }
    // RESUMING: Just reset lastSyncTime, keep trackCurrentTime as-is
    // The timer will continue from where it was paused

    setIsPlaying(!previousState);
    setLastSyncTime(Date.now());
    setLoadingPlayPause(true);

    try {
      const action = previousState ? 'pause' : 'resume';
      const response = await fetch(`/api/player/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });

      if (!response.ok) {
        // Revert on error
        setIsPlaying(previousState);
      }
    } catch (error) {
      // Revert on error
      setIsPlaying(previousState);
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to toggle play/pause:', error);
      }
    } finally {
      setLoadingPlayPause(false);
    }
  }, [guildId, isPlaying, user, trackCurrentTime, lastSyncTime, trackDuration]);

  const handleSkip = useCallback(async () => {
    if (!guildId) return;

    setLoadingSkip(true);

    // Check if queue has tracks
    const hasQueueTracks = typeof window !== 'undefined' && (window as any).__queueHasTracks?.();

    if (!hasQueueTracks) {
      // Queue is empty - optimistically clear current track immediately with transition
      setIsTransitioning(true);
      setTimeout(() => {
        setHasTrack(false);
        setIsPlaying(false);
        setTrackTitle('');
        setTrackArtist('');
        setTrackDuration(0);
        setTrackThumbnail(undefined);
        setTrackCurrentTime(0);
        setIsTransitioning(false);
      }, 300);
    }
    // If queue has tracks, DO NOT optimistically skip here. 
    // Wait for 'trackEnd' SSE event to handle the transition and queue update.
    // This prevents "double skipping" (once locally, once from SSE).

    try {
      const response = await fetch(`/api/player/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip', user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });

      // SSE will update with next track if available
      // If queue is empty, trackEnd event will clear the UI
    } catch (error) {
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to skip:', error);
      }
    } finally {
      setLoadingSkip(false);
    }
  }, [guildId, user]);

  const handlePrevious = useCallback(async () => {
    if (!guildId) return;

    // Optimistic update - reset to beginning immediately
    const previousTime = trackCurrentTime;
    setTrackCurrentTime(0);
    setLastSyncTime(Date.now());
    setLoadingPrevious(true);

    try {
      const response = await fetch(`/api/player/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'previous', user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });

      if (!response.ok) {
        // Revert on error
        setTrackCurrentTime(previousTime);
      }
    } catch (error) {
      // Revert on error
      setTrackCurrentTime(previousTime);
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to go previous:', error);
      }
    } finally {
      setLoadingPrevious(false);
    }
  }, [guildId, user, trackCurrentTime]);

  const handleSeek = useCallback(async (position: number) => {
    if (!guildId) return;
    try {
      const response = await fetch(`/api/player/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seek', value: position, user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });
      if (response.ok) {
        setTrackCurrentTime(position);
        setLastSyncTime(Date.now());
        setLastSeekTime(Date.now());
      }
    } catch (error) {
      // Silent fail for network errors (bot offline)
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to seek:', error);
      }
    }
  }, [guildId, user]);

  const handleVolumeChange = useCallback(async (newVolume: number) => {
    if (!guildId) return;
    // Update local state immediately for responsive UI
    setVolume(newVolume);
    try {
      await fetch(`/api/player/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'volume', value: newVolume, user: user ? { username: user.username, discordId: user.discordId } : undefined }),
      });
    } catch (error) {
      // Silent fail for network errors (bot offline)
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to change volume:', error);
      }
    }
  }, [guildId, user]);

  const handle247Toggle = useCallback(async () => {
    if (!guildId) return;

    // Read current state before toggling
    const currentState = isTwentyFourSeven;
    const newState = !currentState;

    console.log(`[24/7] Toggle requested: ${currentState} → ${newState}`);

    // Mark that we just toggled - persist in sessionStorage to survive refresh
    const toggleTime = Date.now();
    last247ToggleRef.current = toggleTime;
    try {
      sessionStorage.setItem(`247_toggle_${guildId}`, String(toggleTime));
    } catch (e) {
      // Ignore sessionStorage errors
    }

    setLoading247(true);
    setIsTwentyFourSeven(newState); // Optimistic update

    const apiUrl = `${process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001'}/api/guild/${guildId}/247`;
    const payload = JSON.stringify({
      enabled: newState,
      user: user ? { username: user.username, discordId: user.discordId } : undefined
    });

    console.log(`[24/7] Calling API: ${apiUrl}`);

    // Use XMLHttpRequest to bypass potential connection queue issues
    // XHR can sometimes get through when fetch is queued
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl, true); // async mode
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 10000; // 10 second timeout

      xhr.onload = function () {
        console.log(`[24/7] XHR response status: ${xhr.status}`);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log(`[24/7] XHR response:`, data);
            setIsTwentyFourSeven(data.enabled);
          } catch (e) {
            console.log(`[24/7] XHR response parse error`);
          }
        }
        setLoading247(false);
      };

      xhr.onerror = function () {
        console.error('[24/7] XHR error');
        setLoading247(false);
      };

      xhr.ontimeout = function () {
        console.error('[24/7] XHR timeout');
        setLoading247(false);
      };

      xhr.send(payload);
      console.log(`[24/7] XHR request sent`);

    } catch (error) {
      console.error('[24/7] XHR failed:', error);
      setIsTwentyFourSeven(currentState); // Revert
      setLoading247(false);
    }
  }, [guildId, user, isTwentyFourSeven]);

  const handlePlayRecommendation = useCallback(async (track: RecommendedTrack) => {
    if (!guildId || !canControl) return;

    // If onPlayTrack is provided (from parent), use it instead of internal logic
    // This allows the parent to handle voice channel selection logic centrally
    if (onPlayTrack) {
      onPlayTrack(track);
      return;
    }

    setLoadingRecommendation(true);
    const userInfo = user ? { username: user.username, discordId: user.discordId } : undefined;

    // Determine query based on source platform
    let query: string;

    if (track.source === 'spotify' && track.url) {
      // Spotify: send only URL
      query = track.url;
    } else if (track.url) {
      // YouTube/Other: send (artist) title + URL
      query = `${track.artist ? `(${track.artist}) ` : ''}${track.title} ${track.url}`.trim();
    } else {
      // No URL: send (artist) title only
      query = `${track.artist ? `(${track.artist}) ` : ''}${track.title}`.trim();
    }

    try {
      const response = await fetch(`/api/player/${guildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'play', value: query, user: userInfo }),
      });

      if (response.ok) {
        // Optimistically update UI while waiting for SSE
        setTrackTitle(track.title || 'Unknown Track');
        setTrackArtist(track.artist || 'Unknown Artist');
        setTrackDuration(track.duration || 0);
        setTrackThumbnail(track.thumbnail);
        setTrackCurrentTime(0);
        setLastSyncTime(Date.now());
        setHasTrack(true);
        setIsPlaying(true);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'TypeError') {
        console.error('Failed to start recommendation track:', error);
      }
    } finally {
      setLoadingRecommendation(false);
    }
  }, [guildId, user, canControl, onPlayTrack]);

  // Conditional render AFTER all hooks

  if (!hasTrack) {
    const hasHistory = userHistory.length > 0;
    const hasServerHistory = serverHistory.length > 0;
    const hasCharts = topCharts.length > 0;

    // Only render server history section if:
    // 1. Still loading (show skeleton), OR
    // 2. Has data to show (visible and not empty)
    // Don't show empty message - just hide the section if no data
    const shouldRenderServerHistory = serverHistoryShowLoading || (serverHistoryVisible && hasServerHistory) || serverHistoryCollapsing;

    return (
      <div className="smooth-layout-container">
        {/* Permission warning for view-only users */}
        {/* Permission warning for view-only users */}
        {warningVisible && (
          <div className={`flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm overflow-hidden ${warningExiting ? 'animate-collapseHeight' : 'animate-expandHeight'}`}>
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>{displayReason}</span>
          </div>
        )}

        {/* 24/7 Mode Toggle - visible even when no track playing */}
        <div className="flex items-center justify-center py-4 border-b border-white/5">
          <button
            onClick={handle247Toggle}
            disabled={!canControl || loading247}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${isTwentyFourSeven
              ? 'bg-purple-600 text-white hover:bg-purple-500'
              : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isTwentyFourSeven ? 'Disable 24/7 mode' : 'Enable 24/7 mode - Bot stays in voice channel'}
          >
            <Moon className={`h-4 w-4 ${loading247 ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-medium">24/7</span>
            {isTwentyFourSeven && <span className="text-xs opacity-75">ON</span>}
          </button>
        </div>

        {/* User Play History - global user history (only show when has data) */}
        {hasHistory && (
          <div className="animate-fadeIn animate-slideUp">
            <RecommendationGrid
              tracks={userHistory}
              loading={false}
              error={historyError}
              onPlay={canControl ? handlePlayRecommendation : undefined}
              onRetry={historyError ? loadUserHistory : undefined}
              title="เพลงที่คุณฟังบ่อย"
              subtitle="เพลงที่เล่นบ่อยที่สุดของคุณในทุก Server"
              emptyMessage="ยังไม่มีประวัติการฟังเพลง"
              columns={4}
            />
          </div>
        )}

        {/* Server Play History - popular in this server (smooth expand/collapse) */}
        {shouldRenderServerHistory && (
          <div
            key="server-history"
            className={`${serverHistoryCollapsing
              ? 'animate-smoothCollapse'
              : serverHistoryAnimating
                ? 'animate-smoothExpand'
                : ''}`}
          >
            <RecommendationGrid
              tracks={serverHistory}
              loading={serverHistoryShowLoading}
              error={null}
              onPlay={canControl ? handlePlayRecommendation : undefined}
              title="🏠 เพลงฮิตใน Server"
              subtitle="เพลงยอดนิยมใน Server นี้"
              emptyMessage=""
              columns={4}
            />
          </div>
        )}

        {/* Billboard Top Charts - show when loading or has data */}
        {(chartsLoading || (chartsInitialized && hasCharts)) && (
          <div
            key="top-charts"
            className="animate-fadeIn animate-slideUp transition-transform duration-400 ease-out"
            style={{ animationDelay: shouldRenderServerHistory ? '0s' : '0.1s' }}
          >
            <RecommendationGrid
              tracks={topCharts}
              loading={chartsLoading}
              error={null}
              onPlay={canControl && hasCharts ? handlePlayRecommendation : undefined}
              title="🔥 Top Charts"
              subtitle="เพลงฮิตจาก Billboard"
              emptyMessage="ไม่สามารถโหลด Billboard Charts ได้"
              columns={5}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`card-surface relative overflow-hidden p-6 transition-all duration-500 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
      {/* Dynamic color gradient from thumbnail */}
      <div
        className="absolute inset-0 transition-all duration-1000 ease-out"
        style={{
          background: dominantColor
            ? `linear-gradient(135deg, ${dominantColor}40 0%, ${dominantColor}20 30%, transparent 70%)`
            : 'transparent',
          opacity: dominantColor ? 1 : 0
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="relative z-10">
        <AlbumArt thumbnail={trackThumbnail} title={trackTitle} isFlipping={isFlipping} requesterAvatar={trackRequesterAvatar} requesterName={trackRequesterName} />
        <TrackInfo title={trackTitle} artist={trackArtist} />
        <ProgressBarWithTimer
          initialTime={trackCurrentTime}
          duration={trackDuration}
          isPlaying={isPlaying}
          lastSyncTime={lastSyncTime}
          lastSeekTime={lastSeekTime}
          onSeek={canControl ? handleSeek : undefined}
        />
        <PlayerControls
          isPlaying={isPlaying}
          loadingPrevious={loadingPrevious}
          loadingPlayPause={loadingPlayPause}
          loadingSkip={loadingSkip}
          canControl={canControl}
          controlReason={controlReason}
          onPlayPause={handlePlayPause}
          onSkip={handleSkip}
          onPrevious={handlePrevious}
        />
        <VolumeControl volume={volume} onVolumeChange={handleVolumeChange} disabled={!canControl} />

        {/* 24/7 Mode Toggle */}
        <div className="flex items-center justify-center mt-4">
          <button
            onClick={handle247Toggle}
            disabled={!canControl || loading247}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${isTwentyFourSeven
              ? 'bg-purple-600 text-white hover:bg-purple-500'
              : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isTwentyFourSeven ? 'Disable 24/7 mode' : 'Enable 24/7 mode - Bot stays in voice channel'}
          >
            <Moon className={`h-4 w-4 ${loading247 ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-medium">24/7</span>
            {isTwentyFourSeven && <span className="text-xs opacity-75">ON</span>}
          </button>
        </div>
      </div>
    </div>
  );
});
