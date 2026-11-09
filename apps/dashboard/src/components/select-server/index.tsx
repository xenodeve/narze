"use client";

import type { PlayPermission } from "@narze/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { GuildIcon } from "@/components/guild-icon";
import { LoadError } from "@/components/load-error";
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
  const [status, setStatus] = useState<{ ok: boolean; text: string; guildId?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Bumped by "ลองอีกครั้ง" (#176): asks for the list again without leaving the dialog.
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` exists only to run this again
  useEffect(() => {
    if (!target) {
      dialog.current?.close();
      return;
    }
    setStatus(null);
    setGuilds(null);
    // A retry runs this again while the dialog is open; showModal() would throw on an open one.
    if (!dialog.current?.open) dialog.current?.showModal();
    let live = true;
    void playPermissions().then((list) => {
      // Where you can play comes first; each group keeps Discord's order (a stable sort).
      if (live) setGuilds(list ? [...list].sort((a, b) => Number(b.canPlay) - Number(a.canPlay)) : "failed");
    });
    return () => {
      live = false;
    };
  }, [target, attempt]);

  const play = async (guild: PlayPermission) => {
    if (!target) return;
    setBusy(guild.guildId);
    const result = await playInGuild(guild.guildId, target.query);
    setBusy(null);
    setStatus(
      result.ok
        ? { ok: true, text: `เพิ่ม ${target.title} ใน ${guild.name} แล้ว`, guildId: guild.guildId }
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
        <LoadError onRetry={() => setAttempt((n) => n + 1)}>โหลดรายชื่อเซิร์ฟเวอร์ไม่ได้</LoadError>
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
          {status.guildId ? (
            <>
              {" "}
              {/* The way to where it went (#176). */}
              <Link href={`/guilds/${status.guildId}`} className={styles.go} onClick={onClose}>
                ไปที่เซิร์ฟเวอร์ →
              </Link>
            </>
          ) : null}
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
