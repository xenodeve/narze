"use client";

import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/config";
import { SIGNED_IN_MESSAGE } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import styles from "./callback.module.css";

type Step = "working" | "failed";

/**
 * Where Supabase Auth returns after Discord. Exchanges the PKCE code (a code minted for another
 * browser, or a tampered one, fails here), hands the Discord token to the Backend once so it can
 * store the guild list, then tells the opener and closes — or, with no opener, goes home.
 */
async function completeSignIn(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) throw new Error(params.get("error_description") ?? "missing code");
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) throw error ?? new Error("no session");
  const sync = await fetch(`${BACKEND_URL}/api/me/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ providerToken: data.session.provider_token }),
  });
  if (!sync.ok) {
    await supabase.auth.signOut();
    throw new Error(`sync failed: ${sync.status}`);
  }
}

/** Once per page load: a code can be exchanged only once, and dev StrictMode runs effects twice. */
let attempt: Promise<void> | undefined;

export default function AuthCallback() {
  const [step, setStep] = useState<Step>("working");

  useEffect(() => {
    attempt ??= completeSignIn();
    attempt.then(
      () => {
        const opener = window.opener as Window | null;
        if (opener && !opener.closed) {
          opener.postMessage(SIGNED_IN_MESSAGE, window.location.origin);
          window.close();
        } else {
          window.location.replace("/");
        }
      },
      () => setStep("failed"),
    );
  }, []);

  return (
    <main className={styles.main}>
      {step === "working" ? (
        <p role="status" className={styles.text}>
          กำลังเข้าสู่ระบบ…
        </p>
      ) : (
        <div role="alert" className={styles.box}>
          <h1 className={styles.title}>เข้าสู่ระบบไม่สำเร็จ</h1>
          <p className={styles.text}>ลิงก์นี้ใช้ไม่ได้หรือหมดอายุแล้ว ลองกดเข้าสู่ระบบใหม่จากหน้าแรก</p>
          <a className={styles.link} href="/">
            กลับหน้าแรก
          </a>
        </div>
      )}
    </main>
  );
}
