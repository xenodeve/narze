"use client";

import { useEffect } from "react";
import { SignInPrompt } from "@/components/account";
import { NowPlaying } from "@/components/now-playing";
import { SELECTED_GUILD_KEY } from "@/lib/last-guild";
import { useSession } from "@/lib/session";

/** One Guild's page: Now Playing for a signed-in member; a sign-in prompt otherwise. */
export function GuildView({ guildId }: { guildId: string }) {
  const session = useSession();

  useEffect(() => {
    try {
      window.localStorage.setItem(SELECTED_GUILD_KEY, guildId);
    } catch {
      // Storage may be unavailable (private mode); the selection is a convenience only.
    }
  }, [guildId]);

  if (session.status === "loading") return null;
  if (session.status === "signed-out") {
    return <SignInPrompt>เข้าสู่ระบบด้วย Discord ก่อน แล้วจะเห็นเพลงที่เล่นอยู่ในเซิร์ฟเวอร์นี้</SignInPrompt>;
  }
  return <NowPlaying guildId={guildId} userId={session.userId} />;
}
