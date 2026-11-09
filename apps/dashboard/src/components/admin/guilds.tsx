"use client";

import {
  type AdminGuild,
  type AdminGuildRow,
  MESSAGE_PAGE,
  type SessionSummary,
  type TextChannelEntry,
  type TopPlayed,
} from "@narze/shared";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { GuildIcon } from "@/components/guild-icon";
import { getAdminGuild, getAdminGuilds, getChannels, getGuildHistory, getGuildSessions, useLoad } from "@/lib/admin";
import { thaiDate, thaiDateTime } from "@/lib/format";
import { sessionLength } from "@/lib/history";
import pill from "@/styles/pill-tabs.module.css";
import styles from "./admin.module.css";
import { ChannelViewer } from "./channel";
import { AdminArea } from "./index";

type Sort = "name" | "members" | "joined";
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "name", label: "ชื่อ" },
  { value: "members", label: "สมาชิก" },
  { value: "joined", label: "วันที่บอทเข้า" },
];

/** Spec #110: every server the Bot is in — search, sort, totals, and open as a user would. */
export function AdminGuilds() {
  return <AdminArea>{() => <GuildList />}</AdminArea>;
}

function GuildList() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("members");
  const guilds = useLoad(() => getAdminGuilds(), "");
  const shown = useMemo(() => {
    if (!Array.isArray(guilds)) return [];
    const q = query.trim().toLowerCase();
    const found = guilds.filter((g) => !q || g.name.toLowerCase().includes(q) || g.id.includes(q));
    const by: Record<Sort, (a: AdminGuildRow, b: AdminGuildRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, "th"),
      members: (a, b) => b.memberCount - a.memberCount,
      joined: (a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0),
    };
    return [...found].sort(by[sort]);
  }, [guilds, query, sort]);

  return (
    <>
      <h1 className={styles.title}>เซิร์ฟเวอร์ทั้งหมด</h1>
      {guilds === null ? (
        <Thinking label="กำลังถามบอท" />
      ) : guilds === "failed" ? (
        <p role="alert" className={styles.error}>
          ถามรายชื่อเซิร์ฟเวอร์จากบอทไม่สำเร็จ บอทอาจออฟไลน์อยู่
        </p>
      ) : (
        <>
          <ul className={styles.cards} data-testid="admin-totals">
            <li className={styles.card}>
              <span className={styles.cardLabel}>เซิร์ฟเวอร์</span>
              <span className={`num ${styles.cardValue}`}>{guilds.length}</span>
            </li>
            <li className={styles.card}>
              <span className={styles.cardLabel}>สมาชิกรวม</span>
              <span className={`num ${styles.cardValue}`}>{guilds.reduce((n, g) => n + g.memberCount, 0)}</span>
            </li>
            <li className={styles.card}>
              <span className={styles.cardLabel}>กำลังเล่น</span>
              <span className={`num ${styles.cardValue}`}>{guilds.filter((g) => g.playing).length}</span>
            </li>
          </ul>
          <div className={styles.toolbar}>
            <input
              type="search"
              className={styles.search}
              placeholder="ชื่อหรือ ID"
              aria-label="ค้นหาเซิร์ฟเวอร์"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <fieldset className={`${pill.tabs} ${styles.plainSet}`}>
              <legend className="sr-only">เรียงตาม</legend>
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={sort === s.value}
                  className={pill.tab}
                  onClick={() => setSort(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </fieldset>
          </div>
          {shown.length === 0 ? (
            <p className={styles.hint}>ไม่พบเซิร์ฟเวอร์ที่ตรงกับคำค้น</p>
          ) : (
            <ul className={styles.rows}>
              {shown.map((g) => (
                <li key={g.id} className={styles.row} data-testid="admin-guild">
                  <GuildIcon guildId={g.id} name={g.name} iconUrl={g.iconUrl} size={36} />
                  <span className={styles.rowMain}>
                    <Link href={`/admin/guilds/${g.id}`} className={styles.rowTitle}>
                      {g.name}
                    </Link>
                    <span className={`num ${styles.hint}`}>
                      {g.memberCount} สมาชิก{g.joinedAt ? ` · บอทเข้าเมื่อ ${thaiDate(g.joinedAt)}` : ""}
                    </span>
                  </span>
                  {g.playing ? (
                    <span className={`mono ${styles.badge}`} data-tone="live">
                      กำลังเล่น
                    </span>
                  ) : null}
                  <Link href={`/guilds/${g.id}`} className={styles.ghost}>
                    เปิดแบบผู้ใช้
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

const TABS = [
  { value: "overview", label: "ภาพรวม" },
  { value: "channels", label: "ช่อง" },
  { value: "sessions", label: "เซสชัน" },
  { value: "history", label: "ประวัติ" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** Spec #111: one server — overview, channels (read-only viewer), sessions, history; tab and channel in the URL. */
export function AdminGuildDetail({ id }: { id: string }) {
  return <AdminArea>{() => <GuildDetail id={id} />}</AdminArea>;
}

function GuildDetail({ id }: { id: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab: Tab = TABS.some((t) => t.value === params.get("tab")) ? (params.get("tab") as Tab) : "overview";
  const channel = params.get("channel");
  const guild = useLoad(() => getAdminGuild(id), id);
  const href = (next: { tab: Tab; channel?: string }) =>
    `${path}?tab=${next.tab}${next.channel ? `&channel=${next.channel}` : ""}`;

  if (guild === null) return <Thinking label="กำลังถามบอท" />;
  // Sessions and history come from Supabase: they still open when the Bot cannot answer (m3).
  const known = guild === "failed" ? null : guild;
  return (
    <>
      <header className={styles.guildHead}>
        <GuildIcon guildId={id} name={known?.name ?? "?"} iconUrl={known?.iconUrl ?? null} size={56} />
        <div>
          <h1 className={styles.title}>{known?.name ?? `เซิร์ฟเวอร์ ${id}`}</h1>
          {known ? null : (
            <p role="alert" className={styles.error}>
              บอทตอบเรื่องเซิร์ฟเวอร์นี้ไม่ได้ (ออฟไลน์อยู่ หรือออกจากเซิร์ฟเวอร์แล้ว) ยังดูเซสชันกับประวัติได้
            </p>
          )}
          {known ? (
            <p className={`num ${styles.hint}`}>
              {known.memberCount} สมาชิก
              {known.joinedAt ? (
                <>
                  {" · "}
                  <span data-testid="guild-joined">บอทเข้าเมื่อ {thaiDate(known.joinedAt)}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>
      <div role="tablist" aria-label="ส่วนของเซิร์ฟเวอร์" className={pill.tabs}>
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={pill.tab}
            onClick={() => router.replace(href({ tab: t.value }))}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "overview" && !known ? (
          <p className={styles.hint}>ภาพรวมต้องถามจากบอท ลองใหม่เมื่อบอทออนไลน์</p>
        ) : tab === "overview" && known ? (
          <dl className={styles.facts}>
            <dt>ID</dt>
            <dd className="mono num">{known.id}</dd>
            <dt>เจ้าของ</dt>
            <dd className="mono num">{known.ownerId}</dd>
            <dt>สมาชิก</dt>
            <dd className="num">{known.memberCount}</dd>
            <dt>บอทเข้าเมื่อ</dt>
            <dd className="num">{known.joinedAt ? thaiDateTime(known.joinedAt) : "ไม่ทราบ"}</dd>
            <dt>มุมมองผู้ใช้</dt>
            <dd>
              <Link href={`/guilds/${known.id}`}>เปิดหน้าเซิร์ฟเวอร์</Link>
            </dd>
          </dl>
        ) : tab === "channels" ? (
          <Channels guildId={id} channel={channel} href={(c) => href({ tab: "channels", channel: c })} />
        ) : tab === "sessions" ? (
          <GuildSessions guildId={id} />
        ) : (
          <GuildHistory guildId={id} />
        )}
      </div>
    </>
  );
}

function Channels({
  guildId,
  channel,
  href,
}: {
  guildId: string;
  channel: string | null;
  href: (id: string) => string;
}) {
  const channels = useLoad(() => getChannels(guildId), guildId);
  if (channels === null) return <Thinking label="กำลังโหลดช่อง" />;
  if (channels === "failed")
    return (
      <p role="alert" className={styles.error}>
        โหลดรายชื่อช่องไม่สำเร็จ
      </p>
    );
  return (
    <div className={styles.split}>
      <nav aria-label="ช่องข้อความ" className={styles.channelList}>
        <ul>
          {channels.map((c) => (
            <li key={c.id}>
              <Link
                href={href(c.id)}
                aria-current={c.id === channel ? "page" : undefined}
                className={styles.channelLink}
              >
                <span aria-hidden="true">{c.kind === "thread" ? "🧵" : c.kind === "announcement" ? "📣" : "#"}</span>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {channel ? (
        <ChannelViewer guildId={guildId} channelId={channel} threadHref={href} />
      ) : (
        <p className={styles.hint}>เลือกช่องทางซ้ายเพื่ออ่าน {MESSAGE_PAGE} ข้อความล่าสุด</p>
      )}
    </div>
  );
}

function GuildSessions({ guildId }: { guildId: string }) {
  const sessions = useLoad(() => getGuildSessions(guildId), guildId);
  if (sessions === null) return <Thinking label="กำลังโหลดเซสชัน" />;
  if (sessions === "failed")
    return (
      <p role="alert" className={styles.error}>
        โหลดเซสชันไม่สำเร็จ
      </p>
    );
  if (sessions.length === 0) return <p className={styles.hint}>ยังไม่มีเซสชันการฟังในเซิร์ฟเวอร์นี้</p>;
  return <SessionRows sessions={sessions} />;
}

export function SessionRows({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <ul className={styles.rows}>
      {sessions.map((s) => (
        <li key={s.id} className={styles.row}>
          <span className={styles.rowMain}>
            <Link href={`/admin/sessions/${encodeURIComponent(s.id)}`} className={styles.rowTitle}>
              {s.guildName || "เซิร์ฟเวอร์ที่ไม่ทราบชื่อ"} · {thaiDateTime(s.startTime)}
            </Link>
            <span className={`num ${styles.hint}`}>
              {s.trackCount} เพลง · {sessionLength(s)} · {s.participants.length} คน
            </span>
          </span>
          {s.isActive ? (
            <span className={`mono ${styles.badge}`} data-tone="live">
              กำลังฟังอยู่
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function GuildHistory({ guildId }: { guildId: string }) {
  const history = useLoad(() => getGuildHistory(guildId), guildId);
  if (history === null) return <Thinking label="กำลังโหลดประวัติ" />;
  if (history === "failed")
    return (
      <p role="alert" className={styles.error}>
        โหลดประวัติไม่สำเร็จ
      </p>
    );
  if (history.length === 0) return <p className={styles.hint}>ยังไม่มีเพลงที่เล่นในเซิร์ฟเวอร์นี้</p>;
  return <PlayRows plays={history} />;
}

export function PlayRows({ plays, testId }: { plays: TopPlayed[]; testId?: string }) {
  return (
    <ul className={styles.rows} data-testid={testId}>
      {plays.map((p) => (
        <li key={p.trackId} className={styles.row}>
          {p.thumbnail ? (
            // biome-ignore lint/performance/noImgElement: track artwork from many hosts
            <img className={styles.icon} src={p.thumbnail} alt="" width={36} height={36} />
          ) : null}
          <span className={styles.rowMain}>
            <span className={styles.rowTitle}>{p.title}</span>
            <span className={styles.hint}>{p.artist}</span>
          </span>
          <span className={`num ${styles.hint}`}>
            {p.playCount} ครั้ง · {thaiDateTime(Date.parse(p.lastPlayedAt))}
          </span>
        </li>
      ))}
    </ul>
  );
}
