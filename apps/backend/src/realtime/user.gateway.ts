import {
  Channels,
  type ControlAck,
  ControlRequestSchema,
  type GuildEvent,
  GuildEventSchema,
  GuildEventTypes,
  type GuildSettings,
  ListeningSessionSchema,
  PlayerStateSchema,
  PlayerSummarySchema,
  parseJson,
  SocketEvents,
  VOICE_EVENT_TYPES,
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
import { Authenticator, type Identity } from "../auth/authenticator";
import { CommandRelay } from "../control/command-relay";
import { GuildDirectory, permissionOf, summarize } from "../guilds/guild-directory";
import { PlayerCache } from "../player/player-cache";
import { Presence } from "../presence/presence";
import { SettingsStore } from "../settings/settings-store";
import { REDIS_SUBSCRIBER } from "../tokens";
import { type StoredGuild, UserStore } from "../users/user-store";

interface SessionData {
  identity?: Identity;
  /** Mutual Guilds at connect time, keyed by id. */
  guilds?: Map<string, StoredGuild>;
}

const guildRoom = (guildId: string) => `guild:${guildId}`;
/** One room per signed-in user: their Library changes reach their other tabs (#107). */
const userRoom = (discordId: string) => `user:${discordId}`;

/**
 * Nest calls socket handlers without awaiting them, and on Bun an unhandled rejection exits the
 * process — so every async path here ends in this, never in a rejection.
 */
const logger = new Logger("UserGateway");
const report = (what: string) => (error: unknown) =>
  logger.warn(`${what}: ${error instanceof Error ? error.message : String(error)}`);

/**
 * Events the Dashboard only draws, so they are relayed but never cached: the queue jump animation
 * (spec #39) and a voice drop with its recovery (spec #28).
 */
const DRAWN_ONLY = new Set<string>([GuildEventTypes.queueJump, ...VOICE_EVENT_TYPES]);

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
    @Inject(SettingsStore) private readonly settings: SettingsStore,
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
    await client.join([...guilds.map((g) => guildRoom(g.id)), userRoom(identity.discordId)]);
    await opened;
    client.emit(SocketEvents.sessionReady);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const { identity, guilds } = client.data as SessionData;
    // `guilds` is set only once the tab was counted, so a socket that left mid-connect is not uncounted.
    if (identity && guilds) await this.presence.close(identity.discordId).catch(report("disconnect"));
  }

  /** #107: a playlist (or the likes, as LIKED_PLAYLIST) changed; the user's other tabs refetch. */
  pushLibrary(discordId: string, playlistId: string): void {
    this.server.to(userRoom(discordId)).emit(SocketEvents.libraryUpdate, { playlistId });
  }

  /** Spec #92: a Guild's settings changed; its open tabs update, and permissions may have moved. */
  pushSettings(guildId: string, settings: GuildSettings): void {
    this.server.to(guildRoom(guildId)).emit(SocketEvents.settingsUpdate, { guildId, settings });
    void this.pushPermissions(guildId).catch(report("push permissions"));
  }

  /** One HMGET for every listener's voice channel, then each tab gets its own user's summary. */
  private async onGuildEvent(message: string): Promise<void> {
    const event = parseJson(GuildEventSchema, message);
    if (!event) return;
    if (event.type === GuildEventTypes.playerState || event.type === GuildEventTypes.playerGone) {
      this.onPlayerEvent(event);
      return;
    }
    if (DRAWN_ONLY.has(event.type)) {
      this.server.to(guildRoom(event.guildId)).emit(SocketEvents.playerEvent, event);
      return;
    }
    // #108, spec #42: a session goes to its participants' own tabs, never to the Guild's room.
    if (event.type === GuildEventTypes.sessionUpdate || event.type === GuildEventTypes.sessionEnd) {
      const session = ListeningSessionSchema.safeParse(event.data);
      if (!session.success || session.data.participants.length === 0) return;
      const name = event.type === GuildEventTypes.sessionEnd ? SocketEvents.sessionEnd : SocketEvents.sessionUpdate;
      this.server.to(session.data.participants.map((p) => userRoom(p.id))).emit(name, session.data);
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
    const listeners = await this.listeners(event.guildId);
    const [voices, memberCount, settings] = await Promise.all([
      this.directory.userVoices(event.guildId, [...new Set(listeners.map((l) => l.discordId))]),
      this.directory.memberCount(event.guildId),
      this.settings.cached(event.guildId),
    ]);
    // One pass: a Player change moves both the row summary and who may control it.
    for (const { socket, discordId, guild } of listeners) {
      const userVoice = voices.get(discordId) ?? null;
      // Bot Owner and outfit travel with every push (#106): a push without them would undo them.
      const isBotOwner = settings?.ownerId === discordId;
      socket.emit(
        SocketEvents.guildSummary,
        summarize(guild, { player: player.data, userVoice, memberCount }, { isBotOwner, avatar: settings?.avatar }),
      );
      const { canControl, reason } = permissionOf(guild, player.data, userVoice, isBotOwner);
      socket.emit(SocketEvents.permissionUpdate, { guildId: event.guildId, canControl, reason });
    }
  }

  /** The signed-in tabs in a Guild's room, with who they are and their stored guild. */
  private async listeners(guildId: string) {
    return (await this.server.in(guildRoom(guildId)).fetchSockets()).flatMap((socket) => {
      const { identity, guilds } = socket.data as SessionData;
      const guild = guilds?.get(guildId);
      return identity && guild ? [{ socket, discordId: identity.discordId, guild }] : [];
    });
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
  private async pushPermissions(guildId: string): Promise<void> {
    const sockets = await this.listeners(guildId);
    if (sockets.length === 0) return;
    const [player, voices, settings] = await Promise.all([
      this.directory.playerSummary(guildId),
      this.directory.userVoices(guildId, [...new Set(sockets.map((s) => s.discordId))]),
      this.settings.cached(guildId),
    ]);
    for (const { socket, discordId, guild } of sockets) {
      const isBotOwner = settings?.ownerId === discordId;
      const { canControl, reason } = permissionOf(guild, player, voices.get(discordId) ?? null, isBotOwner);
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
    // Every command re-verifies the tab's current token, so a signed-out session cannot act (ADR-0005).
    // An expired token is refused but keeps the socket: the tab refreshes and retries. Another user's
    // token on this socket is not a refresh, and closes it.
    const actor = await this.auth.verify(request.data.token);
    if (!actor) return { ok: false, error: "unauthorized" };
    if (actor.discordId !== identity.discordId) {
      // Close after the ack is on its way, so the tab still learns why.
      setImmediate(() => client.disconnect(true));
      return { ok: false, error: "unauthorized" };
    }
    const permission = await this.directory.permission(identity.discordId, guild);
    if (!permission.canControl) return { ok: false, reason: permission.reason };
    let command = request.data.command;
    const owner = permission.reason === "server-owner" || permission.reason === "bot-owner";
    if (command.action === "play") {
      // Only an owner may send the Bot to a channel they are not in (spec #86); others start where they are.
      if (!owner && command.voiceChannelId !== null && command.voiceChannelId !== permission.userVoice) {
        return { ok: false, reason: "own-voice-only" };
      }
      // A non-owner's play always names their channel, so the Bot can refuse it if a Player appeared elsewhere.
      command = { ...command, voiceChannelId: owner ? command.voiceChannelId : permission.userVoice };
    } else if (permission.reason === "in-voice") {
      // "No Player, member in voice" allows starting playback, not controlling a Player that is not there.
      return { ok: false, error: "no-player" };
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
