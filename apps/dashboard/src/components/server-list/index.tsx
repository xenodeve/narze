"use client";

import type { GuildSummary, PermissionBadge } from "@narze/shared";
import { useGuilds } from "@/lib/use-guilds";
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
      {guild.iconUrl ? (
        // biome-ignore lint/performance/noImgElement: a 40px guild icon from Discord's CDN; next/image would add remote-pattern config for no gain
        <img className={styles.icon} src={guild.iconUrl} width={40} height={40} alt="" />
      ) : (
        <span className={styles.monogram} aria-hidden="true">
          {Array.from(guild.name)[0] ?? "?"}
        </span>
      )}
      <div className={styles.body}>
        <p className={styles.name}>{guild.name}</p>
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
        <p role="alert" className={styles.empty}>
          โหลดรายชื่อเซิร์ฟเวอร์ไม่ได้ ลองรีเฟรชหน้านี้อีกครั้ง
        </p>
      ) : view.guilds.length === 0 ? (
        <p className={styles.empty}>ยังไม่มีเซิร์ฟเวอร์ที่คุณกับบอทอยู่ด้วยกัน ชวนบอทเข้าเซิร์ฟเวอร์ก่อนแล้วกลับมาดูอีกที</p>
      ) : (
        <ul className={styles.list}>
          {view.guilds.map((guild) => (
            <GuildRow key={guild.id} guild={guild} />
          ))}
        </ul>
      )}
    </section>
  );
}
