"use client";

import { type ListeningSession, type SessionEvent, type SessionSummary, SocketEvents } from "@narze/shared";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignedIn } from "@/components/catalog/browse";
import { Thinking } from "@/components/catalog/thinking";
import { GuildIcon } from "@/components/guild-icon";
import { LoadError } from "@/components/load-error";
import { formatTime } from "@/components/now-playing/progress";
import { initial } from "@/lib/format";
import { getSession, listSessions, sessionLength, useSessionEvents } from "@/lib/history";
import { useSession } from "@/lib/session";
import { onSocketEvents } from "@/lib/socket";
import { useGuildIconUrl } from "@/lib/use-guilds";
import styles from "./sessions.module.css";

const SIGNED_OUT = "เข้าสู่ระบบด้วย Discord ก่อน แล้วจะเห็นประวัติการฟังของคุณ";
/** The Bot could not read the server's name when the session started. */
const nameOf = (s: Pick<SessionSummary, "guildName">) => s.guildName || "เซิร์ฟเวอร์ที่ไม่ทราบชื่อ";
const when = (ms: number) =>
  new Date(ms).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const summaryOf = ({ track: _, ...summary }: SessionEvent): SessionSummary => summary;

/** The session's server, by its own icon (#170); the session keeps only the name it had then. */
function SessionGuild({ session, size }: { session: Pick<SessionSummary, "guildId" | "guildName">; size: number }) {
  const auth = useSession();
  const iconUrl = useGuildIconUrl(auth.status === "signed-in" ? auth.userId : "", session.guildId);
  return <GuildIcon guildId={session.guildId} name={nameOf(session)} iconUrl={iconUrl} size={size} />;
}

/** Badge (DESIGN.md): mono pill; live state is the accent. */
const Live = () => (
  <span className={`mono ${styles.badge}`} data-tone="live">
    Live
  </span>
);

function Faces({ people }: { people: SessionSummary["participants"] }) {
  return (
    <span className={styles.faces} title={people.map((p) => p.name).join(", ")}>
      {people.slice(0, 5).map((p) =>
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
  return <SignedIn signedOut={SIGNED_OUT}>{() => <SessionList />}</SignedIn>;
}

/** Puts a live session into the list (newest first); while searching, only sessions already shown. */
function upsert(list: SessionSummary[], summary: SessionSummary, searching: boolean): SessionSummary[] {
  const known = list.some((s) => s.id === summary.id);
  if (!known && searching) return list;
  const rest = list.filter((s) => s.id !== summary.id);
  return [summary, ...rest].sort((a, b) => b.startTime - a.startTime);
}

function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[] | null | "failed">(null);
  const [query, setQuery] = useState("");
  // Bumped when the socket is (re)connected: events sent while it was down are not replayed.
  const [epoch, setEpoch] = useState(0);
  // Live sessions that arrive while the list is still loading; that list may predate them.
  const early = useRef<SessionSummary[]>([]);
  // The search runs on the server (server name, people, tracks), a moment after typing stops.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `epoch` only asks for a fresh read
  useEffect(() => {
    const timer = setTimeout(
      () => {
        void listSessions(query).then((list) => {
          if (!list) return setSessions("failed");
          const waiting = early.current.splice(0);
          setSessions(waiting.reduce((all, s) => upsert(all, s, Boolean(query.trim())), list));
        });
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, epoch]);
  useEffect(() => onSocketEvents({ [SocketEvents.sessionReady]: () => setEpoch((n) => n + 1) }), []);
  useSessionEvents(
    useCallback(
      (event: SessionEvent) => {
        const summary = summaryOf(event);
        setSessions((list) => {
          if (Array.isArray(list)) return upsert(list, summary, Boolean(query.trim()));
          early.current.push(summary);
          return list;
        });
      },
      [query],
    ),
  );

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
        <LoadError>โหลดประวัติไม่ได้</LoadError>
      ) : sessions.length === 0 ? (
        <p className={styles.meta}>
          {query.trim() ? "ไม่มีเซสชันที่ตรงกับคำค้นนี้" : "ยังไม่มีเซสชัน พอได้ฟังเพลงกับบอทในห้องเสียง ประวัติจะขึ้นที่นี่"}
        </p>
      ) : (
        // Row (DESIGN.md): history is a hairline-ruled list, not cards.
        <ul className={styles.rows}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.row} data-testid="session-card">
              <Link href={`/sessions/${encodeURIComponent(s.id)}`} className={styles.rowLink}>
                <SessionGuild session={s} size={36} />
                <span className={styles.text}>
                  <span className={styles.rowHead}>
                    <span className={styles.guild}>{nameOf(s)}</span>
                    {s.isActive ? <Live /> : null}
                  </span>
                  <span className={`mono num ${styles.meta}`}>
                    {when(s.startTime)} · {s.trackCount} เพลง · {sessionLength(s)}
                  </span>
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
      (event: SessionEvent) => {
        if (event.id !== id) return;
        setSession((current) => {
          if (current === null || typeof current === "string") return current;
          const { trackCount: _, ...summary } = summaryOf(event);
          // An event carries only the newest track; it is new unless it was already the last.
          const last = current.tracks.at(-1);
          const added = event.track && event.track.playedAt !== last?.playedAt ? [event.track] : [];
          return { ...current, ...summary, tracks: [...current.tracks, ...added] };
        });
      },
      [id],
    ),
  );
  if (session === null) return <Thinking label="กำลังโหลดเซสชัน" />;
  if (session === "missing") return <p role="alert">ไม่พบเซสชันนี้ หรือคุณไม่ได้อยู่ในเซสชันนี้</p>;
  if (session === "failed") return <LoadError>โหลดเซสชันไม่สำเร็จ</LoadError>;
  return (
    <div className={styles.page}>
      <header className={styles.detailHead}>
        <span className={styles.headIcon}>
          <SessionGuild session={session} size={56} />
        </span>
        <h1 className={styles.title}>{nameOf(session)}</h1>
        <p className={`mono num ${styles.meta}`}>
          {when(session.startTime)} · {session.tracks.length} เพลง · {sessionLength(session)}
          {session.isActive ? <Live /> : null}
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
