export interface RedisClientLike {
  psubscribe(...patterns: string[]): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  quit(): Promise<unknown>;
  on(event: string, callback: (...args: unknown[]) => void): this;
}

export interface RedisAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(channel: string, payload: unknown): Promise<void>;
}

export interface RedisAdapterLogger {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
}

export interface CreateRedisAdapterOptions {
  redisUrl: string;
  patterns: string[];
  createClient: (redisUrl: string) => RedisClientLike;
  onMessage: (channel: string, payload: unknown) => Promise<void> | void;
  onReconnect: () => Promise<void> | void;
  logger?: RedisAdapterLogger;
}

export function createRedisAdapter(
  options: CreateRedisAdapterOptions,
): RedisAdapter {
  let subscriber: RedisClientLike | null = null;
  let publisher: RedisClientLike | null = null;
  let started = false;
  let stopped = false;
  let subscriberReady = false;
  let publisherReady = false;
  let initialReadyComplete = false;
  let disconnectedAfterReady = false;
  let activeGeneration = 0;

  return {
    async start(): Promise<void> {
      if (options.patterns.length === 0) {
        throw new Error("Redis adapter requires at least one subscription pattern");
      }

      if (started) {
        return;
      }

      subscriber = options.createClient(options.redisUrl);
      publisher = options.createClient(options.redisUrl);
      activeGeneration += 1;
      const generation = activeGeneration;
      subscriber.on("pmessage", (_pattern, channel, message) => {
        if (stopped || generation !== activeGeneration) {
          return;
        }

        void handleMessage(options, String(channel), String(message));
      });
      subscriber.on("ready", () => {
        if (generation !== activeGeneration) {
          return;
        }

        subscriberReady = true;
        void maybeHandleReconnect(options, {
          stopped,
          subscriberReady,
          publisherReady,
          initialReadyComplete,
          disconnectedAfterReady,
          markInitialReadyComplete: () => {
            initialReadyComplete = true;
          },
          markReconnectHandled: () => {
            disconnectedAfterReady = false;
          },
        });
      });
      publisher.on("ready", () => {
        if (generation !== activeGeneration) {
          return;
        }

        publisherReady = true;
        void maybeHandleReconnect(options, {
          stopped,
          subscriberReady,
          publisherReady,
          initialReadyComplete,
          disconnectedAfterReady,
          markInitialReadyComplete: () => {
            initialReadyComplete = true;
          },
          markReconnectHandled: () => {
            disconnectedAfterReady = false;
          },
        });
      });
      const markDisconnected = () => {
        if (generation !== activeGeneration) {
          return;
        }

        if (initialReadyComplete) {
          disconnectedAfterReady = true;
        }
      };
      subscriber.on("close", () => {
        subscriberReady = false;
        markDisconnected();
      });
      subscriber.on("end", () => {
        subscriberReady = false;
        markDisconnected();
      });
      publisher.on("close", () => {
        publisherReady = false;
        markDisconnected();
      });
      publisher.on("end", () => {
        publisherReady = false;
        markDisconnected();
      });
      subscriber.on("error", (error) => {
        logRedisClientError(options, "subscriber", error);
      });
      publisher.on("error", (error) => {
        logRedisClientError(options, "publisher", error);
      });
      started = true;
      stopped = false;
      try {
        await subscriber.psubscribe(...options.patterns);
      } catch (error) {
        activeGeneration += 1;
        const clients = [subscriber, publisher].filter(
          (client): client is RedisClientLike => client !== null,
        );
        await Promise.allSettled(clients.map((client) => client.quit()));
        subscriber = null;
        publisher = null;
        started = false;
        stopped = false;
        subscriberReady = false;
        publisherReady = false;
        initialReadyComplete = false;
        disconnectedAfterReady = false;
        throw error;
      }
    },

    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      if (stopped) {
        return;
      }

      stopped = true;
      activeGeneration += 1;
      const clients = [subscriber, publisher].filter(
        (client): client is RedisClientLike => client !== null,
      );
      const stopErrors: unknown[] = [];

      for (const client of clients) {
        try {
          await client.quit();
        } catch (error) {
          stopErrors.push(error);
          options.logger?.error?.("Redis client quit failed", {
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (stopErrors.length > 0) {
        throw new Error("Redis adapter failed to stop cleanly");
      }

      subscriber = null;
      publisher = null;
      started = false;
      subscriberReady = false;
      publisherReady = false;
      initialReadyComplete = false;
      disconnectedAfterReady = false;
    },

    async publish(channel: string, payload: unknown): Promise<void> {
      if (stopped) {
        throw new Error("Redis adapter has been stopped");
      }

      if (!started || !publisher) {
        throw new Error("Redis adapter has not started");
      }

      await publisher.publish(channel, JSON.stringify(payload ?? {}));
    },
  };
}

function logRedisClientError(
  options: CreateRedisAdapterOptions,
  clientRole: "subscriber" | "publisher",
  error: unknown,
): void {
  options.logger?.error?.("Redis client error", {
    clientRole,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

interface ReconnectState {
  stopped: boolean;
  subscriberReady: boolean;
  publisherReady: boolean;
  initialReadyComplete: boolean;
  disconnectedAfterReady: boolean;
  markInitialReadyComplete: () => void;
  markReconnectHandled: () => void;
}

async function maybeHandleReconnect(
  options: CreateRedisAdapterOptions,
  state: ReconnectState,
): Promise<void> {
  if (state.stopped || !state.subscriberReady || !state.publisherReady) {
    return;
  }

  if (!state.initialReadyComplete) {
    state.markInitialReadyComplete();
    return;
  }

  if (!state.disconnectedAfterReady) {
    return;
  }

  state.markReconnectHandled();
  try {
    await options.onReconnect();
  } catch (error) {
    options.logger?.error?.("Redis reconnect handler failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleMessage(
  options: CreateRedisAdapterOptions,
  channel: string,
  message: string,
): Promise<void> {
  try {
    await options.onMessage(channel, parseMessage(message));
  } catch (error) {
    options.logger?.error?.("Redis message handler failed", {
      channel,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseMessage(message: string): unknown {
  try {
    return JSON.parse(message);
  } catch {
    return message;
  }
}
