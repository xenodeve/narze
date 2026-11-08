"use client";

import type { BotStatusPayload } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { useEffect, useState } from "react";
import { isRehandshake, onSocketEvents } from "./socket";

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

  useEffect(
    () =>
      onSocketEvents({
        [SocketEvents.botStatus]: (payload: unknown) => {
          if (isBotStatusPayload(payload)) setView(payload);
        },
        // The Backend sends the status again on every connect, so a re-handshake needs no offline flash.
        disconnect: (reason: string) => {
          if (!isRehandshake(reason)) setView({ status: "offline", heartbeat: null });
        },
      }),
    [],
  );

  return view;
}
