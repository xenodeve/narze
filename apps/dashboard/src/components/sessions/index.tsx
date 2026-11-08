"use client";

import { type ListeningSession, type SessionSummary, sessionSummary } from "@narze/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignedIn } from "@/components/catalog/browse";
import { Thinking } from "@/components/catalog/thinking";
import { formatTime } from "@/components/now-playing/progress";
import { getSession, listSessions, sessionLength, useSessionEvents } from "@/lib/history";
import styles from "./sessions.module.css";

/** A name's first letter; a Thai leading vowel (เ แ โ ใ ไ) is not a letter on its own. */
const initial = (name: string) => Array.from(name.replace(/^[เแโใไ]/, ""))[0] ?? "?";
const SIGNED_OUT = "เข้าสู่ระบบด้วย Discord ก่อน แล้วจะเห็นประวัติการฟังของคุณ";
const when = (ms: number) =>
  new Date(ms).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Faces({ people }: { people: SessionSummary["participants"] }) {
  const shown = people.slice(0, 5);
  return (
    <span className={styles.faces} title={people.map((p) => p.name).join(", ")}>
      {shown.map((p) =>
        p.avatarUrl ? (
          // biome-ignore lint/performance/noImgElement: 24px Discord avatars
          <img key={p.id} className={styles.face} src={p.avatarUrl} alt="" width={24} height={24} />
        ) : (
          <span key={p.id} className={styles.face} aria-hidden="true">
            {initial(p.name)}
          </span>
        ),
      )}
      <span className="num">{people.length} คน</span>
    </span>
  );
}

/** Spec #88: the sessions I took part in; live ones update as they play. */
export function SessionsPage() {
  return <SignedIn signedOut={SIGNED_OUT}>{() => <SessionGrid />}</SignedIn>;
}

function SessionGrid() {
  const [sessions, setSessions] = useState<SessionSummary[] | null | "failed">(null);
  const [query, setQuery] = useState("");
  // The search runs on the server (server name, people, tracks), a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(
      () => {
        void listSessions(query).then((list) => setSessions(list ?? "failed"));
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [query]);
  useSessionEvents(
    useCallback(
      (session: ListeningSession) => {
        // While searching, a live session joins only if it matches; the next search settles it.
        if (query.trim()) return;
        setSessions((list) => {
          if (!Array.isArray(list)) return list;
          const rest = list.filter((s) => s.id !== session.id);
          return [sessionSummary(session), ...rest].sort((a, b) => b.startTime - a.startTime);
        });
      },
      [query],
    ),
  );
  const shown = Array.isArray(sessions) ? sessions : [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>ประวัติการฟัง</h1>
      <input
        type="search"
        className={styles.search}
        placeholder="ค้นหาด้วยชื่อเซิร์ฟเวอร์ คน หรือเพลง"
        aria-label="ค้นหาเซสชัน"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {sessions === null ? (
        <Thinking label="กำลังโหลดประวัติการฟัง" />
      ) : sessions === "failed" ? (
        <p role="alert">โหลดประวัติไม่ได้ ลองรีเฟรช</p>
      ) : sessions.length === 0 ? (
        <p className={styles.meta}>
          {query.trim() ? "ไม่มีเซสชันที่ตรงกับคำค้นนี้" : "ยังไม่มีเซสชัน พอได้ฟังเพลงกับบอทในห้องเสียง ประวัติจะขึ้นที่นี่"}
        </p>
      ) : (
        <ul className={styles.grid}>
          {shown.map((s) => (
            <li key={s.id} className={styles.card} data-testid="session-card">
              <Link href={`/sessions/${encodeURIComponent(s.id)}`} className={styles.cardLink}>
                <span className={styles.cardHead}>
                  <span className={styles.guild}>{s.guildName}</span>
                  {s.isActive ? <span className={styles.live}>Live</span> : null}
                </span>
                <span className={styles.meta}>{when(s.startTime)}</span>
                <span className={`num ${styles.meta}`}>
                  {s.trackCount} เพลง · {sessionLength(s)}
                </span>
                <Faces people={s.participants} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Spec #88: one session — who listened and every track, each playable again in a server I choose. */
export function SessionPage({ id }: { id: string }) {
  return <SignedIn signedOut={SIGNED_OUT}>{(play) => <SessionDetail id={id} play={play} />}</SignedIn>;
}

function SessionDetail({ id, play }: { id: string; play: (t: { title: string; query: string }) => void }) {
  const [session, setSession] = useState<ListeningSession | "missing" | "failed" | null>(null);
  useEffect(() => {
    void getSession(id).then((found) => setSession(found ?? "failed"));
  }, [id]);
  useSessionEvents(
    useCallback(
      (changed: ListeningSession) => {
        if (changed.id === id) setSession(changed);
      },
      [id],
    ),
  );
  if (session === null) return <Thinking label="กำลังโหลดเซสชัน" />;
  if (session === "missing") return <p role="alert">ไม่พบเซสชันนี้ หรือคุณไม่ได้อยู่ในเซสชันนี้</p>;
  if (session === "failed") return <p role="alert">โหลดไม่สำเร็จ ลองรีเฟรช</p>;
  return (
    <div className={styles.page}>
      <header className={styles.detailHead}>
        <h1 className={styles.title}>{session.guildName}</h1>
        <p className={`num ${styles.meta}`}>
          {when(session.startTime)} · {session.tracks.length} เพลง · {sessionLength(session)}
          {session.isActive ? <span className={styles.live}>Live</span> : null}
        </p>
        <Faces people={session.participants} />
      </header>
      <ol className={styles.tracks}>
        {session.tracks.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a session repeats tracks; rows are plays
          <li key={`${t.playedAt}-${i}`} className={styles.track} data-testid="session-track">
            <span className={styles.text}>
              <span className={styles.trackTitle}>{t.title}</span>
              <span className={styles.meta}>
                {t.author} · ขอโดย {t.requester.name}
              </span>
            </span>
            <span className={`num ${styles.meta}`}>{formatTime(t.durationMs)}</span>
            <button
              type="button"
              className={styles.icon}
              onClick={() => play({ title: t.title, query: t.uri })}
              aria-label={`เล่น ${t.title}`}
            >
              ▶
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
