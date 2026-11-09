import "reflect-metadata";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SOUNDCLOUD_PLAYABLE, type Sources } from "@narze/shared/sources";
import { createSpotifyApi } from "@narze/shared/spotify-api";
import { type DynamicModule, type INestApplication, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { AdminController } from "./admin/admin.controller";
import { AdminGateway } from "./admin/admin.gateway";
import { AdminGuard } from "./admin/admin.guard";
import { AdminQueries } from "./admin/admin-queries";
import { AdminRoles } from "./admin/admin-roles";
import { Authenticator } from "./auth/authenticator";
import { ChartService } from "./charts/chart-service";
import { ChartsController } from "./charts/charts.controller";
import { CommandRelay } from "./control/command-relay";
import { DiscordApi } from "./discord/discord-api";
import { GuildDirectory } from "./guilds/guild-directory";
import { HistoryController } from "./history/history.controller";
import { HistoryStore } from "./history/history-store";
import { IMPORTER, LibraryController } from "./library/library.controller";
import { createImporter } from "./library/library-importer";
import { LibraryStore } from "./library/library-store";
import { MeController } from "./me/me.controller";
import { PlayerController } from "./player/player.controller";
import { PlayerCache } from "./player/player-cache";
import { Presence } from "./presence/presence";
import { clientAddress, DEFAULT_RATE_LIMITS, RateLimiter, type RateLimits } from "./rate-limit";
import { UserGateway } from "./realtime/user.gateway";
import { createLavalinkRest } from "./search/lavalink-rest";
import { SearchController } from "./search/search.controller";
import { SearchService } from "./search/search-service";
import { createYouTubeChannels } from "./search/youtube-channels";
import { SettingsController } from "./settings/settings.controller";
import { SettingsStore } from "./settings/settings-store";
import { BotStatusTracker } from "./status/bot-status.tracker";
import { StatusGateway } from "./status/status.gateway";
import {
  ADMIN_QUERY_TIMEOUT_MS,
  DEVELOPER_IDS,
  DISCORD_API_URL,
  RATE_LIMITS,
  REDIS,
  REDIS_SUBSCRIBER,
  SOURCES,
  SUPABASE,
} from "./tokens";
import { UserStore } from "./users/user-store";

export interface AppOptions {
  redisUrl: string;
  /** The only browser origin allowed to call the REST API or open a socket (the Dashboard). */
  dashboardOrigin: string;
  /** Supabase project URL and its secret key (server only; bypasses RLS). */
  supabase: { url: string; secretKey: string };
  /** Discord REST base, e.g. https://discord.com/api/v10 (the fake Discord in tests). */
  discordApiUrl: string;
  /** Lavalink's REST API for catalog search (ADR-0009); without it searches find no tracks. */
  lavalink?: { url: string; password: string };
  /** Spotify Web API client credentials for the catalog (env only). */
  spotify?: { clientId?: string; clientSecret?: string; apiUrl?: string; accountsUrl?: string };
  youtubeApiKey?: string;
  /** Discord IDs that are always Developers (NARZE_DEVELOPER_IDS, #110): the way into the admin area. */
  developerIds?: string[];
  /** How long to wait for the Bot to answer an admin query (#111); 5 s unless a test shortens it. */
  adminQueryTimeoutMs?: number;
  /** Apple Music's RSS for charts (ADR-0010); the real one unless a test points elsewhere. */
  chartsUrl?: string;
  /** Per-address and per-user limits (#142); DEFAULT_RATE_LIMITS unless a test sets small ones. */
  rateLimits?: RateLimits;
}

/** Applies the Dashboard origin to every Socket.io server, so CORS lives in one place. */
class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly origin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: Parameters<IoAdapter["createIOServer"]>[1]) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origin, credentials: true },
    } as typeof options);
  }
}

@Module({})
class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  /** The module that creates both Redis connections closes them, after every gateway has stopped. */
  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.redis.quit(), this.subscriber.quit()]);
  }

  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        MeController,
        PlayerController,
        SearchController,
        SettingsController,
        LibraryController,
        HistoryController,
        ChartsController,
        AdminController,
      ],
      providers: [
        { provide: REDIS, useFactory: () => new Redis(options.redisUrl) },
        { provide: REDIS_SUBSCRIBER, useFactory: () => new Redis(options.redisUrl) },
        {
          provide: SUPABASE,
          useFactory: () =>
            createClient(options.supabase.url, options.supabase.secretKey, {
              auth: { persistSession: false, autoRefreshToken: false },
            }),
        },
        { provide: DISCORD_API_URL, useValue: options.discordApiUrl },
        { provide: BotStatusTracker, useFactory: () => new BotStatusTracker() },
        {
          provide: SearchService,
          useFactory: () =>
            new SearchService({
              loadTracks: createLavalinkRest({ url: options.lavalink?.url, password: options.lavalink?.password }),
              spotify: createSpotifyApi(options.spotify ?? {}),
              youtube: createYouTubeChannels({ apiKey: options.youtubeApiKey }),
            }),
        },
        {
          provide: ChartService,
          inject: [REDIS],
          useFactory: (redis: Redis) =>
            new ChartService({ redis, chartsUrl: options.chartsUrl, spotify: createSpotifyApi(options.spotify ?? {}) }),
        },
        { provide: DEVELOPER_IDS, useValue: options.developerIds ?? [] },
        { provide: ADMIN_QUERY_TIMEOUT_MS, useValue: options.adminQueryTimeoutMs ?? 5000 },
        { provide: RATE_LIMITS, useValue: options.rateLimits ?? DEFAULT_RATE_LIMITS },
        {
          // #157: Spotify turns on with its credentials; SoundCloud with the Lavalink fix (#156).
          provide: SOURCES,
          useValue: {
            spotify: Boolean(options.spotify?.clientId && options.spotify?.clientSecret),
            soundcloud: SOUNDCLOUD_PLAYABLE,
          } satisfies Sources,
        },
        AdminQueries,
        AdminRoles,
        AdminGuard,
        AdminGateway,
        Authenticator,
        DiscordApi,
        UserStore,
        SettingsStore,
        LibraryStore,
        HistoryStore,
        {
          provide: IMPORTER,
          useFactory: () =>
            createImporter({
              loadTracks: createLavalinkRest({ url: options.lavalink?.url, password: options.lavalink?.password }),
              spotify: createSpotifyApi(options.spotify ?? {}),
            }),
        },
        GuildDirectory,
        Presence,
        PlayerCache,
        CommandRelay,
        StatusGateway,
        UserGateway,
      ],
    };
  }
}

export async function createApp(options: AppOptions): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(options), {
    logger: ["error", "warn"],
  });
  // A 5000-track playlist (the Library's limit) is about 1.5 MB of JSON; express allows 100 KB.
  app.useBodyParser("json", { limit: "4mb" });
  // CORS first: it answers preflights itself (they cost no Supabase call, so they are not counted),
  // and a 429 needs its headers or the browser hides it behind a network error.
  app.enableCors({ origin: options.dashboardOrigin });
  // Every REST call costs a Supabase Auth round trip: a flood from one address is refused first (#142).
  const limits = options.rateLimits ?? DEFAULT_RATE_LIMITS;
  const api = new RateLimiter(limits.api);
  app.use("/api", (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const address = clientAddress(req.socket.remoteAddress, req.headers["x-forwarded-for"], limits.trustedProxies);
    const { ok, retryAfterMs } = api.hit(address);
    if (ok) return next();
    res.statusCode = 429;
    res.setHeader("retry-after", String(Math.ceil(retryAfterMs / 1000)));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ statusCode: 429, message: "Too Many Requests" }));
  });
  app.useWebSocketAdapter(new CorsIoAdapter(app, options.dashboardOrigin));
  app.enableShutdownHooks();
  return app;
}
