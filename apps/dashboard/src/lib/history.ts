"use client";

import {
  type ListeningSession,
  ListeningSessionSchema,
  type SessionEvent,
  SessionEventSchema,
  type SessionSummary,
  SessionSummarySchema,
  SocketEvents,
  type TopPlayed,
  TopPlayedSchema,
} from "@narze/shared";
import { useEffect } from "react";
import { answer, apiGet, parsed } from "./api";
import { onSocketEvents } from "./socket";

/** The sessions I took part in (#108, spec #88), newest first; `q` searches server, people and tracks. */
export const listSessions = async (q = "") =>
  parsed<SessionSummary[]>(
    await answer(apiGet(`/api/sessions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)),
    SessionSummarySchema.array(),
  );

/** One of my sessions; "missing" when it is not mine or does not exist (the Backend says 404 for both). */
export async function getSession(id: string): Promise<ListeningSession | "missing" | null> {
  const res = await answer(apiGet(`/api/sessions/${encodeURIComponent(id)}`));
  if (res?.status === 404) return "missing";
  return parsed<ListeningSession>(res, ListeningSessionSchema);
}

/** Spec #84: my top-played across every server, or a server's. */
export const topPlayed = async (of: { me: true } | { guildId: string }, limit = 5): Promise<TopPlayed[] | null> =>
  parsed<TopPlayed[]>(
    await answer(
      apiGet(
        "me" in of
          ? `/api/history/top?scope=me&limit=${limit}`
          : `/api/history/top?guildId=${encodeURIComponent(of.guildId)}&limit=${limit}`,
      ),
    ),
    TopPlayedSchema.array(),
  );

/** A session I am in started a track or ended (#108); the Backend sends these to participants only. */
export function useSessionEvents(onSession: (event: SessionEvent) => void): void {
  useEffect(() => {
    const handle = (raw: unknown) => {
      const parsed = SessionEventSchema.safeParse(raw);
      if (parsed.success) onSession(parsed.data);
    };
    return onSocketEvents({ [SocketEvents.sessionUpdate]: handle, [SocketEvents.sessionEnd]: handle });
  }, [onSession]);
}

/** "15 นาที", "1 ชม. 5 นาที": how long a session has run (or ran). */
export function sessionLength(session: Pick<SessionSummary, "startTime" | "endTime">, now = Date.now()): string {
  return duration((session.endTime ?? now) - session.startTime);
}

/** A span of time to the minute: "15 นาที", "1 ชม. 5 นาที", "2 ชม.". */
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} ชม. ${minutes % 60} นาที` : `${hours} ชม.`;
}
