"use client";

import type { GuildEvent, PlayerState } from "@narze/shared";
import { GuildEventTypes, SocketEvents } from "@narze/shared/channels";
import { reconcile } from "@narze/shared/reconcile";
import { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "./config";
import { currentAccessToken } from "./session";
import { onSocketEvents } from "./socket";

export type PlayerView =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "failed" }
  /** `state.syncedAt` is already on this browser's clock. */
  | { status: "ready"; state: PlayerState | null };

/** Moves `syncedAt` from the server's clock to ours, given one reading of both clocks. */
const onLocalClock = (state: PlayerState, serverNow: number, localNow: number): PlayerState => ({
  ...state,
  syncedAt: state.syncedAt + (localNow - serverNow),
});

/**
 * One Guild's Player State: loaded from the Backend's Hot Cache, then kept live from the Guild
 * room's events, reconciled by revision (ADR-0007) — older events dropped, a gap refetches.
 */
export function usePlayer(guildId: string, userId: string): PlayerView {
  const [view, setView] = useState<PlayerView>({ status: "loading" });
  const revision = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different user must refetch; the token is read at fetch time
  useEffect(() => {
    let cancelled = false;
    revision.current = null;

    const load = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/guilds/${guildId}/player`, {
          headers: { authorization: `Bearer ${currentAccessToken() ?? ""}` },
        });
        if (res.status === 403) {
          if (!cancelled) setView({ status: "forbidden" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { state: PlayerState | null; now: number };
        if (cancelled) return;
        revision.current = body.state?.revision ?? null;
        setView({ status: "ready", state: body.state ? onLocalClock(body.state, body.now, Date.now()) : null });
      } catch {
        if (!cancelled) setView({ status: "failed" });
      }
    };

    const onEvent = (raw: unknown) => {
      const event = raw as GuildEvent;
      if (event?.guildId !== guildId) return;
      if (event.type === GuildEventTypes.playerGone) {
        revision.current = null;
        setView({ status: "ready", state: null });
        return;
      }
      const decision = reconcile(revision.current, event.revision);
      if (decision === "drop") return;
      if (decision === "refetch") {
        void load();
        return;
      }
      revision.current = event.revision;
      // The event carries the server time it was sent; that is close enough to "now" on arrival.
      setView({ status: "ready", state: onLocalClock(event.data as PlayerState, event.ts, Date.now()) });
    };

    void load();
    const off = onSocketEvents({
      [SocketEvents.playerEvent]: onEvent,
      [SocketEvents.sessionReady]: () => void load(),
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [guildId, userId]);

  return view;
}
