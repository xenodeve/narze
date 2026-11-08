"use client";

import { useEffect } from "react";
import { NowPlaying } from "@/components/now-playing";
import { useSession } from "@/lib/session";

/** sessionStorage key of the Guild the user last opened (spec #78, #105). */
export const SELECTED_GUILD_KEY = "selectedGuildId";

/** One Guild's page: Now Playing for a signed-in member; a sign-in prompt otherwise. */
export function GuildView({ guildId }: { guildId: string }) {
  const session = useSession();

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SELECTED_GUILD_KEY, guildId);
    } catch {
      // Storage may be unavailable (private mode); the selection is a convenience only.
    }
  }, [guildId]);

  if (session.status === "loading") return null;
  if (session.status === "signed-out") {
    return <p role="status">เข้าสู่ระบบด้วย Discord ก่อน แล้วจะเห็นเพลงที่เล่นอยู่ในเซิร์ฟเวอร์นี้</p>;
  }
  return <NowPlaying guildId={guildId} userId={session.userId} />;
}
