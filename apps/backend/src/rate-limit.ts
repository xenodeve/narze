/** How many calls one key may make in one window. */
export interface Limit {
  max: number;
  windowMs: number;
}

/** The limits the Backend applies, and whose forwarded address it believes (#142); tests pass small limits. */
export interface RateLimits {
  /** REST calls per client address: each one runs `auth.getUser`. */
  api: Limit;
  /** Socket handshakes per client address: each one runs `auth.getUser`. */
  handshake: Limit;
  /** Playlist previews per user: one can read up to 50 Spotify pages. */
  import: Limit;
  /** Proxies besides this machine whose X-Forwarded-For is believed (TRUSTED_PROXIES). */
  trustedProxies: string[];
}

/**
 * A fixed-window counter per key. In-process: it assumes one Backend, as Presence already does
 * (ADR-0005); behind several Backends each counts its own share.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; endsAt: number }>();
  private nextSweep = 0;

  constructor(
    private readonly limit: Limit,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one call; `retryAfterMs` says how long a refused key waits. */
  hit(key: string): { ok: boolean; retryAfterMs: number } {
    const now = this.now();
    this.sweep(now);
    let window = this.windows.get(key);
    if (!window || now >= window.endsAt) {
      window = { count: 0, endsAt: now + this.limit.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window.count <= this.limit.max
      ? { ok: true, retryAfterMs: 0 }
      : { ok: false, retryAfterMs: window.endsAt - now };
  }

  /** Keys counted in a window that has not ended. */
  get size(): number {
    return this.windows.size;
  }

  /** Drops ended windows at most once per window length, so the map holds only live keys. */
  private sweep(now: number): void {
    if (now < this.nextSweep) return;
    this.nextSweep = now + this.limit.windowMs;
    for (const [key, window] of this.windows) if (now >= window.endsAt) this.windows.delete(key);
  }
}

/**
 * The client's address. X-Forwarded-For counts only when the connection comes from a trusted proxy —
 * this machine (cloudflared on the same host), or an address in `trusted` (a proxy in Docker or on
 * another host) — and then only its last entry, the one that proxy added; anything before it is
 * whatever the client sent. One proxy hop, unlike Express's trust walk.
 */
export function clientAddress(
  remote: string | undefined,
  forwarded: string | string[] | undefined,
  trusted: readonly string[],
): string {
  const direct = remote ?? "";
  const plain = direct.startsWith("::ffff:") ? direct.slice(7) : direct;
  const proxy = plain === "::1" || plain.startsWith("127.") || trusted.includes(plain);
  const header = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  const last = header?.split(",").at(-1)?.trim();
  return proxy && last ? last : direct;
}

/**
 * About five times the busiest key in a full `bun run e2e` (2026-11-09: 562 REST calls and 90
 * handshakes in one minute, all from one address). A person is far below this; a flood is not.
 */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  api: { max: 3000, windowMs: 60_000 },
  handshake: { max: 500, windowMs: 60_000 },
  import: { max: 10, windowMs: 60_000 },
  trustedProxies: [],
};
