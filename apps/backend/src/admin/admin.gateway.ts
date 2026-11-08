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
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type Redis from "ioredis";
import type { Server, Socket } from "socket.io";
import type { Identity } from "../auth/authenticator";
import { REDIS, REDIS_SUBSCRIBER } from "../tokens";
import { AdminRoles } from "./admin-roles";
import { readRing } from "./ring";

/** Stats go to every admin tab; console lines only to tabs that asked for them (the log page). */
const STATS_ROOM = "admin:stats";
const LOGS_ROOM = "admin:logs";

/**
 * The admin rooms (#110, spec #120): a tab on the whitelist that asks joins the stats room and, unless
 * it asks for `{ logs: false }`, the log room, getting the last LOG_HISTORY console lines first.
 * Anyone else is refused and joins nothing. Identity is the one verified at the handshake (UserGateway).
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
        if (line) this.server.to(LOGS_ROOM).emit(SocketEvents.adminLog, line);
      }
      if (channel === Channels.botStats) {
        const sample = parseJson(AdminStatsSchema, message);
        if (sample) this.server.to(STATS_ROOM).emit(SocketEvents.adminStats, sample);
      }
    });
    await this.subscriber.subscribe(Channels.botLogs, Channels.botStats);
  }

  @SubscribeMessage(SocketEvents.adminSubscribe)
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const identity = (client.data as { identity?: Identity }).identity;
    const logs = (body as { logs?: unknown } | null)?.logs !== false;
    try {
      const role = identity ? await this.roles.roleOf(identity.discordId) : null;
      if (!isAtLeast(role, "admin")) return { ok: false };
      await client.join(STATS_ROOM);
      if (!logs) return { ok: true, history: [] };
      // Join first, then read: a line written in between arrives live (at worst twice), never lost.
      await client.join(LOGS_ROOM);
      return { ok: true, history: await readRing(this.redis, RedisKeys.botLogRing, LogLineSchema, LOG_HISTORY) };
    } catch (error) {
      this.logger.warn(`admin subscribe: ${error instanceof Error ? error.message : error}`);
      return { ok: false };
    }
  }
}
