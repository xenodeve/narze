"use client";

import type { PlayerAction, PlayerState } from "@narze/shared";
import { useEffect, useRef, useState } from "react";
import { type ControlAck, explain, REASON_TH, sendCommand } from "@/lib/control";
import type { Permission } from "@/lib/use-player";
import { usePresence } from "@/lib/use-presence";
import styles from "./controls.module.css";
import { VoicePicker } from "./voice-picker";

const LOOP_LABEL = { off: "วนซ้ำ: ปิด", track: "วนซ้ำ: เพลงนี้", queue: "วนซ้ำ: ทั้งคิว" } as const;
/** v5 sent volume after the slider rested this long (spec, dashboard volume). */
const VOLUME_DEBOUNCE_MS = 300;

interface ControlsProps {
  guildId: string;
  state: PlayerState | null;
  permission: Permission;
}

/** Playback controls (#101). Optimistic where the result is predictable; reverts when the server refuses. */
export function Controls({ guildId, state, permission }: ControlsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [pausedOverride, setPausedOverride] = useState<boolean | null>(null);
  const serverVolume = Math.min(state?.volume ?? 15, 100);
  const [volume, setVolume] = useState(serverVolume);
  /** The volume when a drag began: what a refused change goes back to. Null when not dragging. */
  const dragStart = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const disabled = !permission.canControl;
  const playing = Boolean(state?.current);
  const paused = pausedOverride ?? state?.paused ?? false;

  // A new server state replaces the optimistic guess; the volume follows it unless the user is dragging.
  // biome-ignore lint/correctness/useExhaustiveDependencies: any new server state (pause or revision) replaces the optimistic guess
  useEffect(() => setPausedOverride(null), [state?.paused, state?.revision]);
  useEffect(() => {
    if (dragStart.current === null) setVolume(serverVolume);
  }, [serverVolume]);

  const run = async (command: PlayerAction, revert?: () => void): Promise<ControlAck> => {
    setMessage(null);
    const ack = await sendCommand(guildId, command);
    if (!ack.ok) {
      revert?.();
      setMessage(explain(ack));
    }
    return ack;
  };

  const togglePause = () => {
    const next = !paused;
    setPausedOverride(next);
    void run({ action: next ? "pause" : "resume" }, () => setPausedOverride(null));
  };

  const sendVolume = (value: number, before: number) => {
    clearTimeout(timer.current);
    void run({ action: "volume", volume: value }, () => setVolume(before));
  };
  // While dragging, nothing is sent: one command on release. Keys and clicks are debounced 300 ms.
  const onVolume = (value: number) => {
    setVolume(value);
    if (dragStart.current !== null) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => sendVolume(value, serverVolume), VOLUME_DEBOUNCE_MS);
  };
  const endDrag = () => {
    const before = dragStart.current;
    if (before === null) return;
    dragStart.current = null;
    sendVolume(volume, before);
  };

  return (
    <div className={styles.controls} data-testid="controls" data-can-control={permission.canControl}>
      {disabled ? (
        <p className={styles.lock} role="status" data-testid="control-reason">
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          {REASON_TH[permission.reason] ?? permission.reason}
        </p>
      ) : null}
      <fieldset className={styles.row}>
        <legend className="sr-only">ควบคุมการเล่น</legend>
        <button
          type="button"
          className={styles.icon}
          onClick={() => void run({ action: "previous" })}
          disabled={disabled || !playing}
          aria-label="เริ่มเพลงนี้ใหม่"
          title="เริ่มเพลงนี้ใหม่"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
            <path d="M4 3v10M13 3.5 6 8l7 4.5z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={togglePause}
          disabled={disabled || !playing}
          aria-label={paused ? "เล่นต่อ" : "พัก"}
          aria-pressed={!paused}
          data-testid="toggle-pause"
        >
          {paused ? (
            <svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18">
              <path d="M5 3l8 5-8 5z" fill="currentColor" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18">
              <path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={styles.icon}
          onClick={() => void run({ action: "skip" })}
          disabled={disabled || !playing}
          aria-label="ข้าม"
          title="ข้าม"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
            <path d="M12 3v10M3 3.5 10 8l-7 4.5z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.pill}
          onClick={() => void run({ action: "loop", mode: null })}
          disabled={disabled || !playing}
          aria-pressed={(state?.loop ?? "off") !== "off"}
        >
          {LOOP_LABEL[state?.loop ?? "off"]}
        </button>
        <button
          type="button"
          className={styles.pill}
          onClick={() => void run({ action: "shuffle" })}
          disabled={disabled || (state?.queue.length ?? 0) < 2}
        >
          สลับคิว
        </button>
        <label className={styles.volume}>
          <span className="sr-only">ความดัง</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            disabled={disabled || !playing}
            onPointerDown={() => {
              dragStart.current = volume;
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onChange={(e) => onVolume(Number(e.currentTarget.value))}
            data-testid="volume"
          />
          <span className={`num ${styles.volumeValue}`}>{volume}</span>
        </label>
      </fieldset>
      <AddTrack
        guildId={guildId}
        disabled={disabled}
        run={run}
        canPickChannel={!playing && (permission.reason === "server-owner" || permission.reason === "bot-owner")}
      />
      {message ? (
        <p role="alert" className={styles.message} data-testid="control-message">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function AddTrack({
  guildId,
  disabled,
  run,
  canPickChannel,
}: {
  guildId: string;
  disabled: boolean;
  run: (command: PlayerAction) => Promise<ControlAck>;
  /** An owner with no Player may choose where the Bot goes before adding (spec #86). */
  canPickChannel: boolean;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<{ next: boolean } | null>(null);
  // Stays mounted while it fades out (#174).
  const picker = usePresence(picking);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  const submit = async (next: boolean, voiceChannelId: string | null = target?.id ?? null) => {
    if (!query.trim()) return;
    setBusy(true);
    const ack = await run({ action: "play", query, next, voiceChannelId });
    setBusy(false);
    if (ack.ok) setQuery("");
    // The Bot is not in voice and neither is the user: let them choose where it should go (spec #86).
    else if (ack.error === "voice-channel-required") setPicking({ next });
  };

  return (
    <>
      <form
        className={styles.add}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        {canPickChannel ? (
          <button type="button" className={styles.pill} onClick={() => setPicking({ next: false })} disabled={disabled}>
            {target ? `ห้อง: ${target.name}` : "เลือกห้องเสียง"}
          </button>
        ) : null}
        <label className="sr-only" htmlFor="add-query">
          ชื่อเพลงหรือลิงก์
        </label>
        <input
          id="add-query"
          className={styles.field}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="ชื่อเพลง หรือวางลิงก์"
          disabled={disabled || busy}
          autoComplete="off"
        />
        <button
          type="button"
          className={styles.pill}
          disabled={disabled || busy || !query.trim()}
          onClick={() => void submit(true)}
        >
          เล่นต่อจากนี้
        </button>
        <button type="submit" className={styles.primaryPill} disabled={disabled || busy || !query.trim()}>
          เพิ่มคิว
        </button>
      </form>
      {picker.value ? (
        <VoicePicker
          open={picker.open}
          guildId={guildId}
          onClose={() => setPicking(null)}
          onPick={(channel) => {
            setPicking(null);
            setTarget(channel);
            // Picked after a failed add: retry it in the chosen channel. Picked up front: wait for a song.
            if (query.trim()) void submit(picking?.next ?? false, channel.id);
          }}
        />
      ) : null}
    </>
  );
}
