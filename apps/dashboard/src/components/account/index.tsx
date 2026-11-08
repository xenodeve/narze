"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "@/lib/session";
import styles from "./account.module.css";

/** Top-right account control: Sign In with Discord, or who is signed in and Sign Out. */
export function Account() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (session.status === "loading") return <span className={styles.placeholder} aria-hidden="true" />;

  if (session.status === "signed-out") {
    return (
      <div className={styles.account}>
        {failed ? (
          <span role="alert" className={styles.error}>
            เปิดหน้าเข้าสู่ระบบไม่ได้
          </span>
        ) : null}
        <button type="button" className={styles.primary} onClick={run(signIn)} disabled={busy}>
          เข้าสู่ระบบด้วย Discord
        </button>
      </div>
    );
  }

  return (
    <div className={styles.account}>
      <span className={styles.who}>
        {session.user.avatarUrl ? (
          // biome-ignore lint/performance/noImgElement: a 28px avatar from Discord's CDN; next/image would add remote-pattern config for no gain
          <img className={styles.face} src={session.user.avatarUrl} alt="" width={28} height={28} />
        ) : null}
        <span className={styles.name} data-testid="account-name">
          {session.user.name}
        </span>
      </span>
      <button type="button" className={styles.ghost} onClick={run(signOut)} disabled={busy}>
        ออกจากระบบ
      </button>
    </div>
  );
}
