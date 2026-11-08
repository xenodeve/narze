"use client";

import type { BotStatusPayload } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { useEffect, useState } from "react";
import { getSocket } from "./socket";

export type BotStatusView = BotStatusPayload | { status: "connecting"; heartbeat: null };

/**
 * The Backend validates every heartbeat with the shared zod schema before emitting, so the
 * Dashboard only checks the discriminant here and keeps zod out of the client bundle.
 */
function isBotStatusPayload(value: unknown): value is BotStatusPayload {
  const status = (value as { status?: unknown } | null)?.status;
  return status === "online" || status === "offline";
}

/** Live Bot status from the Backend; "connecting" until the first message arrives. */
export function useBotStatus(): BotStatusView {
  const [view, setView] = useState<BotStatusView>({ status: "connecting", heartbeat: null });

  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    const onStatus = (payload: unknown) => {
      if (isBotStatusPayload(payload)) setView(payload);
    };
    // A sign-in or sign-out re-handshakes on purpose ("io client disconnect"); the Backend sends
    // the status again on connect, so only a real loss of connection reads as offline.
    const onDisconnect = (reason: string) => {
      if (reason !== "io client disconnect") setView({ status: "offline", heartbeat: null });
    };
    void getSocket().then((socket) => {
      if (cancelled) return;
      socket.on(SocketEvents.botStatus, onStatus);
      socket.on("disconnect", onDisconnect);
      detach = () => {
        socket.off(SocketEvents.botStatus, onStatus);
        socket.off("disconnect", onDisconnect);
      };
    });
    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  return view;
}
