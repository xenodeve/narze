"use client";

import type { GuildSummary } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { useEffect, useState } from "react";
import { getSocket } from "./socket";
import { BACKEND_URL } from "./supabase";

export type GuildsView = { status: "loading" } | { status: "failed" } | { status: "ready"; guilds: GuildSummary[] };

/** The Backend validates what it emits; the client only checks the fields it renders. */
function isGuildSummary(value: unknown): value is GuildSummary {
  const v = value as Partial<GuildSummary> | null;
  return typeof v?.id === "string" && typeof v.playing === "boolean" && typeof v.queueLength === "number";
}

/**
 * Mutual Guilds of the signed-in user, kept live: a Player change arrives as one GuildSummary and
 * replaces its row; a re-handshake (reconnect, new token) refetches the whole list.
 */
export function useGuilds(accessToken: string): GuildsView {
  const [view, setView] = useState<GuildsView>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let detach = () => {};

    const load = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/me/guilds`, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const guilds = (await res.json()) as GuildSummary[];
        if (!cancelled) setView({ status: "ready", guilds });
      } catch {
        if (!cancelled) setView({ status: "failed" });
      }
    };
    const onSummary = (summary: unknown) => {
      if (!isGuildSummary(summary)) return;
      setView((current) =>
        current.status === "ready"
          ? { status: "ready", guilds: current.guilds.map((g) => (g.id === summary.id ? summary : g)) }
          : current,
      );
    };
    const onReady = () => void load();

    void load();
    void getSocket().then((socket) => {
      if (cancelled) return;
      socket.on(SocketEvents.guildSummary, onSummary);
      socket.on(SocketEvents.sessionReady, onReady);
      detach = () => {
        socket.off(SocketEvents.guildSummary, onSummary);
        socket.off(SocketEvents.sessionReady, onReady);
      };
    });
    return () => {
      cancelled = true;
      detach();
    };
  }, [accessToken]);

  return view;
}
