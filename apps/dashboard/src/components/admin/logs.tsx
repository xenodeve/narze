"use client";

import { LOG_RING, type LogLevel, type LogLine } from "@narze/shared";
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminRoom } from "@/lib/admin";
import styles from "./admin.module.css";
import { AdminArea } from "./index";

const LEVELS: Array<LogLevel | "all"> = ["all", "info", "warn", "error"];
/** SGR foreground codes 30–37 and 90–97 (bright), drawn as the design's tones. */
const TONES = ["ink-2", "danger", "ok", "warn", "accent", "accent", "accent", "ink"];

/** Spec #113: ANSI colours are drawn, never shown as escape codes. */
export function ansi(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let tone: string | null = null;
  let bold = false;
  let at = 0;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences start with ESC
  for (const match of text.matchAll(/\u001b\[([\d;]*)m/g)) {
    if (match.index > at) parts.push(segment(text.slice(at, match.index), tone, bold, parts.length));
    for (const code of (match[1] || "0").split(";").map(Number)) {
      if (code === 0) {
        tone = null;
        bold = false;
      } else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 39) tone = null;
      else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) tone = TONES[code % 10] ?? null;
    }
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push(segment(text.slice(at), tone, bold, parts.length));
  return parts;
}

function segment(text: string, tone: string | null, bold: boolean, key: number): ReactNode {
  if (!tone && !bold) return text;
  return (
    <span key={key} style={{ color: tone ? `var(--${tone})` : undefined, fontWeight: bold ? 600 : undefined }}>
      {text}
    </span>
  );
}

const plain = (text: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences start with ESC
  text.replace(/\u001b\[[\d;]*m/g, "");

/** Spec #113, #120: the Bot's console, live — level filter, search, pause, auto-scroll, clear, download. */
export function AdminLogs() {
  return <AdminArea>{() => <Terminal />}</AdminArea>;
}

/** A line as drawn: parsed once when it arrives, never again on a re-render. */
type Entry = { id: number; at: number; level: LogLevel; time: string; plain: string; parts: ReactNode[] };
const clock = new Intl.DateTimeFormat("th-TH", { timeStyle: "medium" });
let nextId = 0;
const toEntry = (line: LogLine): Entry => ({
  id: nextId++,
  at: line.at,
  level: line.level,
  time: clock.format(line.at),
  plain: plain(line.text),
  parts: ansi(line.text),
});

const Row = memo(function Row({ entry }: { entry: Entry }) {
  return (
    <li className={styles.logLine} data-level={entry.level} data-testid="log-line">
      <span className={styles.time}>{entry.time}</span>
      <span>{entry.parts}</span>
    </li>
  );
});

function Terminal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [query, setQuery] = useState("");
  // While paused the screen keeps this snapshot; live lines still arrive underneath.
  const [frozen, setFrozen] = useState<Entry[] | null>(null);
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLOListElement>(null);

  useAdminRoom({
    // After a reconnect the history overlaps what is on screen: only lines newer than the last one join.
    onHistory: useCallback(
      (history: LogLine[]) =>
        setEntries((all) => {
          const lastAt = all.at(-1)?.at ?? Number.NEGATIVE_INFINITY;
          return [...all, ...history.filter((l) => l.at > lastAt).map(toEntry)].slice(-LOG_RING);
        }),
      [],
    ),
    onLine: useCallback((line: LogLine) => setEntries((all) => [...all, toEntry(line)].slice(-LOG_RING)), []),
  });
  const lastFrozen = frozen?.at(-1)?.id ?? -1;
  const waiting = frozen ? entries.filter((e) => e.id > lastFrozen).length : 0;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (frozen ?? entries).filter(
      (e) => (level === "all" || e.level === level) && (!q || e.plain.toLowerCase().includes(q)),
    );
  }, [frozen, entries, level, query]);

  useEffect(() => {
    // Follows the newest line whenever the shown lines change.
    if (follow && box.current && shown.length > 0) box.current.scrollTop = box.current.scrollHeight;
  }, [shown, follow]);

  const download = () => {
    const text = entries.map((e) => `${new Date(e.at).toISOString()} ${e.level.toUpperCase()} ${e.plain}`).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `narze-bot-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const clear = () => {
    setEntries([]);
    if (frozen) setFrozen([]);
  };

  return (
    <>
      <h1 className={styles.title}>Log สดของบอท</h1>
      <div className={styles.toolbar}>
        <fieldset className={styles.levels}>
          <legend className={styles.hint}>ระดับ</legend>
          {LEVELS.map((l) => (
            <label key={l} className={styles.level}>
              <input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} />
              <span className="mono">{l}</span>
            </label>
          ))}
        </fieldset>
        <input
          type="search"
          className={styles.search}
          placeholder="ค้นหาใน log"
          aria-label="ค้นหาใน log"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={styles.ghost} onClick={() => setFrozen(frozen ? null : entries)}>
          {frozen ? (
            <>
              ทำต่อ (<span className="num">{waiting}</span>)
            </>
          ) : (
            "หยุดชั่วคราว"
          )}
        </button>
        <label className={styles.level}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          เลื่อนตามอัตโนมัติ
        </label>
        <button type="button" className={styles.ghost} onClick={clear}>
          ล้าง
        </button>
        <button type="button" className={styles.ghost} onClick={download} disabled={entries.length === 0}>
          ดาวน์โหลด .txt
        </button>
      </div>
      <ol ref={box} className={`deep ${styles.terminal}`} aria-label="log ของบอท">
        {shown.map((e) => (
          <Row key={e.id} entry={e} />
        ))}
      </ol>
      <p className={`num ${styles.hint}`}>
        {shown.length} / {entries.length} บรรทัด (เก็บได้ {LOG_RING})
      </p>
    </>
  );
}
