"use client";

import dynamic from "next/dynamic";
import { useBotStatus } from "@/lib/use-bot-status";
import styles from "./bot-status-card.module.css";

// The avatar draws on a canvas; it loads after first paint and never blocks it.
const BotAvatar = dynamic(() => import("bot-avatars").then((m) => m.BotAvatar), { ssr: false });

const LABEL = { online: "ออนไลน์", offline: "ออฟไลน์", connecting: "กำลังเชื่อมต่อ" } as const;
const MODE = { connected: "เชื่อมต่อแดชบอร์ด", standalone: "ทำงานเดี่ยว" } as const;

export function BotStatusCard() {
  const view = useBotStatus();
  const online = view.status === "online";

  return (
    <section className={styles.card} aria-labelledby="bot-status-title">
      <div className={styles.avatar} aria-hidden="true">
        <BotAvatar type="clover" size={72} state={online ? "default" : "sleeping"} headphones />
      </div>
      <div className={styles.body}>
        <h2 id="bot-status-title" className={styles.label}>
          บอท
        </h2>
        <p role="status" aria-label="สถานะบอท" aria-live="polite" className={styles.status} data-status={view.status}>
          <span className={styles.dot} aria-hidden="true" />
          {LABEL[view.status]}
        </p>
        {view.heartbeat ? (
          <p className={styles.meta}>
            <span className="num">{view.heartbeat.guilds} เซิร์ฟเวอร์</span>
            <span>{MODE[view.heartbeat.mode]}</span>
          </p>
        ) : (
          <p className={styles.meta}>ยังไม่ได้รับสัญญาณจากบอท</p>
        )}
      </div>
    </section>
  );
}
