"use client";

import {
  AdminMeSchema,
  type AdminRole,
  type AdminStats,
  AdminStatsListSchema,
  AdminStatsSchema,
  type LogLine,
  LogLineSchema,
  SocketEvents,
  type WhitelistEntry,
  WhitelistEntrySchema,
} from "@narze/shared";
import { useEffect, useState } from "react";
import { answer, apiGet, apiSend, parsed } from "./api";
import { currentAccessToken, useSession } from "./session";
import { getSocket, onSocketEvents } from "./socket";

// One /api/admin/me per user per page load: the nav and the admin pages share it. Only a real answer
// (200: my role, 403: not on the whitelist) is remembered; a network error, a 401 or a 5xx asks again.
const roles = new Map<string, Promise<AdminRole | null>>();
const known = new Map<string, AdminRole | null>();
function fetchRole(userId: string): Promise<AdminRole | null> {
  let role = roles.get(userId);
  if (!role) {
    role = answer(apiGet("/api/admin/me")).then(async (res) => {
      const body = await parsed(res, AdminMeSchema);
      if (res?.ok || res?.status === 403) known.set(userId, body?.role ?? null);
      else roles.delete(userId);
      return body?.role ?? null;
    });
    roles.set(userId, role);
  }
  return role;
}

/** My admin role; null when I am not on the whitelist (the Backend answers 403). */
export function useAdminRole(): AdminRole | null | "loading" {
  const session = useSession();
  const userId = session.status === "signed-in" ? session.userId : null;
  const [role, setRole] = useState<AdminRole | null | "loading">(() =>
    userId && known.has(userId) ? (known.get(userId) ?? null) : "loading",
  );
  useEffect(() => {
    if (!userId) {
      setRole(session.status === "loading" ? "loading" : null);
      return;
    }
    let current = true;
    void fetchRole(userId).then((r) => current && setRole(r));
    return () => {
      current = false;
    };
  }, [userId, session.status]);
  return role;
}

export const getStats = async () => parsed(await answer(apiGet("/api/admin/stats")), AdminStatsListSchema);

export const getWhitelist = async () =>
  parsed<WhitelistEntry[]>(await answer(apiGet("/api/admin/whitelist")), WhitelistEntrySchema.array());
export const setWhitelist = async (discordId: string, role: AdminRole) =>
  (await answer(apiSend("PUT", "/api/admin/whitelist", { discordId, role })))?.ok ?? false;
export const removeWhitelist = async (discordId: string) =>
  (await answer(apiSend("DELETE", `/api/admin/whitelist/${encodeURIComponent(discordId)}`)))?.ok ?? false;

/**
 * The admin rooms (#110): stats samples, and — when `onLine` is given — the last console lines on
 * joining, then live lines. The rooms are joined again after every reconnect (a new socket has none).
 */
export function useAdminRoom(handlers: {
  onHistory?: (lines: LogLine[]) => void;
  onLine?: (line: LogLine) => void;
  onStats?: (sample: AdminStats) => void;
}): void {
  const { onHistory, onLine, onStats } = handlers;
  useEffect(() => {
    let alive = true;
    const join = async () => {
      const socket = await getSocket();
      const ack = (await socket
        .timeout(7000)
        .emitWithAck(SocketEvents.adminSubscribe, { logs: Boolean(onLine), token: currentAccessToken() })
        .catch(() => null)) as { ok?: boolean; history?: unknown } | null;
      const history = LogLineSchema.array().safeParse(ack?.history);
      if (alive && ack?.ok && history.success) onHistory?.(history.data);
    };
    void join();
    const off = onSocketEvents({
      [SocketEvents.sessionReady]: () => void join(),
      [SocketEvents.adminLog]: (raw: unknown) => {
        const line = LogLineSchema.safeParse(raw);
        if (line.success) onLine?.(line.data);
      },
      [SocketEvents.adminStats]: (raw: unknown) => {
        const sample = AdminStatsSchema.safeParse(raw);
        if (sample.success) onStats?.(sample.data);
      },
    });
    return () => {
      alive = false;
      off();
      // Leaving the admin pages leaves the rooms: no console lines for a tab that is elsewhere.
      void getSocket().then((socket) => socket.emit(SocketEvents.adminUnsubscribe));
    };
  }, [onHistory, onLine, onStats]);
}
