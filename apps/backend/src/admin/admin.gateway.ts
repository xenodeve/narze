import {
  AdminStatsSchema,
  Channels,
  isAtLeast,
  LOG_HISTORY,
  LogLineSchema,
  parseJson,
  RedisKeys,
  SocketEvents,
} from "@narze/shared";
import { Inject, Logger, type OnModuleInit } from "@nestjs/common";
import { ConnectedSocket, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type Redis from "ioredis";
import type { Server, Socket } from "socket.io";
import type { Identity } from "../auth/authenticator";
import { REDIS, REDIS_SUBSCRIBER } from "../tokens";
import { AdminRoles } from "./admin-roles";

const ADMIN_ROOM = "admin";

/**
 * The admin room (#110, spec #120): a tab that asks and is on the whitelist joins it, gets the last
 * LOG_HISTORY console lines, then every live line and stats sample. Anyone else is refused and joins
 * nothing. Identity is the one verified at the handshake (UserGateway).
 */
@WebSocketGateway()
export class AdminGateway implements OnModuleInit {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger("AdminGateway");

  constructor(
    @Inject(AdminRoles) private readonly roles: AdminRoles,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel === Channels.botLogs) {
        const line = parseJson(LogLineSchema, message);
        if (line) this.server.to(ADMIN_ROOM).emit(SocketEvents.adminLog, line);
      }
      if (channel === Channels.botStats) {
        const sample = parseJson(AdminStatsSchema, message);
        if (sample) this.server.to(ADMIN_ROOM).emit(SocketEvents.adminStats, sample);
      }
    });
    await this.subscriber.subscribe(Channels.botLogs, Channels.botStats);
  }

  @SubscribeMessage(SocketEvents.adminSubscribe)
  async subscribe(@ConnectedSocket() client: Socket) {
    const identity = (client.data as { identity?: Identity }).identity;
    try {
      const role = identity ? await this.roles.roleOf(identity.discordId) : null;
      if (!isAtLeast(role, "admin")) return { ok: false };
      // Join first, then read: a line written in between arrives live (at worst twice), never lost.
      await client.join(ADMIN_ROOM);
      const raw = await this.redis.lrange(RedisKeys.botLogRing, 0, LOG_HISTORY - 1);
      const history = raw.flatMap((line) => {
        const parsed = parseJson(LogLineSchema, line);
        return parsed ? [parsed] : [];
      });
      return { ok: true, history: history.reverse() };
    } catch (error) {
      this.logger.warn(`admin subscribe: ${error instanceof Error ? error.message : error}`);
      return { ok: false };
    }
  }
}
