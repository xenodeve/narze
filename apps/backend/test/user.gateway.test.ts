import "reflect-metadata";
import { describe, expect, mock, test } from "bun:test";
import { SocketEvents } from "@narze/shared";
import type { Socket } from "socket.io";
import { type Authenticator, expiryOf, type Identity } from "../src/auth/authenticator";
import type { GuildDirectory } from "../src/guilds/guild-directory";
import type { Presence } from "../src/presence/presence";
import { DEFAULT_RATE_LIMITS } from "../src/rate-limit";
import { UserGateway } from "../src/realtime/user.gateway";
import type { UserStore } from "../src/users/user-store";

const identity: Identity = { authUserId: "u", discordId: "500000000000000001", name: "Dee", avatarUrl: null };
const down = () => Promise.reject(new Error("supabase down"));

function gateway(overrides: {
  store?: Partial<UserStore>;
  presence?: Partial<Presence>;
  auth?: Partial<Authenticator>;
}) {
  const store = { guildsOf: mock(async () => []), ...overrides.store } as unknown as UserStore;
  const directory = { mutual: mock(async () => []) } as unknown as GuildDirectory;
  const presence = {
    open: mock(async () => {}),
    close: mock(async () => {}),
    ...overrides.presence,
  } as unknown as Presence;
  return new UserGateway(
    (overrides.auth ?? {}) as Authenticator,
    store,
    directory,
    presence,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    DEFAULT_RATE_LIMITS,
  );
}

function client(data: Record<string, unknown>) {
  return {
    data,
    disconnected: false,
    join: mock(async () => {}),
    emit: mock(() => true),
    disconnect: mock(() => {}),
  } as unknown as Socket & { disconnect: ReturnType<typeof mock> };
}

// Nest calls socket handlers without awaiting them, and on Bun an unhandled rejection exits the
// process — so a handler must never reject, whatever Supabase or Redis does.
describe("signed-in socket handlers survive a failing dependency", () => {
  test("a failing guild read on connect drops that socket instead of rejecting", async () => {
    const socket = client({ identity });
    await expect(gateway({ store: { guildsOf: down } }).handleConnection(socket)).resolves.toBeUndefined();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  test("a failing Presence write on disconnect does not reject", async () => {
    const socket = client({ identity, guilds: new Map() });
    await expect(gateway({ presence: { close: down } }).handleDisconnect(socket)).resolves.toBeUndefined();
  });
});

// #142: the token is checked only at the handshake, so a socket must not outlive it. At its exp the
// Backend asks the tab for the token it refreshed meanwhile; no fresh token, no socket.
describe("a signed-in socket ends with its token", () => {
  const expiring = (fresh: string | null | "no answer") => {
    const socket = client({ identity, expiresAt: Date.now() + 50 });
    const ask = mock(async () => {
      if (fresh === "no answer") throw new Error("operation has timed out");
      return fresh;
    });
    (socket as unknown as { timeout: () => unknown }).timeout = () => ({ emitWithAck: ask });
    return { socket, ask };
  };
  const later = (ms: number) => Math.floor((Date.now() + ms) / 1000);
  const token = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;

  test("at exp, a fresh token for the same user keeps the socket and sets the next check", async () => {
    const exp = later(3_600_000);
    const fresh = token(exp);
    const { socket, ask } = expiring(fresh);
    const verify = mock(async () => identity);
    await gateway({ auth: { verify } }).handleConnection(socket);
    await Bun.sleep(120);
    expect(ask).toHaveBeenCalledWith(SocketEvents.sessionToken);
    expect(verify).toHaveBeenCalledWith(fresh);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect((socket.data as { expiresAt: number }).expiresAt).toBe(exp * 1000);
    clearTimeout((socket.data as { expiry: ReturnType<typeof setTimeout> }).expiry);
  });

  test("a socket that closes while the tab is being asked is left alone", async () => {
    const { socket } = expiring(token(later(3_600_000)));
    const verify = mock(async () => {
      (socket as unknown as { disconnected: boolean }).disconnected = true;
      return identity;
    });
    await gateway({ auth: { verify } }).handleConnection(socket);
    await Bun.sleep(120);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect((socket.data as { expiresAt: number }).expiresAt).toBeLessThan(Date.now());
  });

  test("no fresh token, a refused one, another user's, or no answer: the socket is closed", async () => {
    const other = { ...identity, discordId: "500000000000000002" };
    for (const [fresh, verified] of [
      [null, identity],
      [token(later(60_000)), null],
      [token(later(60_000)), other],
      [token(later(-1_000)), identity],
      ["h.e30.s", identity],
      ["no answer", identity],
    ] as const) {
      const { socket } = expiring(fresh);
      await gateway({ auth: { verify: mock(async () => verified) } }).handleConnection(socket);
      await Bun.sleep(120);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    }
  });

  test("a socket that closed first leaves no timer behind", async () => {
    const { socket, ask } = expiring(null);
    const g = gateway({});
    await g.handleConnection(socket);
    await g.handleDisconnect(socket);
    await Bun.sleep(120);
    expect(ask).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe("expiryOf (#142)", () => {
  const jwt = (payload: unknown) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
  test("reads exp, in ms", () => {
    expect(expiryOf(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });
  test("a token without a readable exp has none", () => {
    expect(expiryOf(jwt({ sub: "x" }))).toBeNull();
    expect(expiryOf("not-a-jwt")).toBeNull();
  });
});
