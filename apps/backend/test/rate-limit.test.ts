import { describe, expect, test } from "bun:test";
import { clientAddress, RateLimiter } from "../src/rate-limit";

describe("RateLimiter", () => {
  test("counts per key in a fixed window, then starts over", () => {
    let now = 0;
    const limiter = new RateLimiter({ max: 2, windowMs: 1000 }, () => now);
    expect(limiter.hit("a")).toEqual({ ok: true, retryAfterMs: 0 });
    expect(limiter.hit("a").ok).toBe(true);
    expect(limiter.hit("a")).toEqual({ ok: false, retryAfterMs: 1000 });
    expect(limiter.hit("b").ok).toBe(true);
    now = 400;
    expect(limiter.hit("a")).toEqual({ ok: false, retryAfterMs: 600 });
    now = 1000;
    expect(limiter.hit("a").ok).toBe(true);
  });

  test("forgets windows that ended, so the map does not grow without bound", () => {
    let now = 0;
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 }, () => now);
    for (let i = 0; i < 100; i++) limiter.hit(`k${i}`);
    now = 2000;
    limiter.hit("fresh");
    expect(limiter.size).toBe(1);
  });
});

describe("clientAddress (#142)", () => {
  test("X-Forwarded-For counts only from a trusted proxy, and only its last entry", () => {
    expect(clientAddress("127.0.0.1", "198.51.100.9", [])).toBe("198.51.100.9");
    expect(clientAddress("::1", "10.0.0.1, 198.51.100.9", [])).toBe("198.51.100.9");
    expect(clientAddress("::ffff:127.0.0.1", "198.51.100.9", [])).toBe("198.51.100.9");
    // A client that is not a proxy cannot pick its own address.
    expect(clientAddress("198.51.100.20", "1.2.3.4", [])).toBe("198.51.100.20");
    // A proxy on another address (cloudflared in Docker) is trusted only when named.
    expect(clientAddress("172.17.0.2", "198.51.100.9", [])).toBe("172.17.0.2");
    expect(clientAddress("172.17.0.2", "198.51.100.9", ["172.17.0.2"])).toBe("198.51.100.9");
    expect(clientAddress("::ffff:172.17.0.2", "198.51.100.9", ["172.17.0.2"])).toBe("198.51.100.9");
    // No header, or an empty last entry: the connection's own address.
    expect(clientAddress("127.0.0.1", undefined, [])).toBe("127.0.0.1");
    expect(clientAddress("127.0.0.1", "198.51.100.9, ", [])).toBe("127.0.0.1");
  });
});
