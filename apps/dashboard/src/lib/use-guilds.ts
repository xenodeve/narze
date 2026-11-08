"use client";

import type { GuildSummary } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { onSocketEvents } from "./socket";

export type GuildsView = { status: "loading" } | { status: "failed" } | { status: "ready"; guilds: GuildSummary[] };

/** The Backend validates what it emits; the client only checks the fields it renders. */
function isGuildSummary(value: unknown): value is GuildSummary {
  const v = value as Partial<GuildSummary> | null;
  return typeof v?.id === "string" && typeof v.playing === "boolean" && typeof v.queueLength === "number";
}

/**
 * Mutual Guilds of the signed-in user, kept live: a Player change arrives as one GuildSummary and
 * replaces its row; a new handshake (reconnect after a drop) refetches the list. Keyed on the user,
 * so an hourly token refresh does not refetch.
 */
export function useGuilds(userId: string): GuildsView {
  const [view, setView] = useState<GuildsView>({ status: "loading" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different user must refetch; the token is read at fetch time
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiGet("/api/me/guilds");
        if (!res.ok) throw new Error(String(res.status));
        const guilds = (await res.json()) as GuildSummary[];
        if (!cancelled) setView({ status: "ready", guilds });
      } catch {
        if (!cancelled) setView({ status: "failed" });
      }
    };
    void load();
    const off = onSocketEvents({
      [SocketEvents.guildSummary]: (summary: unknown) => {
        if (!isGuildSummary(summary)) return;
        setView((current) =>
          current.status === "ready"
            ? { status: "ready", guilds: current.guilds.map((g) => (g.id === summary.id ? summary : g)) }
            : current,
        );
      },
      [SocketEvents.sessionReady]: () => void load(),
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [userId]);

  return view;
}
