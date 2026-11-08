"use client";

import {
  type AdminRole,
  AdminRoleSchema,
  type AdminStats,
  AdminStatsSchema,
  type LogLine,
  LogLineSchema,
  SocketEvents,
  type WhitelistEntry,
  WhitelistEntrySchema,
} from "@narze/shared";
import { useEffect, useState } from "react";
import { answer, apiGet, apiSend, parsed } from "./api";
import { useSession } from "./session";
import { getSocket, onSocketEvents } from "./socket";

/** My admin role; null when I am not on the whitelist (the Backend answers 403). */
export function useAdminRole(): AdminRole | null | "loading" {
  const session = useSession();
  const userId = session.status === "signed-in" ? session.userId : null;
  const [role, setRole] = useState<AdminRole | null | "loading">("loading");
  useEffect(() => {
    if (!userId) {
      setRole(session.status === "loading" ? "loading" : null);
      return;
    }
    let current = true;
    void answer(apiGet("/api/admin/me")).then(async (res) => {
      const body = await parsed<{ role: AdminRole }>(res, {
        safeParse: (v) => {
          const role = AdminRoleSchema.safeParse((v as { role?: unknown })?.role);
          return role.success ? { success: true, data: { role: role.data } } : { success: false };
        },
      });
      if (current) setRole(body?.role ?? null);
    });
    return () => {
      current = false;
    };
  }, [userId, session.status]);
  return role;
}

export const getStats = async () =>
  (await parsed<{ samples: AdminStats[] }>(await answer(apiGet("/api/admin/stats")), {
    safeParse: (v) => {
      const samples = AdminStatsSchema.array().safeParse((v as { samples?: unknown })?.samples);
      return samples.success ? { success: true, data: { samples: samples.data } } : { success: false };
    },
  })) ?? null;

export const getWhitelist = async () =>
  parsed<WhitelistEntry[]>(await answer(apiGet("/api/admin/whitelist")), WhitelistEntrySchema.array());
export const setWhitelist = async (discordId: string, role: AdminRole) =>
  (await answer(apiSend("PUT", "/api/admin/whitelist", { discordId, role })))?.ok ?? false;
export const removeWhitelist = async (discordId: string) =>
  (await answer(apiSend("DELETE", `/api/admin/whitelist/${encodeURIComponent(discordId)}`)))?.ok ?? false;

/**
 * The admin room (#110): the last console lines on joining, then live lines and stats samples. The
 * room is joined again after every reconnect (a new socket has no rooms).
 */
export function useAdminRoom(handlers: {
  onHistory: (lines: LogLine[]) => void;
  onLine: (line: LogLine) => void;
  onStats?: (sample: AdminStats) => void;
}): void {
  const { onHistory, onLine, onStats } = handlers;
  useEffect(() => {
    let alive = true;
    const join = async () => {
      const socket = await getSocket();
      const ack = (await socket
        .timeout(7000)
        .emitWithAck(SocketEvents.adminSubscribe)
        .catch(() => null)) as { ok?: boolean; history?: unknown } | null;
      const history = LogLineSchema.array().safeParse(ack?.history);
      if (alive && ack?.ok && history.success) onHistory(history.data);
    };
    void join();
    const off = onSocketEvents({
      [SocketEvents.sessionReady]: () => void join(),
      [SocketEvents.adminLog]: (raw: unknown) => {
        const line = LogLineSchema.safeParse(raw);
        if (line.success) onLine(line.data);
      },
      [SocketEvents.adminStats]: (raw: unknown) => {
        const sample = AdminStatsSchema.safeParse(raw);
        if (sample.success) onStats?.(sample.data);
      },
    });
    return () => {
      alive = false;
      off();
    };
  }, [onHistory, onLine, onStats]);
}
