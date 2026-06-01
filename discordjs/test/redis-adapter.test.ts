import assert from "node:assert/strict";
import test from "node:test";

import { createRedisAdapter } from "../src/redis-adapter";

test("start rejects empty subscription patterns before creating Redis clients", async () => {
  let createdClients = 0;
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: [],
    createClient: () => {
      createdClients += 1;
      return new FakeRedisClient();
    },
    onMessage: async () => {},
    onReconnect: async () => {},
  });

  await assert.rejects(
    adapter.start(),
    /Redis adapter requires at least one subscription pattern/,
  );
  assert.equal(createdClients, 0);
});

test("start creates subscriber and publisher clients, subscribes patterns, and publishes JSON", async () => {
  const clients: FakeRedisClient[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async () => {},
    onReconnect: async () => {},
  });

  await adapter.start();
  await adapter.publish("bot:guild-1:state:full", { ok: true });

  assert.equal(clients.length, 2);
  assert.deepEqual(clients[0]?.psubscribeCalls, [["backend:request:state:*"]]);
  assert.deepEqual(clients[1]?.publishCalls, [
    ["bot:guild-1:state:full", '{"ok":true}'],
  ]);
}
);

test("pmessage parses JSON payloads and forwards raw strings when JSON parsing fails", async () => {
  const clients: FakeRedisClient[] = [];
  const messages: unknown[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async (channel, payload) => {
      messages.push({ channel, payload });
    },
    onReconnect: async () => {},
  });

  await adapter.start();

  clients[0]?.emit(
    "pmessage",
    "backend:request:state:*",
    "backend:request:state:guild-1",
    '{"guildId":"guild-1"}',
  );
  clients[0]?.emit(
    "pmessage",
    "backend:request:state:*",
    "backend:request:state:guild-2",
    "{bad-json",
  );

  assert.deepEqual(messages, [
    {
      channel: "backend:request:state:guild-1",
      payload: { guildId: "guild-1" },
    },
    {
      channel: "backend:request:state:guild-2",
      payload: "{bad-json",
    },
  ]);
});

test("onMessage failures are logged without stopping later messages", async () => {
  const clients: FakeRedisClient[] = [];
  const handledChannels: string[] = [];
  const loggedErrors: unknown[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async (channel) => {
      handledChannels.push(channel);
      if (channel.endsWith("guild-1")) {
        throw new Error("handler failed");
      }
    },
    onReconnect: async () => {},
    logger: {
      error: (_message, context) => {
        loggedErrors.push(context);
      },
    },
  });

  await adapter.start();

  clients[0]?.emit(
    "pmessage",
    "backend:request:state:*",
    "backend:request:state:guild-1",
    '{"secret":"not logged"}',
  );
  clients[0]?.emit(
    "pmessage",
    "backend:request:state:*",
    "backend:request:state:guild-2",
    "{}",
  );

  await Promise.resolve();

  assert.deepEqual(handledChannels, [
    "backend:request:state:guild-1",
    "backend:request:state:guild-2",
  ]);
  assert.deepEqual(loggedErrors, [
    {
      channel: "backend:request:state:guild-1",
      errorMessage: "handler failed",
    },
  ]);
});

test("onReconnect runs only after both Redis clients are ready following a disconnect", async () => {
  const clients: FakeRedisClient[] = [];
  let reconnects = 0;
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async () => {},
    onReconnect: async () => {
      reconnects += 1;
    },
  });

  await adapter.start();

  clients[0]?.emit("ready");
  clients[1]?.emit("ready");
  assert.equal(reconnects, 0);

  clients[1]?.emit("close");
  clients[0]?.emit("close");
  clients[0]?.emit("ready");
  assert.equal(reconnects, 0);

  clients[1]?.emit("ready");
  assert.equal(reconnects, 1);
});

test("start is idempotent and does not create duplicate Redis clients", async () => {
  const clients: FakeRedisClient[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async () => {},
    onReconnect: async () => {},
  });

  await adapter.start();
  await adapter.start();

  assert.equal(clients.length, 2);
  assert.deepEqual(clients[0]?.psubscribeCalls, [["backend:request:state:*"]]);
});

test("stop before start is a no-op and publish before start reports not started", async () => {
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => new FakeRedisClient(),
    onMessage: async () => {},
    onReconnect: async () => {},
  });

  await adapter.stop();
  await assert.rejects(
    adapter.publish("bot:guild-1:state:full", {}),
    /Redis adapter has not started/,
  );
});

test("stop quits both clients, disables callbacks, and publish after stop reports stopped", async () => {
  const clients: FakeRedisClient[] = [];
  const messages: unknown[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async (channel) => {
      messages.push(channel);
    },
    onReconnect: async () => {
      messages.push("reconnect");
    },
  });

  await adapter.start();
  await adapter.stop();
  await adapter.stop();

  clients[0]?.emit("pmessage", "backend:request:state:*", "backend:request:state:guild-1", "{}");
  clients[0]?.emit("close");
  clients[0]?.emit("ready");
  clients[1]?.emit("close");
  clients[1]?.emit("ready");

  assert.equal(clients[0]?.quitCalls, 1);
  assert.equal(clients[1]?.quitCalls, 1);
  assert.deepEqual(messages, []);
  await assert.rejects(
    adapter.publish("bot:guild-1:state:full", {}),
    /Redis adapter has been stopped/,
  );
});

test("adapter can start again after a clean stop", async () => {
  const clients: FakeRedisClient[] = [];
  const messages: unknown[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async (channel) => {
      messages.push(channel);
    },
    onReconnect: async () => {},
  });

  await adapter.start();
  await adapter.stop();
  await adapter.start();
  clients[0]?.emit("pmessage", "backend:request:state:*", "backend:request:state:old", "{}");
  await adapter.publish("bot:guild-1:state:full", { ok: true });

  assert.equal(clients.length, 4);
  assert.deepEqual(messages, []);
  assert.deepEqual(clients[2]?.psubscribeCalls, [["backend:request:state:*"]]);
  assert.deepEqual(clients[3]?.publishCalls, [
    ["bot:guild-1:state:full", '{"ok":true}'],
  ]);
});

test("start cleans up both clients when psubscribe fails", async () => {
  const clients: FakeRedisClient[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async () => {},
    onReconnect: async () => {},
  });
  clients;

  const originalCreateClient = (() => {
    let count = 0;
    return () => {
      const client = new FakeRedisClient();
      if (count === 0) {
        client.psubscribeError = new Error("subscribe failed");
      }
      count += 1;
      clients.push(client);
      return client;
    };
  })();
  const failingAdapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: originalCreateClient,
    onMessage: async () => {},
    onReconnect: async () => {},
  });

  await assert.rejects(failingAdapter.start(), /subscribe failed/);

  assert.equal(clients[0]?.quitCalls, 1);
  assert.equal(clients[1]?.quitCalls, 1);
  await assert.rejects(
    failingAdapter.publish("bot:guild-1:state:full", {}),
    /Redis adapter has not started/,
  );
});

test("start disables callbacks from clients that failed to subscribe", async () => {
  const clients: FakeRedisClient[] = [];
  const messages: unknown[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: (() => {
      let count = 0;
      return () => {
        const client = new FakeRedisClient();
        if (count === 0) {
          client.psubscribeError = new Error("subscribe failed");
        }
        count += 1;
        clients.push(client);
        return client;
      };
    })(),
    onMessage: async (channel) => {
      messages.push(channel);
    },
    onReconnect: async () => {
      messages.push("reconnect");
    },
  });

  await assert.rejects(adapter.start(), /subscribe failed/);
  clients[0]?.emit("pmessage", "backend:request:state:*", "backend:request:state:guild-1", "{}");
  clients[0]?.emit("ready");
  clients[1]?.emit("ready");

  assert.deepEqual(messages, []);
});

test("stop attempts both quits, logs failures, then throws when cleanup fails", async () => {
  const clients: FakeRedisClient[] = [];
  const loggedErrors: unknown[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async () => {},
    onReconnect: async () => {},
    logger: {
      error: (_message, context) => {
        loggedErrors.push(context);
      },
    },
  });

  await adapter.start();
  clients[0]!.quitError = new Error("subscriber quit failed");

  await assert.rejects(adapter.stop(), /Redis adapter failed to stop cleanly/);

  assert.equal(clients[0]?.quitCalls, 1);
  assert.equal(clients[1]?.quitCalls, 1);
  assert.deepEqual(loggedErrors, [
    {
      errorMessage: "subscriber quit failed",
    },
  ]);
});

test("Redis error events are logged without closing the adapter", async () => {
  const clients: FakeRedisClient[] = [];
  const loggedErrors: unknown[] = [];
  const adapter = createRedisAdapter({
    redisUrl: "redis://localhost:6379",
    patterns: ["backend:request:state:*"],
    createClient: () => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    },
    onMessage: async () => {},
    onReconnect: async () => {},
    logger: {
      error: (_message, context) => {
        loggedErrors.push(context);
      },
    },
  });

  await adapter.start();
  clients[0]?.emit("error", new Error("subscriber failed"));
  await adapter.publish("bot:guild-1:state:full", null);

  assert.deepEqual(loggedErrors, [
    {
      clientRole: "subscriber",
      errorMessage: "subscriber failed",
    },
  ]);
  assert.deepEqual(clients[1]?.publishCalls, [["bot:guild-1:state:full", "{}"]]);
});

class FakeRedisClient {
  psubscribeCalls: string[][] = [];
  publishCalls: Array<[string, string]> = [];
  quitCalls = 0;
  psubscribeError: Error | null = null;
  quitError: Error | null = null;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  async psubscribe(..._patterns: string[]): Promise<unknown> {
    if (this.psubscribeError) {
      throw this.psubscribeError;
    }

    this.psubscribeCalls.push(_patterns);
    return undefined;
  }

  async publish(_channel: string, _message: string): Promise<unknown> {
    this.publishCalls.push([_channel, _message]);
    return undefined;
  }

  async quit(): Promise<unknown> {
    this.quitCalls += 1;
    if (this.quitError) {
      throw this.quitError;
    }

    return undefined;
  }

  on(_event: string, _callback: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(_event) ?? [];
    listeners.push(_callback);
    this.listeners.set(_event, listeners);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}
