import { Channels, GuildEventSchema, GuildEventTypes, PlayerSummarySchema, SocketEvents } from "@narze/shared";
import { Inject, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
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
import { GuildDirectory } from "../guilds/guild-directory";
import { Presence } from "../presence/presence";
import { REDIS, REDIS_SUBSCRIBER } from "../tokens";
import { type StoredGuild, UserStore } from "../users/user-store";

interface SessionData {
  identity?: Identity;
  /** Mutual Guilds at connect time, keyed by id. */
  guilds?: Map<string, StoredGuild>;
}

const guildRoom = (guildId: string) => `guild:${guildId}`;

/**
 * Signed-in sockets: verified at handshake (`auth.token`), joined to a room per Mutual Guild, and
 * counted for Presence. A socket without a token stays anonymous and only receives Bot status.
 */
@WebSocketGateway()
export class UserGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() private server!: Server;

  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(UserStore) private readonly store: UserStore,
    @Inject(GuildDirectory) private readonly directory: GuildDirectory,
    @Inject(Presence) private readonly presence: Presence,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.presence.reset();
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel === Channels.guildEvents) void this.onGuildEvent(message);
    });
    await this.subscriber.subscribe(Channels.guildEvents);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
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
    const data = client.data as SessionData;
    const { identity } = data;
    if (!identity) return;
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
    if (identity && guilds) await this.presence.close(identity.discordId);
  }

  private async onGuildEvent(message: string): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      return;
    }
    const event = GuildEventSchema.safeParse(raw);
    if (!event.success || event.data.type !== GuildEventTypes.playerSummary) return;
    const player = PlayerSummarySchema.safeParse(event.data.data);
    if (!player.success) return;
    const { guildId } = event.data;
    for (const socket of await this.server.in(guildRoom(guildId)).fetchSockets()) {
      const { identity, guilds } = socket.data as SessionData;
      const guild = guilds?.get(guildId);
      if (!identity || !guild) continue;
      socket.emit(SocketEvents.guildSummary, await this.directory.summary(identity.discordId, guild, player.data));
    }
  }
}
