"use client";

import type { PlayerAction, Track } from "@narze/shared";
import { moveTrack } from "@narze/shared/queue";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { LikeButton, libraryTrack } from "@/components/like-button";
import { formatTime } from "@/components/now-playing/progress";
import { explain, sendCommand } from "@/lib/control";
import { useTokenHex } from "@/lib/tokens";
import type { Permission } from "@/lib/use-player";
import styles from "./queue-panel.module.css";

/** DESIGN.md §7: `row` 360 ms in from −6px, a reorder glides 320 ms, both on `--ease`. */
const EASE = [0.23, 1, 0.32, 1] as const;
const ROW = { duration: 0.36, ease: EASE, layout: { duration: 0.32, ease: EASE } };
/** A removed row fades and folds its height, so the rows below close up instead of snapping. */
const EXIT = { duration: 0.24, ease: EASE };

// Touch: swipe a row to remove it (the supplied SwipeRow); client-only, like every supplied canvas/gesture.
const SwipeRow = dynamic(() => import("@/components/vendor/swipe-row/SwipeRow"), { ssr: false });

/**
 * SwipeRow captures the pointer on its surface at pointerdown, which retargets the click away from
 * buttons inside the row. Buttons and the drag handle keep their pointer to themselves.
 */
const keepFromSwipe = (e: React.PointerEvent) => e.stopPropagation();

const removeAt = (queue: Track[], index: number) => queue.filter((_, i) => i !== index);

/** An acknowledged edit whose state update never arrives (lost event) stops showing the guess. */
const GUESS_TIMEOUT_MS = 5_000;

/** Stable keys: v5 used positions, so every edit re-keyed every row. A repeated track gets #2, #3… */
function keysOf(queue: Track[]): string[] {
  const seen = new Map<string, number>();
  return queue.map((t) => {
    const n = (seen.get(t.uri) ?? 0) + 1;
    seen.set(t.uri, n);
    return `${t.uri}#${n}`;
  });
}

interface QueuePanelProps {
  guildId: string;
  queue: Track[];
  revision: number;
  permission: Permission;
  /** Index announced by `queue:jump`: that row animates out before the update (spec #39). */
  jumping: number | null;
}

/**
 * The upcoming queue (#102): play-now, remove, clear with confirm, and reorder by pointer drag,
 * keyboard (handle + arrow keys, announced) or, on touch, swipe-to-remove. Edits are optimistic and
 * the server's next state (or a refusal) replaces them.
 */
export function QueuePanel({ guildId, queue, revision, permission, jumping }: QueuePanelProps) {
  const [optimistic, setOptimistic] = useState<Track[] | null>(null);
  // The supplied SwipeRow picks its drawer text from a hex colour; a CSS variable always gave white,
  // which is 2.79:1 on the dark theme's red (#114). The theme's own hex lets it choose.
  const danger = useTokenHex("--danger", "#c4302b");
  const [message, setMessage] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const shown = optimistic ?? queue;
  const keys = useMemo(() => keysOf(shown), [shown]);
  const canEdit = permission.canControl;

  // A new server state is the truth: drop the optimistic copy.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new revision should clear it
  useEffect(() => setOptimistic(null), [revision]);

  const edit = async (command: PlayerAction, guess: Track[] | null) => {
    setMessage(null);
    if (guess) setOptimistic(guess);
    const ack = await sendCommand(guildId, command);
    if (!ack.ok) {
      setOptimistic(null);
      setMessage(explain(ack));
    } else if (guess) {
      setTimeout(() => setOptimistic((current) => (current === guess ? null : current)), GUESS_TIMEOUT_MS);
    }
  };

  /** Every edit names its track: an index alone may point at another one by the time it lands. */
  const removeTrack = (index: number) =>
    void edit({ action: "remove", index, uri: shown[index]?.uri ?? "" }, removeAt(shown, index));

  const move = (from: number, to: number) => {
    const next = moveTrack(shown, from, to);
    if (!next || to === from || to === from + 1) return;
    void edit({ action: "move", from, to, uri: shown[from]?.uri ?? "" }, next);
    const landed = to > from ? to : to + 1;
    setAnnounce(`ย้าย ${shown[from]?.title ?? ""} ไปลำดับที่ ${landed}`);
  };

  /** Ends a drag in progress (also on unmount, so no listener outlives the panel). */
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  /**
   * Pointer drag on the handle: the drop index is where the pointer sits between row midpoints.
   * The handle captures the pointer, so the drag follows it outside the list; a cancelled pointer
   * (a scroll gesture, a system dialog) ends the drag without moving anything.
   */
  const startDrag = (from: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    keepFromSwipe(e);
    if (!canEdit || e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    // Only the rows in the queue now: a removed row is still in the DOM while it folds away (#174).
    const live = new Set(keys);
    const rows = [...(list.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])].filter((row) =>
      live.has(row.dataset.key ?? ""),
    );
    const targetAt = (y: number) => {
      const index = rows.findIndex((row) => {
        const box = row.getBoundingClientRect();
        return y < box.top + box.height / 2;
      });
      return index === -1 ? rows.length : index;
    };
    let to = from;
    const onMove = (ev: PointerEvent) => {
      const next = targetAt(ev.clientY);
      if (next === to) return;
      to = next;
      setDrag({ from, to });
    };
    const stop = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", stop);
      endDrag.current = null;
      setDrag(null);
    };
    const onUp = (ev: PointerEvent) => {
      stop();
      move(from, targetAt(ev.clientY));
    };
    endDrag.current?.();
    endDrag.current = stop;
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", stop);
    setDrag({ from, to });
  };

  const onHandleKey = (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      move(index, index - 1);
    } else if (e.key === "ArrowDown" && index < shown.length - 1) {
      e.preventDefault();
      move(index, index + 2);
    }
  };

  // Keep keyboard focus on the moved track's handle after the list re-renders.
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey.current) return;
    list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey.current)}"] [data-handle]`)?.focus();
    focusKey.current = null;
  });

  return (
    <section className={styles.panel} aria-labelledby="queue-title">
      <div className={styles.head}>
        <h2 id="queue-title" className={styles.title}>
          ถัดไป <span className="num">({shown.length})</span>
        </h2>
        {canEdit && shown.length > 0 ? (
          <button type="button" className={styles.clear} onClick={() => setConfirming(true)}>
            ล้างคิว
          </button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {message ? (
        <p role="alert" className={styles.message}>
          {message}
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p className={styles.empty}>คิวว่าง</p>
      ) : (
        <ol ref={list} className={styles.list} data-testid="queue">
          {/* DESIGN.md §7 (#174): a new track drops in (`row`), a removed one folds away, a reorder
              glides (`layout`, 320 ms). initial={false}: rows already there do not replay on mount. */}
          <MotionConfig reducedMotion="user">
            <AnimatePresence initial={false}>
              {shown.map((track, i) => {
                const key = keys[i] ?? String(i);
                const row = (
                  <div className={styles.row}>
                    {canEdit ? (
                      <button
                        type="button"
                        className={styles.handle}
                        data-handle
                        aria-label={`ย้าย ${track.title} (ลำดับที่ ${i + 1}) ใช้ลูกศรขึ้นลง`}
                        onPointerDown={startDrag(i)}
                        onKeyDown={(e) => {
                          focusKey.current = key;
                          onHandleKey(i)(e);
                        }}
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
                          <path d="M5 4h6M5 8h6M5 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    ) : null}
                    {/* biome-ignore lint/suspicious/noArrayIndexKey: re-mounting on a new position replays the digit pop */}
                    <span key={`${key}-${i}`} className={`num ${styles.index}`}>
                      {i + 1}
                    </span>
                    <span className={styles.art} aria-hidden="true">
                      {track.artworkUrl ? (
                        // biome-ignore lint/performance/noImgElement: 40px cover from YouTube/Spotify CDNs
                        <img src={track.artworkUrl} alt="" width={40} height={40} loading="lazy" />
                      ) : (
                        <span className={styles.artEmpty}>{Array.from(track.title)[0] ?? "♪"}</span>
                      )}
                      {track.requester.avatarUrl ? (
                        // biome-ignore lint/performance/noImgElement: 16px Discord avatar badge
                        <img className={styles.badge} src={track.requester.avatarUrl} alt="" width={16} height={16} />
                      ) : (
                        <span className={styles.badge}>{Array.from(track.requester.name)[0] ?? "?"}</span>
                      )}
                    </span>
                    <span className={styles.text}>
                      <span className={styles.trackTitle}>{track.title}</span>
                      <span className={styles.trackAuthor}>
                        {track.author} · ขอโดย {track.requester.name}
                      </span>
                    </span>
                    <span className={`num ${styles.time}`}>{formatTime(track.durationMs)}</span>
                    <span onPointerDown={keepFromSwipe}>
                      <LikeButton track={libraryTrack(track)} size={28} />
                    </span>
                    {canEdit ? (
                      <span className={styles.actions}>
                        <button
                          type="button"
                          className={styles.action}
                          onPointerDown={keepFromSwipe}
                          aria-label={`เล่น ${track.title} ตอนนี้`}
                          title="เล่นตอนนี้"
                          onClick={() => void edit({ action: "playNow", index: i, uri: track.uri }, null)}
                        >
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
                            <path d="M5 3l8 5-8 5z" fill="currentColor" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={styles.action}
                          onPointerDown={keepFromSwipe}
                          aria-label={`ลบ ${track.title} ออกจากคิว`}
                          title="ลบออกจากคิว"
                          onClick={() => removeTrack(i)}
                        >
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
                            <path
                              d="M4 4l8 8M12 4l-8 8"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </span>
                    ) : null}
                  </div>
                );
                return (
                  <motion.li
                    key={key}
                    layout="position"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, transition: EXIT }}
                    transition={ROW}
                    data-row
                    data-key={key}
                    data-testid="queue-row"
                    data-jumping={jumping === i ? "" : undefined}
                    data-dragging={drag?.from === i ? "" : undefined}
                    data-drop-before={drag && drag.to === i && drag.to !== drag.from ? "" : undefined}
                    className={styles.item}
                  >
                    {canEdit ? (
                      <SwipeRow
                        direction="left"
                        height={60}
                        radius={0}
                        rowColor="var(--bg)"
                        drawerColor={danger}
                        actionColor={danger}
                        textColor="var(--ink)"
                        label={track.title}
                        actions={[{ id: "remove", label: "ลบ" }]}
                        onCommit={() => removeTrack(i)}
                      >
                        {row}
                      </SwipeRow>
                    ) : (
                      row
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </MotionConfig>
          {drag && drag.to === shown.length ? <li className={styles.dropEnd} aria-hidden="true" /> : null}
        </ol>
      )}
      <ClearConfirm
        open={confirming}
        count={shown.length}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void edit({ action: "clear" }, []);
        }}
      />
    </section>
  );
}

function ClearConfirm({
  open,
  count,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="clear-title">
      <h2 id="clear-title" className={styles.dialogTitle}>
        ล้างคิวทั้งหมด?
      </h2>
      <p className={styles.dialogText}>
        เพลง <span className="num">{count}</span> เพลงในคิวจะหายไป และย้อนกลับไม่ได้ เพลงที่เล่นอยู่ยังเล่นต่อ
      </p>
      <div className={styles.dialogActions}>
        <button type="button" className={styles.cancel} onClick={onClose}>
          ยกเลิก
        </button>
        <button type="button" className={styles.danger} onClick={onConfirm}>
          ล้างคิว
        </button>
      </div>
    </dialog>
  );
}
