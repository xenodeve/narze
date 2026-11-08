import "reflect-metadata";
import { type DynamicModule, type INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import Redis from "ioredis";
import { REDIS_SUBSCRIBER } from "./redis.tokens";
import { BotStatusTracker } from "./status/bot-status.tracker";
import { StatusGateway } from "./status/status.gateway";

export interface AppOptions {
  redisUrl: string;
  /** The only browser origin allowed to open a socket (the Dashboard). */
  dashboardOrigin: string;
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
class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      providers: [
        { provide: REDIS_SUBSCRIBER, useFactory: () => new Redis(options.redisUrl) },
        { provide: BotStatusTracker, useFactory: () => new BotStatusTracker() },
        StatusGateway,
      ],
    };
  }
}

export async function createApp(options: AppOptions): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(options), { logger: ["error", "warn"] });
  app.useWebSocketAdapter(new CorsIoAdapter(app, options.dashboardOrigin));
  app.enableShutdownHooks();
  return app;
}
