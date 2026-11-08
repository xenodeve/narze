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
import { Authenticator, type Identity } from "../auth/authenticator";
import { Presence } from "../presence/presence";
import { userRoom } from "../realtime/user.gateway";
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
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(Presence) private readonly presence: Presence,
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
    // Spec #114: the users page's "on Dashboard" dots follow tabs opening and closing.
    this.presence.onChange(() => {
      if (!this.server.sockets.adapter.rooms.get(STATS_ROOM)?.size) return;
      void this.presence
        .online()
        .then((online) => this.server.to(STATS_ROOM).emit(SocketEvents.adminPresence, { online }))
        .catch((error: Error) => this.logger.warn(`admin presence: ${error.message}`));
    });
  }

  /** A user taken off the whitelist leaves both rooms on every open tab at once (security review). */
  revoke(discordId: string): void {
    this.server.in(userRoom(discordId)).socketsLeave([STATS_ROOM, LOGS_ROOM]);
  }

  /**
   * Joins the admin rooms. Like a playback command (ADR-0005), the tab sends its current token and
   * it is verified now, so a signed-out session cannot start watching the Bot's console.
   */
  @SubscribeMessage(SocketEvents.adminSubscribe)
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const identity = (client.data as { identity?: Identity }).identity;
    const request = (body ?? {}) as { logs?: unknown; token?: unknown };
    const logs = request.logs !== false;
    try {
      const actor = typeof request.token === "string" ? await this.auth.verify(request.token) : null;
      if (!identity || actor?.discordId !== identity.discordId) return { ok: false };
      if (!(await this.isAdmin(identity.discordId))) return { ok: false };
      await client.join(logs ? [STATS_ROOM, LOGS_ROOM] : STATS_ROOM);
      if (!logs) await client.leave(LOGS_ROOM);
      // Checked again after joining: a removal that landed in between (and its revoke) must win.
      if (!(await this.isAdmin(identity.discordId))) {
        this.leave(client);
        return { ok: false };
      }
      if (!logs) return { ok: true, history: [] };
      // Join first, then read: a line written in between arrives live (at worst twice), never lost.
      return { ok: true, history: await readRing(this.redis, RedisKeys.botLogRing, LogLineSchema, LOG_HISTORY) };
    } catch (error) {
      this.logger.warn(`admin subscribe: ${error instanceof Error ? error.message : error}`);
      this.leave(client);
      return { ok: false };
    }
  }

  /** The tab left the admin pages: no more stats or console lines. */
  @SubscribeMessage(SocketEvents.adminUnsubscribe)
  unsubscribe(@ConnectedSocket() client: Socket) {
    this.leave(client);
    return { ok: true };
  }

  private leave(client: Socket): void {
    void client.leave(STATS_ROOM);
    void client.leave(LOGS_ROOM);
  }

  private async isAdmin(discordId: string): Promise<boolean> {
    return isAtLeast(await this.roles.roleOf(discordId), "admin");
  }
}
