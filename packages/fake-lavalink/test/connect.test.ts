import { afterEach, describe, expect, test } from "bun:test";
import { LavalinkManager, type LavalinkNode } from "lavalink-client";
import { type FakeLavalink, startFakeLavalink } from "../src";

let fake: FakeLavalink | undefined;
afterEach(() => fake?.stop());

function manager(port: number, authorization: string) {
  return new LavalinkManager({
    nodes: [{ id: "fake", host: "127.0.0.1", port, authorization, retryAmount: 1, retryDelay: 50 }],
    sendToShard: () => {},
    client: { id: "1100000000000000001", username: "narze-test" },
  });
}

function waitFor<T>(register: (resolve: (v: T) => void) => void, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    register((v) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
}

describe("Fake Lavalink", () => {
  test("accepts a lavalink-client connection and hands it the session id it issued", async () => {
    fake = await startFakeLavalink({ password: "pw" });
    const lavalink = manager(fake.port, "pw");
    const connected = waitFor<LavalinkNode>((resolve) => lavalink.nodeManager.on("connect", resolve));
    await lavalink.init({ id: "1100000000000000001", username: "narze-test" });
    const node = await connected;
    await waitFor<void>((resolve) => {
      const check = () => (node.sessionId ? resolve() : setTimeout(check, 10));
      check();
    });
    expect(node.sessionId).toBe(fake.sessionIds()[0]);
    expect(node.info?.version.major).toBe(4);
    await lavalink.nodeManager.leastUsedNodes()[0]?.destroy?.();
  });

  test("refuses the wrong password on REST and on the websocket upgrade", async () => {
    fake = await startFakeLavalink({ password: "pw" });
    const base = `http://127.0.0.1:${fake.port}`;
    expect((await fetch(`${base}/v4/info`, { headers: { Authorization: "wrong" } })).status).toBe(401);
    expect((await fetch(`${base}/v4/websocket`, { headers: { Authorization: "wrong" } })).status).toBe(401);
    expect(fake.sessionIds()).toEqual([]);
  });
});
