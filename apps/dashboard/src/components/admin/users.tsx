"use client";

import type { AdminUser } from "@narze/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { formatTime } from "@/components/now-playing/progress";
import { getAdminSession, getAdminUser, getAdminUsers, useAdminRoom, useLoad } from "@/lib/admin";
import { initial, thaiDateTime } from "@/lib/format";
import { sessionLength } from "@/lib/history";
import { moodFromArtwork } from "@/lib/mood";
import styles from "./admin.module.css";
import { PlayRows, SessionRows } from "./guilds";
import { AdminArea } from "./index";

function Face({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    // biome-ignore lint/performance/noImgElement: Discord CDN avatars
    <img className={styles.face} src={url} alt="" width={size} height={size} />
  ) : (
    <span className={styles.face} style={{ width: size, height: size }} aria-hidden="true">
      {initial(name)}
    </span>
  );
}

/** Spec #114: everyone who listened or opened the Dashboard; the dots follow open tabs live. */
export function AdminUsers() {
  return <AdminArea>{() => <UserList />}</AdminArea>;
}

function UserList() {
  const [online, setOnline] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState("");
  const list = useLoad(() => getAdminUsers(), "");
  useAdminRoom({ onPresence: useCallback((ids: string[]) => setOnline(new Set(ids)), []) });
  const users = useMemo(() => {
    if (typeof list !== "object" || list === null) return [];
    const q = query.trim().toLowerCase();
    return list.users
      .map((u): AdminUser => (online ? { ...u, online: online.has(u.discordId) } : u))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.discordId.includes(q));
  }, [list, online, query]);

  if (list === null) return <Thinking label="กำลังโหลดผู้ใช้" />;
  if (list === "failed")
    return (
      <p role="alert" className={styles.error}>
        โหลดรายชื่อผู้ใช้ไม่สำเร็จ
      </p>
    );
  return (
    <>
      <h1 className={styles.title}>ผู้ใช้</h1>
      <ul className={styles.cards}>
        <li className={styles.card}>
          <span className={styles.cardLabel}>ทั้งหมด</span>
          <span className={`num ${styles.cardValue}`}>{list.users.length}</span>
        </li>
        <li className={styles.card}>
          <span className={styles.cardLabel}>ใช้งานวันนี้</span>
          <span className={`num ${styles.cardValue}`}>{list.activeToday}</span>
        </li>
        <li className={styles.card}>
          <span className={styles.cardLabel}>อยู่บน Dashboard ตอนนี้</span>
          <span className={`num ${styles.cardValue}`}>{users.filter((u) => u.online).length}</span>
        </li>
      </ul>
      <input
        type="search"
        className={styles.search}
        placeholder="ชื่อหรือ Discord ID"
        aria-label="ค้นหาผู้ใช้"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className={styles.rows}>
        {users.map((u) => (
          <li key={u.discordId} className={styles.row} data-testid="admin-user">
            <span className={styles.presence}>
              <Face name={u.name} url={u.avatarUrl} />
              <span
                className={styles.dot}
                data-online={u.online}
                role="img"
                aria-label={u.online ? "อยู่บน Dashboard" : "ไม่ได้เปิด Dashboard"}
              />
            </span>
            <span className={styles.rowMain}>
              <Link href={`/admin/users/${u.discordId}`} className={styles.rowTitle}>
                {u.name}
              </Link>
              <span className={`num ${styles.hint}`}>
                เล่น {u.plays} ครั้ง · {u.uniqueTracks} เพลงไม่ซ้ำ
              </span>
            </span>
            <span className={`num ${styles.hint}`}>
              {u.lastActiveAt ? `ล่าสุด ${thaiDateTime(u.lastActiveAt)}` : "ยังไม่เคยใช้งาน"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Spec #114: one person — up to 500 tracks (last played first) and 500 sessions across servers. */
export function AdminUserPage({ id }: { id: string }) {
  return <AdminArea>{() => <UserDetail id={id} />}</AdminArea>;
}

function UserDetail({ id }: { id: string }) {
  const detail = useLoad(() => getAdminUser(id), id);
  if (detail === null) return <Thinking label="กำลังโหลดผู้ใช้" />;
  if (detail === "failed")
    return (
      <p role="alert" className={styles.error}>
        โหลดข้อมูลผู้ใช้ไม่สำเร็จ
      </p>
    );
  const { user } = detail;
  return (
    <>
      <header className={styles.guildHead}>
        <Face name={user?.name ?? id} url={user?.avatarUrl ?? null} size={56} />
        <div>
          <h1 className={styles.title}>{user?.name ?? id}</h1>
          <p className={`num ${styles.hint}`}>
            <span className="mono">{id}</span>
            {user ? ` · เล่น ${user.plays} ครั้ง · ${user.uniqueTracks} เพลงไม่ซ้ำ` : ""}
          </p>
        </div>
      </header>
      <section className={styles.section}>
        <h2 className={styles.subtitle}>
          เพลงที่ฟัง <span className={`num ${styles.hint}`}>({detail.history.length})</span>
        </h2>
        {detail.history.length ? (
          <PlayRows plays={detail.history} testId="user-history" />
        ) : (
          <p className={styles.hint} data-testid="user-history">
            ยังไม่มีประวัติการฟัง
          </p>
        )}
      </section>
      <section className={styles.section}>
        <h2 className={styles.subtitle}>
          เซสชัน <span className={`num ${styles.hint}`}>({detail.sessions.length})</span>
        </h2>
        {detail.sessions.length ? (
          <SessionRows sessions={detail.sessions} />
        ) : (
          <p className={styles.hint}>ยังไม่เคยอยู่ในเซสชันการฟัง</p>
        )}
      </section>
    </>
  );
}

/** Spec #112: any session — a hero tinted by the first track's artwork, the people, every track. */
export function AdminSessionPage({ id }: { id: string }) {
  return <AdminArea>{() => <SessionDetail id={id} />}</AdminArea>;
}

function SessionDetail({ id }: { id: string }) {
  const [tint, setTint] = useState<string | null>(null);
  const session = useLoad(() => getAdminSession(id), id);
  const artwork = typeof session === "object" && session ? session.tracks.find((t) => t.thumbnail)?.thumbnail : null;
  useEffect(() => {
    if (artwork) void moodFromArtwork(artwork).then(setTint);
  }, [artwork]);
  if (session === null) return <Thinking label="กำลังโหลดเซสชัน" />;
  if (session === "failed")
    return (
      <p role="alert" className={styles.error}>
        ไม่พบเซสชันนี้
      </p>
    );
  const minutes = Math.round(session.tracks.reduce((n, t) => n + t.durationMs, 0) / 60_000);
  return (
    <>
      <header className={styles.hero} style={tint ? { ["--artwork" as string]: tint } : undefined}>
        <p className={styles.hint}>{thaiDateTime(session.startTime)}</p>
        <h1 className={styles.title}>{session.guildName || "เซิร์ฟเวอร์ที่ไม่ทราบชื่อ"}</h1>
        <p className={`num ${styles.hint}`}>
          {session.tracks.length} เพลง · รวม {minutes} นาที · ยาว {sessionLength(session)}
        </p>
        <ul className={styles.people}>
          {session.participants.map((p) => (
            <li key={p.id} className={styles.person}>
              <Face name={p.name} url={p.avatarUrl} size={24} />
              <Link href={`/admin/users/${p.id}`}>{p.name}</Link>
            </li>
          ))}
        </ul>
      </header>
      <table className={styles.table}>
        <caption className={styles.hint}>เพลงในเซสชัน</caption>
        <thead>
          <tr>
            <th scope="col">เพลง</th>
            <th scope="col">ขอโดย</th>
            <th scope="col">ความยาว</th>
          </tr>
        </thead>
        <tbody>
          {session.tracks.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a session repeats tracks; rows are plays
            <tr key={`${t.playedAt}-${i}`}>
              <td>
                <span className={styles.rowTitle}>{t.title}</span>
                <br />
                <span className={styles.hint}>{t.author}</span>
              </td>
              <td>
                <span className={styles.person}>
                  <Face name={t.requester.name} url={t.requester.avatarUrl} size={24} />
                  {t.requester.name}
                </span>
              </td>
              <td className="num">{formatTime(t.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
