"use client";

import type { Track } from "@narze/shared";
import { useEffect, useRef, useState } from "react";

const KEY = (guildId: string) => `narze:notify:${guildId}`;

function storedOptIn(guildId: string): boolean {
  try {
    return window.localStorage.getItem(KEY(guildId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Now-playing notifications (PRODUCT.md #4, #106): per Guild, opt-in, and only once the browser
 * allows them. A notification is shown when the current track changes — not for the track already
 * playing when the page opened.
 */
export function useTrackNotifications(guildId: string, track: Track | null) {
  const [optedIn, setOptedIn] = useState(false);
  // Read in an effect: the server render has no Notification, so reading it while rendering would differ.
  const [blocked, setBlocked] = useState(false);
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    setOptedIn(storedOptIn(guildId));
    setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
  }, [guildId]);

  useEffect(() => {
    const uri = track?.uri ?? null;
    const first = seen.current === undefined;
    const changed = !first && uri !== null && uri !== seen.current;
    seen.current = uri;
    if (!changed || !optedIn || !track) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification("กำลังเล่น", { body: `${track.title} — ${track.author}`, tag: `narze-${guildId}` });
  }, [track, optedIn, guildId]);

  const toggle = async (on: boolean) => {
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => "denied");
    }
    setOptedIn(on);
    try {
      window.localStorage.setItem(KEY(guildId), on ? "1" : "0");
    } catch {
      // Without storage the choice lasts for this page only.
    }
  };
  return { optedIn, toggle, blocked };
}
