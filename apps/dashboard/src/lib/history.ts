"use client";

import {
  type ListeningSession,
  ListeningSessionSchema,
  type SessionSummary,
  SessionSummarySchema,
  SocketEvents,
  type TopPlayed,
  TopPlayedSchema,
} from "@narze/shared";
import { useEffect } from "react";
import { apiGet } from "./api";
import { onSocketEvents } from "./socket";

async function read<T>(
  path: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): Promise<T | null> {
  const res = await apiGet(path).catch(() => null);
  if (!res?.ok) return null;
  const parsed = schema.safeParse(await res.json().catch(() => null));
  return parsed.success ? (parsed.data as T) : null;
}

/** The sessions I took part in (#108, spec #88), newest first. */
export const listSessions = () => read<SessionSummary[]>("/api/sessions", SessionSummarySchema.array());

/** One of my sessions; "missing" when it is not mine or does not exist (the Backend says 404 for both). */
export async function getSession(id: string): Promise<ListeningSession | "missing" | null> {
  const res = await apiGet(`/api/sessions/${encodeURIComponent(id)}`).catch(() => null);
  if (res?.status === 404) return "missing";
  if (!res?.ok) return null;
  const parsed = ListeningSessionSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** Spec #84: my top-played across every server, or a server's. */
export const topPlayed = (of: { me: true } | { guildId: string }): Promise<TopPlayed[] | null> =>
  read<TopPlayed[]>(
    "me" in of ? "/api/history/top?scope=me" : `/api/history/top?guildId=${encodeURIComponent(of.guildId)}`,
    TopPlayedSchema.array(),
  );

/** A session I am in started a track or ended (#108); the Backend sends these to participants only. */
export function useSessionEvents(onSession: (session: ListeningSession) => void): void {
  useEffect(() => {
    const handle = (raw: unknown) => {
      const parsed = ListeningSessionSchema.safeParse(raw);
      if (parsed.success) onSession(parsed.data);
    };
    return onSocketEvents({ [SocketEvents.sessionUpdate]: handle, [SocketEvents.sessionEnd]: handle });
  }, [onSession]);
}

/** "15 นาที", "1 ชม. 5 นาที": how long a session has run (or ran). */
export function sessionLength(session: Pick<SessionSummary, "startTime" | "endTime">, now = Date.now()): string {
  const minutes = Math.max(0, Math.round(((session.endTime ?? now) - session.startTime) / 60_000));
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} ชม. ${minutes % 60} นาที` : `${hours} ชม.`;
}
