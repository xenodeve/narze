"use client";

import { SignInPrompt } from "@/components/account";
import { ServerList } from "@/components/server-list";
import { useSession } from "@/lib/session";

/** What only a signed-in user sees on the home page. */
export function SignedInArea() {
  const session = useSession();
  if (session.status === "signed-out")
    return <SignInPrompt>เข้าสู่ระบบด้วย Discord แล้วจะเห็นเซิร์ฟเวอร์ที่คุณกับบอทอยู่ด้วยกัน</SignInPrompt>;
  return session.status === "signed-in" ? <ServerList userId={session.userId} /> : null;
}
