import {
  type BotHeartbeat,
  BotHeartbeatSchema,
  type BotStatus,
  type BotStatusPayload,
  botStatusAt,
  HEARTBEAT_TTL_MS,
} from "@narze/shared";

type Listener = (payload: BotStatusPayload) => void;

/** Turns raw heartbeat messages into an online/offline status and reports changes. */
export class BotStatusTracker {
  private last: BotHeartbeat | null = null;
  private status: BotStatus = "offline";
  private readonly listeners = new Set<Listener>();

  constructor(private readonly now: () => number = Date.now) {}

  receive(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const result = BotHeartbeatSchema.safeParse(parsed);
    if (!result.success) return;
    this.last = result.data;
    this.tick();
  }

  /** Milliseconds until the current heartbeat expires, or null when there is none to wait for. */
  msUntilExpiry(): number | null {
    return this.last ? Math.max(0, this.last.at + HEARTBEAT_TTL_MS - this.now()) : null;
  }

  /** Re-evaluates the status against the clock; a silent Bot goes offline on the tick after expiry. */
  tick(): void {
    const next = botStatusAt(this.last, this.now());
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
