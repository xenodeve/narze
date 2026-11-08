import {
  Channels,
  type GuildEvent,
  GuildEventSchema,
  GuildEventTypes,
  PlayerStateSchema,
  PlayerSummarySchema,
  parseJson,
  SocketEvents,
} from "@narze/shared";
import { Inject, Logger, type OnModuleInit } from "@nestjs/common";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type Redis from "ioredis";
import type { Server, Socket } from "socket.io";
import { Authenticator, type Identity } from "../auth/authenticator";
import { GuildDirectory, summarize } from "../guilds/guild-directory";
import { PlayerCache } from "../player/player-cache";
import { Presence } from "../presence/presence";
import { REDIS_SUBSCRIBER } from "../tokens";
import { type StoredGuild, UserStore } from "../users/user-store";

interface SessionData {
  identity?: Identity;
  /** Mutual Guilds at connect time, keyed by id. */
  guilds?: Map<string, StoredGuild>;
}

const guildRoom = (guildId: string) => `guild:${guildId}`;

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
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.presence.reset();
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel === Channels.guildEvents) this.onGuildEvent(message).catch(report("guild event"));
    });
    await this.subscriber.subscribe(Channels.guildEvents);
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
    if (event.type !== GuildEventTypes.playerSummary) return;
    const player = PlayerSummarySchema.safeParse(event.data);
    if (!player.success) return;
    const listeners = (await this.server.in(guildRoom(event.guildId)).fetchSockets()).flatMap((socket) => {
      const { identity, guilds } = socket.data as SessionData;
      const guild = guilds?.get(event.guildId);
      return identity && guild ? [{ socket, discordId: identity.discordId, guild }] : [];
    });
    const [voices, memberCount] = await Promise.all([
      this.directory.voiceChannels(event.guildId, [...new Set(listeners.map((l) => l.discordId))]),
      this.directory.memberCount(event.guildId),
    ]);
    for (const { socket, discordId, guild } of listeners) {
      const userVoice = voices.get(discordId) ?? null;
      socket.emit(SocketEvents.guildSummary, summarize(guild, { player: player.data, userVoice, memberCount }));
    }
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
}
