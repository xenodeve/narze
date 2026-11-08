import { randomUUID } from "node:crypto";
import {
  AdminGuildSchema,
  type AdminQueryRequest,
  AdminQueryResultSchema,
  Channels,
  MessagePageSchema,
  parseJson,
  TextChannelEntrySchema,
} from "@narze/shared";
import { createTtlCache, type TtlCache } from "@narze/shared/ttl-cache";
import {
  BadGatewayException,
  ForbiddenException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import type Redis from "ioredis";
import type { z } from "zod";
import { ADMIN_QUERY_TIMEOUT_MS, REDIS, REDIS_SUBSCRIBER } from "../tokens";

/** How long a read from Discord is reused: a refresh never reaches Discord twice (#111 AC2). */
const CHANNELS_TTL_MS = 60_000;
const MESSAGES_TTL_MS = 30_000;
/** The guild list changes rarely; a short reuse spares the Bot a round trip per page view. */
const GUILDS_TTL_MS = 10_000;

/** The Bot's error words (apps/bot/src/admin/queries.ts) as HTTP answers; anything else is a 502. */
const failure = (error: string) =>
  error === "not-found"
    ? new NotFoundException(error)
    : error === "forbidden"
      ? new ForbiddenException("the Bot may not read this")
      : new BadGatewayException("the Bot could not answer");

/**
 * Asks the Bot about Discord for the admin pages (#111): only the Bot holds the Discord token
 * (ADR-0003). Answers are cached per guild/channel, and one read per key runs at a time — the
 * admin area's rate limit in front of Discord's.
 */
@Injectable()
export class AdminQueries implements OnModuleInit {
  private readonly pending = new Map<string, (result: z.infer<typeof AdminQueryResultSchema>) => void>();
  private readonly messagesCache = createTtlCache<string, unknown>({ ttlMs: MESSAGES_TTL_MS, max: 200 });
  private readonly channelsCache = createTtlCache<string, unknown>({ ttlMs: CHANNELS_TTL_MS, max: 200 });
  private readonly guildsCache = createTtlCache<string, unknown>({ ttlMs: GUILDS_TTL_MS, max: 200 });
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
    @Inject(ADMIN_QUERY_TIMEOUT_MS) private readonly timeoutMs: number,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber.on("message", (channel: string, raw: string) => {
      if (channel !== Channels.botAdminResults) return;
      const result = parseJson(AdminQueryResultSchema, raw);
      if (result) this.pending.get(result.id)?.(result);
    });
    await this.subscriber.subscribe(Channels.botAdminResults);
  }

  /** The Bot's answer to one query; 404 for "not-found", 504 when the Bot does not answer in time. */
  ask(query: AdminQueryRequest): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayTimeoutException("the Bot did not answer"));
      }, this.timeoutMs);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (result.ok) resolve(result.data);
        else reject(failure(result.error));
      });
      this.redis.publish(Channels.botAdminQueries, JSON.stringify({ ...query, id })).catch((error: Error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  guilds() {
    return this.cached(this.guildsCache, "guilds", async () =>
      AdminGuildSchema.array().parse(await this.ask({ kind: "guilds" })),
    );
  }

  guild(guildId: string) {
    return this.cached(this.guildsCache, `guild:${guildId}`, async () =>
      AdminGuildSchema.parse(await this.ask({ kind: "guild", guildId })),
    );
  }

  channels(guildId: string) {
    return this.cached(this.channelsCache, `channels:${guildId}`, async () =>
      TextChannelEntrySchema.array().parse(await this.ask({ kind: "channels", guildId })),
    );
  }

  messages(guildId: string, channelId: string) {
    return this.cached(this.messagesCache, `messages:${guildId}:${channelId}`, async () =>
      MessagePageSchema.parse(await this.ask({ kind: "messages", guildId, channelId })),
    );
  }

  private async cached<T>(cache: TtlCache<string, unknown>, key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit !== undefined) return hit as T;
    const running = this.inFlight.get(key);
    if (running) return running as Promise<T>;
    const loading = load()
      .then((value) => {
        cache.set(key, value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, loading);
    return loading;
  }
}
