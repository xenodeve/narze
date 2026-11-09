"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "@/lib/session";
import styles from "./account.module.css";

/**
 * Sign In with Discord (#176): the top bar's, and the one every "sign in first" prompt carries, so
 * a prompt is never a dead end.
 */
export function SignInButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await signIn();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.account}>
      {failed ? (
        <span role="alert" className={styles.error}>
          เปิดหน้าเข้าสู่ระบบไม่ได้
        </span>
      ) : null}
      <button type="button" className={styles.primary} onClick={() => void start()} disabled={busy}>
        เข้าสู่ระบบด้วย Discord
      </button>
    </div>
  );
}

/** A "sign in first" message with its button (#176). */
export function SignInPrompt({ children }: { children: string }) {
  return (
    <div className={styles.prompt}>
      <p role="status">{children}</p>
      <SignInButton />
    </div>
  );
}

/** Top-right account control: Sign In with Discord, or who is signed in and Sign Out. */
export function Account() {
  const session = useSession();
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  if (session.status === "loading") return <span className={styles.placeholder} aria-hidden="true" />;

  if (session.status === "signed-out") return <SignInButton />;

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
