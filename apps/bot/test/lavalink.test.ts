import { afterEach, describe, expect, test } from "bun:test";
import { type FakeLavalink, startFakeLavalink } from "@narze/fake-lavalink";
import type { LavalinkNode } from "lavalink-client";
import { createLavalink } from "../src/lavalink";

let fake: FakeLavalink | undefined;
afterEach(() => fake?.stop());

const client = { id: "1100000000000000001", username: "narze-test" };
const lavalinkFor = (port: number, password: string) =>
  createLavalink({ host: "127.0.0.1", port, password, sendToShard: () => {}, client });

describe("The Bot's Lavalink manager", () => {
  test("connects to a Lavalink node with the right password", async () => {
    fake = await startFakeLavalink({ password: "pw" });
    const lavalink = lavalinkFor(fake.port, "pw");
    const connected = new Promise<LavalinkNode>((resolve) => lavalink.nodeManager.on("connect", resolve));
    await lavalink.init(client);
    expect((await connected).info?.version.major).toBe(4);
  });

  test("a node that refuses the password reports an error instead of crashing the process (ADR-0004)", async () => {
    fake = await startFakeLavalink({ password: "pw" });
    const lavalink = lavalinkFor(fake.port, "wrong");
    const errors: Error[] = [];
    lavalink.nodeManager.on("error", (_node, error) => errors.push(error));
    await lavalink.init(client);
    await new Promise((r) => setTimeout(r, 300));
    expect(errors.length).toBeGreaterThan(0);
    expect(fake.sessionIds()).toEqual([]);
  });
});
