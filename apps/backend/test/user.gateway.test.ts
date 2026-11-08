import "reflect-metadata";
import { describe, expect, mock, test } from "bun:test";
import type { Socket } from "socket.io";
import type { Authenticator, Identity } from "../src/auth/authenticator";
import type { GuildDirectory } from "../src/guilds/guild-directory";
import type { Presence } from "../src/presence/presence";
import { UserGateway } from "../src/realtime/user.gateway";
import type { UserStore } from "../src/users/user-store";

const identity: Identity = { authUserId: "u", discordId: "500000000000000001", name: "Dee", avatarUrl: null };
const down = () => Promise.reject(new Error("supabase down"));

function gateway(overrides: { store?: Partial<UserStore>; presence?: Partial<Presence> }) {
  const store = { guildsOf: mock(async () => []), ...overrides.store } as unknown as UserStore;
  const directory = { mutual: mock(async () => []) } as unknown as GuildDirectory;
  const presence = {
    open: mock(async () => {}),
    close: mock(async () => {}),
    ...overrides.presence,
  } as unknown as Presence;
  return new UserGateway(
    {} as Authenticator,
    store,
    directory,
    presence,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
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
