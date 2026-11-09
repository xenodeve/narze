"use client";

import type { GuildSummary, PermissionBadge } from "@narze/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GuildIcon } from "@/components/guild-icon";
import { LoadError } from "@/components/load-error";
import { SELECTED_GUILD_KEY } from "@/lib/last-guild";
import { retryGuilds, useGuilds } from "@/lib/use-guilds";
import styles from "./server-list.module.css";

/** Latin badge text is set in mono (DESIGN.md Badge); the Thai meaning is the accessible name. */
const BADGE: Record<PermissionBadge, { text: string; meaning: string; tone: string }> = {
  owner: { text: "OWNER", meaning: "คุณเป็นเจ้าของเซิร์ฟเวอร์นี้", tone: "ok" },
  "in-voice": { text: "IN VOICE", meaning: "คุณอยู่ห้องเสียงเดียวกับบอท สั่งเพลงได้", tone: "live" },
  "can-play": { text: "CAN PLAY", meaning: "คุณเริ่มเปิดเพลงได้", tone: "idle" },
  "view-only": { text: "VIEW ONLY", meaning: "ดูได้อย่างเดียว เข้าห้องเสียงก่อนถึงจะสั่งเพลงได้", tone: "offline" },
};

function GuildRow({ guild }: { guild: GuildSummary }) {
  const badge = BADGE[guild.badge];
  return (
    <li className={styles.row} data-testid="guild-row" data-guild-id={guild.id}>
      <GuildIcon guildId={guild.id} name={guild.name} iconUrl={guild.iconUrl} size={40} />
      <div className={styles.body}>
        <Link className={styles.name} href={`/guilds/${guild.id}`}>
          {guild.name}
        </Link>
        <p className={styles.meta} data-testid="guild-player">
          {guild.playing ? (
            <>
              <span className={styles.bars} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>กำลังเล่น</span>
            </>
          ) : (
            <span>ว่าง</span>
          )}
          {guild.queueLength > 0 ? <span className="num">คิว {guild.queueLength} เพลง</span> : null}
          {guild.memberCount !== null ? <span className="num">{guild.memberCount} สมาชิก</span> : null}
        </p>
      </div>
      <span className={`mono ${styles.badge}`} data-tone={badge.tone} title={badge.meaning} data-testid="guild-badge">
        <span aria-hidden="true">{badge.text}</span>
        <span className="sr-only">{badge.meaning}</span>
      </span>
    </li>
  );
}

/** The way back to the server opened last (#176), when it is still one of the user's. */
function LastServer({ guilds }: { guilds: GuildSummary[] }) {
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLastId(window.localStorage.getItem(SELECTED_GUILD_KEY));
    } catch {
      // Storage may be unavailable (private mode): no way back is offered, nothing breaks.
    }
  }, []);
  const last = guilds.find((g) => g.id === lastId);
  if (!last) return null;
  return (
    <Link className={styles.last} href={`/guilds/${last.id}`} data-testid="last-server">
      <GuildIcon guildId={last.id} name={last.name} iconUrl={last.iconUrl} size={28} />
      <span>
        กลับไปที่ <strong>{last.name}</strong>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

/** The signed-in user's Mutual Guilds with live Player badges (#99). */
export function ServerList({ userId }: { userId: string }) {
  const view = useGuilds(userId);

  return (
    <section className={styles.section} aria-labelledby="servers-title" aria-busy={view.status === "loading"}>
      <h2 id="servers-title" className={styles.title}>
        เซิร์ฟเวอร์ของคุณ
      </h2>
      {view.status === "loading" ? (
        <ul className={styles.list} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={`${styles.row} ${styles.skeleton}`} />
          ))}
        </ul>
      ) : view.status === "failed" ? (
        <LoadError onRetry={() => retryGuilds(userId)}>โหลดรายชื่อเซิร์ฟเวอร์ไม่ได้</LoadError>
      ) : view.guilds.length === 0 ? (
        <p className={styles.empty}>ยังไม่มีเซิร์ฟเวอร์ที่คุณกับบอทอยู่ด้วยกัน ชวนบอทเข้าเซิร์ฟเวอร์ก่อนแล้วกลับมาดูอีกที</p>
      ) : (
        <>
          <LastServer guilds={view.guilds} />
          <ul className={styles.list}>
            {view.guilds.map((guild) => (
              <GuildRow key={guild.id} guild={guild} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
