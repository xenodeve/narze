"use client";

import type { TopPlayed } from "@narze/shared";
import { useEffect, useId, useState } from "react";
import { playInGuild } from "@/lib/control";
import { topPlayed } from "@/lib/history";
import styles from "./top-played.module.css";

function List({ title, rows, onPlay }: { title: string; rows: TopPlayed[]; onPlay: (row: TopPlayed) => void }) {
  const id = useId();
  if (rows.length === 0) return null;
  return (
    <section className={styles.list} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      <ol className={styles.rows}>
        {rows.slice(0, 5).map((row) => (
          <li key={row.trackId} className={styles.row} data-testid="top-played">
            <span className={styles.text}>
              <span className={styles.title}>{row.title}</span>
              <span className={styles.meta}>{row.artist}</span>
            </span>
            <span className={`num ${styles.meta}`}>{row.playCount} ครั้ง</span>
            <button type="button" className={styles.play} onClick={() => onPlay(row)} aria-label={`เล่น ${row.title}`}>
              ▶
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Spec #84: with nothing playing, my top-played and the server's, each a click away from playing here. */
export function TopPlayedPanel({ guildId }: { guildId: string }) {
  const [mine, setMine] = useState<TopPlayed[]>([]);
  const [server, setServer] = useState<TopPlayed[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void topPlayed({ me: true }).then((rows) => setMine(rows ?? []));
    void topPlayed({ guildId }).then((rows) => setServer(rows ?? []));
  }, [guildId]);
  const play = async (row: TopPlayed) => {
    setMessage(null);
    const result = await playInGuild(guildId, row.uri);
    setMessage(result.ok ? `เพิ่ม ${row.title} แล้ว` : result.text);
  };
  if (mine.length === 0 && server.length === 0) return null;
  return (
    <div className={styles.panel}>
      <List title="เพลงที่คุณเล่นบ่อย" rows={mine} onPlay={(row) => void play(row)} />
      <List title="เพลงฮิตในเซิร์ฟเวอร์นี้" rows={server} onPlay={(row) => void play(row)} />
      {message ? (
        <p role="status" aria-live="polite" className={styles.meta}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
