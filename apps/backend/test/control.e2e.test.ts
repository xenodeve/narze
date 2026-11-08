import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFakeDiscord } from "@narze/fake-discord";
import {
  FAKE_DISCORD_PORT,
  type FakeSession,
  localSupabase,
  signInWithFakeDiscord,
} from "@narze/fake-discord/supabase-local";
import {
  Channels,
  type CommandResult,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type PlayerCommand,
  PlayerCommandSchema,
  type PlayerSummary,
  RedisKeys,
  SocketEvents,
  type VoiceChannelList,
} from "@narze/shared";
import type { INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../src/app";

const REDIS_URL = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(REDIS_URL);
const botSide = new Redis(REDIS_URL);
const GUILD = "922000000000000001";
const OTHER = "922000000000000002";
const owner = { id: "320000000000000001", username: "owner", globalName: "Owner" };
const member = { id: "320000000000000002", username: "member", globalName: "Member" };
const relayed: PlayerCommand[] = [];
/** What the fake Bot answers; tests change it. */
let answer: Omit<CommandResult, "id"> = { ok: true };

let discord: Awaited<ReturnType<typeof startFakeDiscord>>;
let app: INestApplication;
let url: string;
let ownerSession: FakeSession;
let memberSession: FakeSession;

const summary = (s: PlayerSummary) => redis.set(RedisKeys.playerSummary(GUILD), JSON.stringify(s));
const voiceUpdate = async (list: VoiceChannelList) => {
  await redis.set(RedisKeys.voiceChannels(GUILD), JSON.stringify(list));
  const event: GuildEvent = {
    type: GuildEventTypes.voiceUpdate,
    guildId: GUILD,
    revision: 0,
    sequence: 0,
    ts: Date.now(),
    data: list,
  };
  await redis.publish(Channels.guildEvents, JSON.stringify(event));
};

const tokens = new WeakMap<Socket, string>();

async function signedIn(session: FakeSession): Promise<Socket> {
  const socket = io(url, { transports: ["websocket"], auth: { token: session.access_token } });
  await new Promise((resolve) => socket.once(SocketEvents.sessionReady, resolve));
  tokens.set(socket, session.access_token);
  return socket;
}

/** Like the Dashboard: every command carries the tab's current access token (it refreshes hourly). */
const command = (socket: Socket, body: unknown, token = tokens.get(socket)) =>
  socket.timeout(6000).emitWithAck(SocketEvents.playerCommand, { guildId: GUILD, command: body, token }) as Promise<{
    ok: boolean;
    reason?: string;
    error?: string;
  }>;

beforeAll(async () => {
  const supabase = localSupabase();
  discord = await startFakeDiscord({ port: FAKE_DISCORD_PORT, hostname: "0.0.0.0" });
  app = await createApp({
    redisUrl: REDIS_URL,
    dashboardOrigin: "http://localhost:3000",
    supabase,
    discordApiUrl: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
  });
  await app.listen(0);
  url = await app.getUrl();
  await redis.sadd(RedisKeys.botGuilds, GUILD, OTHER);
  await redis.del(RedisKeys.playerSummary(GUILD), RedisKeys.voiceStates(GUILD), RedisKeys.voiceChannels(GUILD));
  // Plays the Bot: records relayed commands and answers each by id.
  await botSide.subscribe(Channels.botCommands);
  botSide.on("message", (_c, raw) => {
    const cmd = PlayerCommandSchema.parse(JSON.parse(raw));
    relayed.push(cmd);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: cmd.id, ...answer }));
  });
  for (const [user, isOwner] of [
    [owner, true],
    [member, false],
  ] as const) {
    const session = await signInWithFakeDiscord(supabase, user, [
      { id: GUILD, name: "Control", icon: null, owner: isOwner },
    ]);
    await fetch(`${url}/api/me/sync`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ providerToken: session.provider_token }),
    });
    if (isOwner) ownerSession = session;
    else memberSession = session;
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
  discord?.stop();
  await redis.srem(RedisKeys.botGuilds, GUILD, OTHER);
  await redis.del(RedisKeys.playerSummary(GUILD), RedisKeys.voiceStates(GUILD), RedisKeys.voiceChannels(GUILD));
  await botSide.quit();
  await redis.quit();
});

describe("Control Permission on the server (#101)", () => {
  test("a member outside the Bot's channel is refused with the reason, and nothing reaches the Bot", async () => {
    await summary({ playing: true, queueLength: 0, voiceChannelId: "80" });
    const socket = await signedIn(memberSession);
    const before = relayed.length;
    expect(await command(socket, { action: "pause" })).toEqual({ ok: false, reason: "not-in-voice" });
    await redis.hset(RedisKeys.voiceStates(GUILD), member.id, "81");
    expect(await command(socket, { action: "skip" })).toEqual({ ok: false, reason: "other-voice" });
    expect(relayed.length).toBe(before);
    socket.close();
  });

  test("the Server Owner is relayed as the acting user and gets the Bot's answer", async () => {
    const socket = await signedIn(ownerSession);
    answer = { ok: true };
    expect(await command(socket, { action: "volume", volume: 40 })).toEqual({ ok: true });
    expect(relayed.at(-1)).toMatchObject({
      guildId: GUILD,
      actor: { id: owner.id },
      command: { action: "volume", volume: 40 },
    });
    answer = { ok: false, error: "voice-channel-required" };
    expect(await command(socket, { action: "play", query: "x", next: false, voiceChannelId: null })).toEqual({
      ok: false,
      error: "voice-channel-required",
    });
    answer = { ok: true };
    socket.close();
  });

  test("an owner who handed the guild over loses owner rights on an open socket at once (#141)", async () => {
    // Signed in (and connected) as the owner; then the Bot sees the guild change hands.
    const socket = await signedIn(ownerSession);
    await redis.hdel(RedisKeys.voiceStates(GUILD), owner.id);
    try {
      await redis.hset(RedisKeys.botGuildOwners, GUILD, "300000000000000999");
      const before = relayed.length;
      // Out of voice and no longer the owner: refused like any member, nothing reaches the Bot.
      expect(await command(socket, { action: "volume", volume: 41 })).toMatchObject({ ok: false });
      expect(relayed.length).toBe(before);
      // The Bot says they own it again: the same socket controls again.
      await redis.hset(RedisKeys.botGuildOwners, GUILD, owner.id);
      answer = { ok: true };
      expect(await command(socket, { action: "volume", volume: 42 })).toEqual({ ok: true });
    } finally {
      await redis.hdel(RedisKeys.botGuildOwners, GUILD);
      socket.close();
    }
  });

  test("a malformed command or a guild outside the user's Mutual Guilds is refused", async () => {
    const socket = await signedIn(ownerSession);
    expect(await command(socket, { action: "volume", volume: 5000 })).toMatchObject({ ok: false, error: "invalid" });
    const other = (await socket.timeout(6000).emitWithAck(SocketEvents.playerCommand, {
      guildId: OTHER,
      command: { action: "pause" },
      token: ownerSession.access_token,
    })) as { ok: boolean };
    expect(other).toMatchObject({ ok: false, error: "forbidden" });
    socket.close();
  });

  test("an expired or wrong token is refused without dropping the socket; the fresh one works", async () => {
    const socket = await signedIn(ownerSession);
    expect(await command(socket, { action: "volume", volume: 30 }, "expired.jwt.token")).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(socket.connected).toBe(true);
    expect(await command(socket, { action: "volume", volume: 30 })).toEqual({ ok: true });
    expect(await command(socket, { action: "volume", volume: 30 }, memberSession.access_token)).toMatchObject({
      ok: false,
      error: "unauthorized",
    });
    socket.close();
  });

  test("with no Player, a member in voice may start playback in their own channel, and nothing else", async () => {
    await redis.del(RedisKeys.playerSummary(GUILD));
    await redis.hset(RedisKeys.voiceStates(GUILD), member.id, "81");
    const socket = await signedIn(memberSession);
    const before = relayed.length;
    expect(await command(socket, { action: "pause" })).toEqual({ ok: false, error: "no-player" });
    expect(await command(socket, { action: "play", query: "x", next: false, voiceChannelId: "82" })).toEqual({
      ok: false,
      reason: "own-voice-only",
    });
    expect(relayed.length).toBe(before);
    expect(await command(socket, { action: "play", query: "x", next: false, voiceChannelId: null })).toEqual({
      ok: true,
    });
    expect(relayed.at(-1)?.command).toMatchObject({ action: "play", voiceChannelId: "81" });
    socket.close();
  });

  test("joining the Bot's channel turns the controls on within 2 s (permission:update)", async () => {
    await summary({ playing: true, queueLength: 0, voiceChannelId: "80" });
    await redis.hdel(RedisKeys.voiceStates(GUILD), member.id);
    const socket = await signedIn(memberSession);
    const allowed = new Promise<{ canControl: boolean; reason: string }>((resolve) =>
      socket.on(SocketEvents.permissionUpdate, (p: { guildId: string; canControl: boolean; reason: string }) => {
        if (p.canControl) resolve(p);
      }),
    );
    await redis.hset(RedisKeys.voiceStates(GUILD), member.id, "80");
    await voiceUpdate([{ id: "80", name: "Lounge", members: [{ id: member.id, name: "Member", avatarUrl: null }] }]);
    expect(await Promise.race([allowed, Bun.sleep(2000).then(() => null)])).toMatchObject({
      canControl: true,
      reason: "in-bot-voice",
    });
    socket.close();
  });

  test("a change of hands reaches an open tab within 2 s (permission:update with the Bot's owner, #141)", async () => {
    await summary({ playing: true, queueLength: 0, voiceChannelId: "80" });
    await redis.hdel(RedisKeys.voiceStates(GUILD), owner.id);
    const socket = await signedIn(ownerSession);
    try {
      const demoted = new Promise<{ canControl: boolean; reason: string }>((resolve) =>
        socket.on(SocketEvents.permissionUpdate, (p: { guildId: string; canControl: boolean; reason: string }) => {
          if (p.guildId === GUILD && p.reason !== "server-owner") resolve(p);
        }),
      );
      // What the Bot does on guildUpdate: the hash, then the event.
      await redis.hset(RedisKeys.botGuildOwners, GUILD, "300000000000000999");
      await redis.publish(
        Channels.guildEvents,
        JSON.stringify({
          type: GuildEventTypes.ownerUpdate,
          guildId: GUILD,
          revision: 0,
          sequence: 0,
          ts: Date.now(),
          data: null,
        }),
      );
      expect(await Promise.race([demoted, Bun.sleep(2000).then(() => null)])).toMatchObject({
        canControl: false,
        reason: "not-in-voice",
      });
    } finally {
      await redis.hdel(RedisKeys.botGuildOwners, GUILD);
      socket.close();
    }
  });

  test("the Player read carries the caller's permission, and members read the voice channels", async () => {
    const auth = { headers: { authorization: `Bearer ${memberSession.access_token}` } };
    const player = (await (await fetch(`${url}/api/guilds/${GUILD}/player`, auth)).json()) as {
      permission: { canControl: boolean; reason: string };
    };
    expect(player.permission).toEqual({ canControl: true, reason: "in-bot-voice" });
    const channels = (await (
      await fetch(`${url}/api/guilds/${GUILD}/voice-channels`, auth)
    ).json()) as VoiceChannelList;
    expect(channels.map((c) => c.name)).toEqual(["Lounge"]);
    expect((await fetch(`${url}/api/guilds/${OTHER}/voice-channels`, auth)).status).toBe(403);
  });
});
