import {
  type BotHeartbeat,
  BotHeartbeatSchema,
  type BotStatus,
  type BotStatusPayload,
  botStatusAt,
  HEARTBEAT_TTL_MS,
  parseJson,
} from "@narze/shared";

type Listener = (payload: BotStatusPayload) => void;

/** Turns raw heartbeat messages into an online/offline status and reports changes. */
export class BotStatusTracker {
  private last: BotHeartbeat | null = null;
  /** When the last valid heartbeat arrived, on this process's clock. */
  private lastReceivedAt: number | null = null;
  private status: BotStatus = "offline";
  private readonly listeners = new Set<Listener>();

  constructor(private readonly now: () => number = Date.now) {}

  receive(raw: string): void {
    const beat = parseJson(BotHeartbeatSchema, raw);
    if (!beat) return;
    this.last = beat;
    this.lastReceivedAt = this.now();
    this.tick();
  }

  /** Milliseconds until the current heartbeat expires, or null when there is none to wait for. */
  msUntilExpiry(): number | null {
    return this.lastReceivedAt === null ? null : Math.max(0, this.lastReceivedAt + HEARTBEAT_TTL_MS - this.now());
  }

  /** Re-evaluates the status against the clock; a silent Bot goes offline on the tick after expiry. */
  tick(): void {
    const next = botStatusAt(this.lastReceivedAt, this.now());
    if (next === this.status) return;
    this.status = next;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): BotStatusPayload {
    return { status: this.status, heartbeat: this.last };
  }
}
