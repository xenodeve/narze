"use client";

import type { ControlPermission, GuildEvent, PlayerState } from "@narze/shared";
import { GuildEventTypes, SocketEvents } from "@narze/shared/channels";
import { EMPTY_SNAPSHOT, type PlayerSnapshot, reducePlayer } from "@narze/shared/queue";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "./api";
import { onSocketEvents } from "./socket";

export type PlayerView =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "failed" }
  /**
   * `state.syncedAt` is already on this browser's clock. `jumping` is the queue index announced by
   * `queue:jump` (spec #39), shown until the queue update that follows it.
   */
  | {
      status: "ready";
      state: PlayerState | null;
      permission: Permission;
      jumping: number | null;
      /** A voice drop (spec #28): the Bot is reconnecting, or gave up. */
      voice: VoiceStatus;
    };

/** The caller's Control Permission in this Guild, kept live by `permission:update` (#101). */
export type Permission = Pick<ControlPermission, "canControl" | "reason">;

const UNKNOWN: Permission = { canControl: false, reason: "not-in-voice" };

/** Moves `syncedAt` from the server's clock to ours, given one reading of both clocks. */
const onLocalClock = (state: PlayerState, serverNow: number, localNow: number): PlayerState => {
  const shift = localNow - serverNow;
  return {
    ...state,
    syncedAt: state.syncedAt + shift,
    lastSeekAt: state.lastSeekAt === null ? null : state.lastSeekAt + shift,
  };
};

const permissionOf = (view: PlayerView): Permission => (view.status === "ready" ? view.permission : UNKNOWN);

/**
 * One Guild's Player State: loaded from the Backend's Hot Cache, then kept live from the Guild
 * room's events, reconciled by revision (ADR-0007) — older events dropped, a gap refetches.
 */
const JUMP_TIMEOUT_MS = 3_000;

export type VoiceStatus = "reconnecting" | "failed" | null;
const VOICE_STATUS: Record<string, VoiceStatus> = {
  [GuildEventTypes.voiceDisconnect]: "reconnecting",
  [GuildEventTypes.voiceReconnected]: null,
  [GuildEventTypes.voiceReconnectFailed]: "failed",
};

export function usePlayer(guildId: string, userId: string): PlayerView {
  const [view, setView] = useState<PlayerView>({ status: "loading" });
  /** What the server last said, before clock conversion (the reducer's input). */
  const snapshot = useRef<PlayerSnapshot>(EMPTY_SNAPSHOT);
  /** Bumped by every applied event, so a load that started earlier cannot overwrite a newer event. */
  const applied = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different user must refetch; the token is read at fetch time
  useEffect(() => {
    let cancelled = false;
    /** A jump whose queue update never arrives (the Bot failed after announcing it) still ends. */
    let jumpTimer: ReturnType<typeof setTimeout> | undefined;
    snapshot.current = EMPTY_SNAPSHOT;

    const load = async () => {
      const startedAt = applied.current;
      try {
        const res = await apiGet(`/api/guilds/${guildId}/player`);
        if (res.status === 403) {
          if (!cancelled) setView({ status: "forbidden" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { state: PlayerState | null; now: number; permission: Permission };
        if (cancelled || applied.current !== startedAt) return;
        snapshot.current = body.state
          ? { state: body.state, revision: body.state.revision, epoch: body.state.epoch }
          : EMPTY_SNAPSHOT;
        setView({
          status: "ready",
          state: body.state ? onLocalClock(body.state, body.now, Date.now()) : null,
          permission: body.permission ?? UNKNOWN,
          jumping: null,
          voice: null,
        });
      } catch {
        if (!cancelled) setView({ status: "failed" });
      }
    };

    const onEvent = (raw: unknown) => {
      const event = raw as GuildEvent;
      if (event?.guildId !== guildId) return;
      if (event.type === GuildEventTypes.queueJump) {
        const { fromIndex } = event.data as { fromIndex: number };
        setView((current) => (current.status === "ready" ? { ...current, jumping: fromIndex } : current));
        clearTimeout(jumpTimer);
        jumpTimer = setTimeout(() => {
          setView((current) => (current.status === "ready" ? { ...current, jumping: null } : current));
        }, JUMP_TIMEOUT_MS);
        return;
      }
      const voice = VOICE_STATUS[event.type];
      if (voice !== undefined) {
        const recovering = (event.data as { recovering?: boolean } | null)?.recovering;
        const next = event.type === GuildEventTypes.voiceDisconnect && !recovering ? null : voice;
        setView((current) => (current.status === "ready" ? { ...current, voice: next } : current));
        return;
      }
      const { next, decision } = reducePlayer(snapshot.current, event);
      if (decision === "drop") return;
      if (decision === "refetch") {
        void load();
        return;
      }
      applied.current += 1;
      snapshot.current = next;
      // The event carries the Bot time it was sent; that is close enough to "now" on arrival.
      setView((current) => ({
        status: "ready",
        state: next.state ? onLocalClock(next.state, event.ts, Date.now()) : null,
        permission: permissionOf(current),
        jumping: null,
        voice: current.status === "ready" ? current.voice : null,
      }));
    };

    void load();
    const onPermission = (raw: unknown) => {
      const update = raw as { guildId?: string } & Permission;
      if (update?.guildId !== guildId) return;
      setView((current) =>
        current.status === "ready"
          ? { ...current, permission: { canControl: update.canControl, reason: update.reason } }
          : current,
      );
    };

    const off = onSocketEvents({
      [SocketEvents.playerEvent]: onEvent,
      [SocketEvents.permissionUpdate]: onPermission,
      [SocketEvents.sessionReady]: () => void load(),
    });
    return () => {
      cancelled = true;
      clearTimeout(jumpTimer);
      off();
    };
  }, [guildId, userId]);

  return view;
}
