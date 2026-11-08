"use client";

import type { PlayerState } from "@narze/shared";
import { progressAt } from "@narze/shared/progress";
import { useEffect, useRef } from "react";
import styles from "./now-playing.module.css";

const NEVER = Number.NEGATIVE_INFINITY;

export function formatTime(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * Read-only progress (spec #103), drawn per animation frame without React re-renders: the bar's
 * width and the elapsed label are written straight to the DOM from `progressAt`.
 */
export function Progress({ state, onSeek }: { state: PlayerState; onSeek?: (positionMs: number) => void }) {
  const fill = useRef<HTMLDivElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const shown = useRef(state.positionMs);
  /** While the user drags the seek handle, the bar follows the handle, not the clock. */
  const dragging = useRef<number | null>(null);
  const duration = state.current?.durationMs ?? 0;

  useEffect(() => {
    let frame = 0;
    const lastSeekAt = state.lastSeekAt ?? NEVER;
    const clock = {
      positionMs: state.positionMs,
      syncedAt: state.syncedAt,
      paused: state.paused,
      durationMs: duration,
    };
    const draw = () => {
      shown.current = dragging.current ?? progressAt(clock, Date.now(), shown.current, lastSeekAt);
      const ratio = duration > 0 ? shown.current / duration : 0;
      if (fill.current) fill.current.style.transform = `scaleX(${ratio})`;
      if (elapsed.current) elapsed.current.textContent = formatTime(shown.current);
      bar.current?.setAttribute("aria-valuenow", String(Math.round(shown.current / 1000)));
      if (!state.paused || dragging.current !== null) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [state.positionMs, state.syncedAt, state.paused, state.lastSeekAt, duration]);

  return (
    <div className={styles.progress}>
      <div
        ref={bar}
        className={styles.track}
        role="progressbar"
        aria-label="ความคืบหน้าของเพลง"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round(state.positionMs / 1000)}
      >
        <div ref={fill} className={styles.fill} />
        {onSeek && duration > 0 ? (
          <input
            type="range"
            className={styles.seek}
            min={0}
            max={duration}
            step={1000}
            defaultValue={state.positionMs}
            aria-label="เลื่อนไปยังเวลา"
            onPointerDown={(e) => {
              dragging.current = Number(e.currentTarget.value);
            }}
            onChange={(e) => {
              if (dragging.current !== null) dragging.current = Number(e.currentTarget.value);
            }}
            onPointerUp={(e) => {
              dragging.current = null;
              onSeek(Number(e.currentTarget.value));
            }}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End")
                onSeek(Number(e.currentTarget.value));
            }}
            data-testid="seek"
          />
        ) : null}
      </div>
      <p className={`num ${styles.times}`}>
        <span ref={elapsed} data-testid="elapsed">
          {formatTime(state.positionMs)}
        </span>
        <span>{formatTime(duration)}</span>
      </p>
    </div>
  );
}
