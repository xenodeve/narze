/** What the server last said about playback position (a subset of Player State). */
export interface PlaybackClock {
  positionMs: number;
  /** When `positionMs` was true, on the client's clock. */
  syncedAt: number;
  paused: boolean;
  durationMs: number;
}

/** A backwards correction smaller than this is treated as clock jitter, not a rewind. */
export const BACKWARD_TOLERANCE_MS = 5_000;
/** After a seek, any correction is applied for this long. */
export const SEEK_GRACE_MS = 2_000;

/**
 * The position to draw now (spec #103). While playing it interpolates from the last sync and never
 * ticks backwards by less than 5 s unless a seek happened in the last 2 s; while paused it holds
 * what is shown and snaps to the server only past 5 s or right after a seek.
 */
export function progressAt(clock: PlaybackClock, now: number, shownMs: number, lastSeekAt: number): number {
  const recentSeek = now - lastSeekAt < SEEK_GRACE_MS;
  if (clock.paused) {
    return recentSeek || Math.abs(clock.positionMs - shownMs) > BACKWARD_TOLERANCE_MS ? clock.positionMs : shownMs;
  }
  const target = Math.min(clock.positionMs + Math.max(0, now - clock.syncedAt), clock.durationMs);
  const smallStepBack = target < shownMs && shownMs - target < BACKWARD_TOLERANCE_MS;
  return smallStepBack && !recentSeek ? shownMs : target;
}
