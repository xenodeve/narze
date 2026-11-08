import { Channels, SocketEvents } from "@narze/shared";
import { Inject, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type Redis from "ioredis";
import type { Server, Socket } from "socket.io";
import { REDIS_SUBSCRIBER } from "../tokens";
import { BotStatusTracker } from "./bot-status.tracker";

/** Margin past expiry before re-checking, so the TTL comparison has certainly lapsed. */
const EXPIRY_MARGIN_MS = 5;

// CORS for this server is configured once in createApp (CorsIoAdapter), not per gateway.
@WebSocketGateway()
export class StatusGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() private server!: Server;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    @Inject(BotStatusTracker) private readonly tracker: BotStatusTracker,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.tracker.onChange((snapshot) => this.server.emit(SocketEvents.botStatus, snapshot));
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel !== Channels.botHeartbeat) return;
      this.tracker.receive(message);
      this.armExpiry();
    });
    await this.subscriber.subscribe(Channels.botHeartbeat);
  }

  handleConnection(client: Socket): void {
    client.emit(SocketEvents.botStatus, this.tracker.snapshot());
  }

  async onModuleDestroy(): Promise<void> {
    clearTimeout(this.expiryTimer);
    await this.subscriber.quit();
  }

  /** One timer per heartbeat instead of a forever-running interval: wakes only when a Bot can go silent. */
  private armExpiry(): void {
    clearTimeout(this.expiryTimer);
    const ms = this.tracker.msUntilExpiry();
    if (ms === null) return;
    this.expiryTimer = setTimeout(() => this.tracker.tick(), ms + EXPIRY_MARGIN_MS);
  }
}
