"use client";

import type { AdminRole, WhitelistEntry } from "@narze/shared";
import { useCallback, useEffect, useState } from "react";
import { getWhitelist, removeWhitelist, setWhitelist } from "@/lib/admin";
import styles from "./admin.module.css";
import { AdminArea } from "./index";

/** Spec #97: only a Developer sees Settings and changes who is an Admin or a Developer. */
export function AdminSettings() {
  return <AdminArea needs="developer">{() => <Whitelist />}</AdminArea>;
}

function Whitelist() {
  const [entries, setEntries] = useState<WhitelistEntry[] | null>(null);
  const [discordId, setDiscordId] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => {
    void getWhitelist().then((list) => setEntries(list ?? []));
  }, []);
  useEffect(load, [load]);
  const add = async () => {
    setMessage(null);
    if (await setWhitelist(discordId.trim(), role)) {
      setDiscordId("");
      load();
    } else setMessage("บันทึกไม่สำเร็จ ตรวจ Discord ID อีกครั้ง");
  };
  const remove = async (id: string) => {
    setMessage(null);
    if (await removeWhitelist(id)) load();
    else setMessage("ลบไม่สำเร็จ");
  };
  return (
    <>
      <h1 className={styles.title}>สิทธิ์แอดมิน</h1>
      <form
        className={styles.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className={styles.field}>
          Discord ID
          <input
            className={styles.search}
            inputMode="numeric"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            pattern="\d{17,20}"
          />
        </label>
        <label className={styles.field}>
          บทบาท
          <select className={styles.search} value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            <option value="admin">admin</option>
            <option value="developer">developer</option>
          </select>
        </label>
        <button type="submit" className={styles.primary} disabled={!/^\d{17,20}$/.test(discordId.trim())}>
          เพิ่ม
        </button>
      </form>
      {message ? (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      ) : null}
      <ul className={styles.rows}>
        {(entries ?? []).map((e) => (
          <li key={e.discordId} className={styles.row} data-testid="whitelist-row">
            <span className="mono num">{e.discordId}</span>
            <span className={`mono ${styles.badge}`}>{e.role}</span>
            {e.fixed ? (
              <span className={styles.hint}>ตั้งจาก environment</span>
            ) : (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => void remove(e.discordId)}
                aria-label={`ลบ ${e.discordId}`}
              >
                ลบ
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
