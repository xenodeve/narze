import type { GuildEvent, PlayerState } from "./player";
import { type Reconcile, reconcile } from "./reconcile";

/**
 * Moves the item at `from` so it lands at `to` (spec #46): `to` may equal the length (append), and
 * when moving down the item is dropped before the target, so the index is adjusted by one.
 * Null when an index is out of range.
 */
export function moveTrack<T>(queue: readonly T[], from: number, to: number): T[] | null {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || from >= queue.length || to < 0 || to > queue.length) return null;
  const next = [...queue];
  const [item] = next.splice(from, 1);
  if (item === undefined) return null;
  next.splice(to > from ? to - 1 : to, 0, item);
  return next;
}

/** What a client holds for one Guild's Player. */
export interface PlayerSnapshot {
  state: PlayerState | null;
  revision: number | null;
  epoch: string | null;
}

export const EMPTY_SNAPSHOT: PlayerSnapshot = { state: null, revision: null, epoch: null };

/**
 * The client's reducer over Guild events (ADR-0007). `player:state` applies, drops (older revision)
 * or asks for a refetch (a gap); a new Bot epoch always applies; `player:gone` clears. Other events
 * (`queue:jump`, summaries) never change the snapshot — they are drawn, not stored.
 */
export function reducePlayer(local: PlayerSnapshot, event: GuildEvent): { next: PlayerSnapshot; decision: Reconcile } {
  if (event.type === "player:gone") return { next: EMPTY_SNAPSHOT, decision: "apply" };
  if (event.type !== "player:state") return { next: local, decision: "drop" };
  const state = event.data as PlayerState;
  const decision = reconcile(local.revision, event.revision, state.epoch !== local.epoch);
  if (decision !== "apply") return { next: local, decision };
  return { next: { state, revision: event.revision, epoch: state.epoch }, decision };
}
