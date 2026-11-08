"use client";

import { LOG_RING, type LogLevel, type LogLine } from "@narze/shared";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminRoom } from "@/lib/admin";
import styles from "./admin.module.css";
import { AdminArea } from "./index";

const LEVELS: Array<LogLevel | "all"> = ["all", "info", "warn", "error"];
/** SGR foreground codes the Bot's console uses, drawn as the design's tones. */
const COLOURS: Record<number, string> = {
  30: "ink-3",
  31: "danger",
  32: "ok",
  33: "warn",
  34: "accent",
  35: "accent",
  36: "accent",
  37: "ink",
  90: "ink-3",
  91: "danger",
  92: "ok",
  93: "warn",
  94: "accent",
  95: "accent",
  96: "accent",
  97: "ink",
};

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
      else if (COLOURS[code]) tone = COLOURS[code] ?? null;
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

function Terminal() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  // While paused, live lines wait here and join when resumed.
  const held = useRef<LogLine[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const box = useRef<HTMLOListElement>(null);

  const add = useCallback((more: LogLine[]) => setLines((all) => [...all, ...more].slice(-LOG_RING)), []);
  useAdminRoom({
    onHistory: useCallback((history: LogLine[]) => setLines(history), []),
    onLine: useCallback(
      (line: LogLine) => {
        if (pausedRef.current) held.current.push(line);
        else add([line]);
      },
      [add],
    ),
  });
  const resume = () => {
    setPaused(false);
    add(held.current.splice(0));
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter(
      (l) => (level === "all" || l.level === level) && (!q || plain(l.text).toLowerCase().includes(q)),
    );
  }, [lines, level, query]);

  useEffect(() => {
    // Follows the newest line whenever the shown lines change.
    if (follow && box.current && shown.length > 0) box.current.scrollTop = box.current.scrollHeight;
  }, [shown, follow]);

  const download = () => {
    const text = lines
      .map((l) => `${new Date(l.at).toISOString()} ${l.level.toUpperCase()} ${plain(l.text)}`)
      .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `narze-bot-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        <button type="button" className={styles.ghost} onClick={() => (paused ? resume() : setPaused(true))}>
          {paused ? `ทำต่อ (${held.current.length})` : "หยุดชั่วคราว"}
        </button>
        <label className={styles.level}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          เลื่อนตามอัตโนมัติ
        </label>
        <button type="button" className={styles.ghost} onClick={() => setLines([])}>
          ล้าง
        </button>
        <button type="button" className={styles.ghost} onClick={download} disabled={lines.length === 0}>
          ดาวน์โหลด .txt
        </button>
      </div>
      <ol ref={box} className={styles.terminal} aria-label="log ของบอท">
        {shown.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: log lines may repeat exactly; rows are positions
          <li key={`${l.at}-${i}`} className={styles.logLine} data-level={l.level} data-testid="log-line">
            <span className={styles.time}>{new Date(l.at).toLocaleTimeString("th-TH")}</span>
            <span>{ansi(l.text)}</span>
          </li>
        ))}
      </ol>
      <p className={`num ${styles.hint}`}>
        {shown.length} / {lines.length} บรรทัด (เก็บได้ {LOG_RING})
      </p>
    </>
  );
}
