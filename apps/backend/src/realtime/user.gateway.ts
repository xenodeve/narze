import {
  Channels,
  type GuildEvent,
  GuildEventSchema,
  GuildEventTypes,
  PlayerActionSchema,
  PlayerStateSchema,
  type PlayerSummary,
  PlayerSummarySchema,
  parseJson,
  SocketEvents,
  VoiceChannelListSchema,
} from "@narze/shared";
import { Inject, Logger, type OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type Redis from "ioredis";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { Authenticator, type Identity } from "../auth/authenticator";
import { CommandRelay } from "../control/command-relay";
import { GuildDirectory, permissionOf, summarize } from "../guilds/guild-directory";
import { PlayerCache } from "../player/player-cache";
import { Presence } from "../presence/presence";
import { REDIS_SUBSCRIBER } from "../tokens";
import { type StoredGuild, UserStore } from "../users/user-store";

export interface SessionData {
  identity?: Identity;
  /** Mutual Guilds at connect time, keyed by id. */
  guilds?: Map<string, StoredGuild>;
}

const guildRoom = (guildId: string) => `guild:${guildId}`;

const ControlRequestSchema = z.object({ guildId: z.string().regex(/^\d+$/), command: PlayerActionSchema });

/** The ack of `player:command`: allowed and done, refused with a ladder reason, or failed with a code. */
export type ControlAck = { ok: true } | { ok: false; reason?: string; error?: string };

/**
 * Nest calls socket handlers without awaiting them, and on Bun an unhandled rejection exits the
 * process — so every async path here ends in this, never in a rejection.
 */
const logger = new Logger("UserGateway");
const report = (what: string) => (error: unknown) =>
  logger.warn(`${what}: ${error instanceof Error ? error.message : String(error)}`);

/**
 * Signed-in sockets: verified at handshake (`auth.token`), joined to a room per Mutual Guild, and
 * counted for Presence. A socket without a token stays anonymous and only receives Bot status.
 */
@WebSocketGateway()
export class UserGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() private server!: Server;

  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(UserStore) private readonly store: UserStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
    @Inject(Presence) private readonly presence: Presence,
    @Inject(PlayerCache) private readonly players: PlayerCache,
    @Inject(CommandRelay) private readonly relay: CommandRelay,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.presence.reset();
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel === Channels.guildEvents) this.onGuildEvent(message).catch(report("guild event"));
      if (channel === Channels.botCommandResults) this.relay.receive(message);
    });
    await this.subscriber.subscribe(Channels.guildEvents, Channels.botCommandResults);
  }

  /** Refuses a bad token during the handshake, so the client gets `connect_error` and no socket. */
  afterInit(server: Server): void {
    server.use((client, next) => {
      const token: unknown = client.handshake.auth?.token;
      if (token === undefined) return next();
      if (typeof token !== "string") return next(new Error("unauthorized"));
      this.auth.verify(token).then(
        (identity) => {
          if (!identity) return next(new Error("unauthorized"));
          (client.data as SessionData).identity = identity;
          next();
        },
        () => next(new Error("unauthorized")),
      );
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const { identity } = client.data as SessionData;
    if (!identity) return;
    try {
      await this.signIn(client, identity);
    } catch (error) {
      report("connect")(error);
      // A tab we could not set up is dropped; the client reconnects and tries again.
      client.disconnect(true);
    }
  }

  private async signIn(client: Socket, identity: Identity): Promise<void> {
    const data = client.data as SessionData;
    const guilds = await this.directory.mutual(await this.store.guildsOf(identity.discordId));
    // The tab may have closed while we were verifying; counting it now would leak a Presence tab.
    if (client.disconnected) return;
    data.guilds = new Map(guilds.map((g) => [g.id, g]));
    // Queue the open before any await, so a disconnect from here on queues its close after it.
    const opened = this.presence.open(identity.discordId);
    await client.join(guilds.map((g) => guildRoom(g.id)));
    await opened;
    client.emit(SocketEvents.sessionReady);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const { identity, guilds } = client.data as SessionData;
    // `guilds` is set only once the tab was counted, so a socket that left mid-connect is not uncounted.
    if (identity && guilds) await this.presence.close(identity.discordId).catch(report("disconnect"));
  }

  /** One HMGET for every listener's voice channel, then each tab gets its own user's summary. */
  private async onGuildEvent(message: string): Promise<void> {
    const event = parseJson(GuildEventSchema, message);
    if (!event) return;
    if (event.type === GuildEventTypes.playerState || event.type === GuildEventTypes.playerGone) {
      this.onPlayerEvent(event);
      return;
    }
    if (event.type === GuildEventTypes.voiceUpdate) {
      const list = VoiceChannelListSchema.safeParse(event.data);
      if (list.success)
        this.server
          .to(guildRoom(event.guildId))
          .emit(SocketEvents.voiceChannels, { guildId: event.guildId, channels: list.data });
      await this.pushPermissions(event.guildId);
      return;
    }
    if (event.type !== GuildEventTypes.playerSummary) return;
    const player = PlayerSummarySchema.safeParse(event.data);
    if (!player.success) return;
    const listeners = (await this.server.in(guildRoom(event.guildId)).fetchSockets()).flatMap((socket) => {
      const { identity, guilds } = socket.data as SessionData;
      const guild = guilds?.get(event.guildId);
      return identity && guild ? [{ socket, discordId: identity.discordId, guild }] : [];
    });
    const [voices, memberCount] = await Promise.all([
      this.directory.userVoices(event.guildId, [...new Set(listeners.map((l) => l.discordId))]),
      this.directory.memberCount(event.guildId),
    ]);
    for (const { socket, discordId, guild } of listeners) {
      const userVoice = voices.get(discordId) ?? null;
      socket.emit(SocketEvents.guildSummary, summarize(guild, { player: player.data, userVoice, memberCount }));
    }
    await this.pushPermissions(event.guildId, player.data);
  }

  /** Keeps the Hot Cache current and relays the event as-is to the Guild's room (ADR-0006, ADR-0007). */
  private onPlayerEvent(event: GuildEvent): void {
    if (event.type === GuildEventTypes.playerGone) {
      this.players.clear(event.guildId);
    } else {
      const state = PlayerStateSchema.safeParse(event.data);
      // An event the cache rejected as stale is not relayed either.
      if (!state.success || state.data.guildId !== event.guildId || !this.players.apply(state.data)) return;
    }
    this.server.to(guildRoom(event.guildId)).emit(SocketEvents.playerEvent, event);
  }

  /**
   * Re-sends every tab in the Guild its Control Permission (#101): after a voice change or a Player
   * change, so controls turn on or off without a reload. One read for the Player, one HMGET for voices.
   */
  private async pushPermissions(guildId: string, known?: PlayerSummary | null): Promise<void> {
    const sockets = (await this.server.in(guildRoom(guildId)).fetchSockets()).flatMap((socket) => {
      const { identity, guilds } = socket.data as SessionData;
      const guild = guilds?.get(guildId);
      return identity && guild ? [{ socket, discordId: identity.discordId, guild }] : [];
    });
    if (sockets.length === 0) return;
    const [player, voices] = await Promise.all([
      known === undefined ? this.directory.playerSummary(guildId) : known,
      this.directory.userVoices(guildId, [...new Set(sockets.map((s) => s.discordId))]),
    ]);
    for (const { socket, discordId, guild } of sockets) {
      const { canControl, reason } = permissionOf(guild, player, voices.get(discordId) ?? null);
      socket.emit(SocketEvents.permissionUpdate, { guildId, canControl, reason });
    }
  }

  /** A playback action from a tab (#101). Fails closed: any doubt or error refuses. */
  @SubscribeMessage(SocketEvents.playerCommand)
  async onPlayerCommand(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<ControlAck> {
    try {
      return await this.control(client, body);
    } catch (error) {
      report("player command")(error);
      return { ok: false, error: "failed" };
    }
  }

  private async control(client: Socket, body: unknown): Promise<ControlAck> {
    const { identity, guilds } = client.data as SessionData;
    if (!identity || !guilds) return { ok: false, error: "unauthorized" };
    const request = ControlRequestSchema.safeParse(body);
    if (!request.success) return { ok: false, error: "invalid" };
    const guild = guilds.get(request.data.guildId);
    if (!guild) return { ok: false, error: "forbidden" };
    // The socket was verified at its handshake; a command re-verifies so a signed-out token cannot act (ADR-0005).
    const token: unknown = client.handshake.auth?.token;
    const still = typeof token === "string" ? await this.auth.verify(token) : null;
    if (still?.discordId !== identity.discordId) {
      client.disconnect(true);
      return { ok: false, error: "unauthorized" };
    }
    const permission = await this.directory.permission(identity.discordId, guild);
    if (!permission.canControl) return { ok: false, reason: permission.reason };
    let command = request.data.command;
    if (command.action === "play") {
      const owner = permission.reason === "server-owner" || permission.reason === "bot-owner";
      // Only an owner may send the Bot to a channel they are not in (spec #86); others play where they are.
      if (!owner && command.voiceChannelId !== null && command.voiceChannelId !== permission.userVoice) {
        return { ok: false, reason: "other-voice" };
      }
      command = { ...command, voiceChannelId: command.voiceChannelId ?? permission.userVoice };
    }
    const result = await this.relay.send({
      id: crypto.randomUUID(),
      guildId: guild.id,
      actor: { id: identity.discordId, name: identity.name, avatarUrl: identity.avatarUrl },
      command,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? "failed" };
  }
}
