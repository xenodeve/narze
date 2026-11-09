"use client";

import type { PlayPermission } from "@narze/shared";
import { useEffect, useRef, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { GuildIcon } from "@/components/guild-icon";
import { playPermissions } from "@/lib/catalog";
import { playInGuild, REASON_TH } from "@/lib/control";
import styles from "./select-server.module.css";

/** A track (or link) to play from a browse page. */
export interface PlayTarget {
  title: string;
  query: string;
}

/**
 * Spec #91: before any play from a browse page, choose the server. Each Mutual Guild shows whether
 * the user can play there, and why not (the same Control Permission ladder the Backend enforces).
 */
export function SelectServer({ target, onClose }: { target: PlayTarget | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [guilds, setGuilds] = useState<PlayPermission[] | null | "failed">(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      dialog.current?.close();
      return;
    }
    setStatus(null);
    setGuilds(null);
    dialog.current?.showModal();
    let live = true;
    void playPermissions().then((list) => {
      // Where you can play comes first; each group keeps Discord's order (a stable sort).
      if (live) setGuilds(list ? [...list].sort((a, b) => Number(b.canPlay) - Number(a.canPlay)) : "failed");
    });
    return () => {
      live = false;
    };
  }, [target]);

  const play = async (guild: PlayPermission) => {
    if (!target) return;
    setBusy(guild.guildId);
    const result = await playInGuild(guild.guildId, target.query);
    setBusy(null);
    setStatus(
      result.ok
        ? { ok: true, text: `เพิ่ม ${target.title} ใน ${guild.name} แล้ว` }
        : { ok: false, text: result.text ?? "เล่นไม่สำเร็จ" },
    );
  };

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="select-server-title">
      <h2 id="select-server-title" className={styles.title}>
        เลือกเซิร์ฟเวอร์
      </h2>
      {target ? <p className={styles.what}>{target.title}</p> : null}
      {guilds === null ? (
        <Thinking label="กำลังโหลดเซิร์ฟเวอร์" />
      ) : guilds === "failed" ? (
        <p role="alert" className={styles.error}>
          โหลดรายชื่อเซิร์ฟเวอร์ไม่ได้ ลองอีกครั้ง
        </p>
      ) : guilds.length === 0 ? (
        <p className={styles.note}>ยังไม่มีเซิร์ฟเวอร์ที่มีบอทอยู่</p>
      ) : (
        <ul className={styles.list}>
          {guilds.map((g) => (
            <li key={g.guildId}>
              <button
                type="button"
                className={styles.guild}
                disabled={!g.canPlay || busy !== null}
                onClick={() => void play(g)}
                aria-describedby={g.canPlay ? undefined : `why-${g.guildId}`}
              >
                <GuildIcon guildId={g.guildId} name={g.name} iconUrl={g.iconUrl} size={32} />
                <span className={styles.text}>
                  <span className={styles.name}>{g.name}</span>
                  {g.canPlay ? null : (
                    <span id={`why-${g.guildId}`} className={styles.reason}>
                      {REASON_TH[g.reason]}
                    </span>
                  )}
                </span>
                <span className={styles.chip} data-tone={g.canPlay ? "ok" : "offline"}>
                  {busy === g.guildId ? "กำลังเพิ่ม…" : g.canPlay ? "เล่นได้" : "ล็อก"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {status ? (
        <p role="status" className={status.ok ? styles.done : styles.error}>
          {status.text}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.close} onClick={onClose}>
          ปิด
        </button>
      </div>
    </dialog>
  );
}
