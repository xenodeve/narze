import { describe, expect, test } from "bun:test";
import { lavalinkNode } from "@narze/shared";
import { createLavalink } from "../src/lavalink";

// Against the real Lavalink (`docker compose --profile audio up -d lavalink`), opt-in: LAVALINK_REAL=1.
// Every other test uses Fake Lavalink; this one checks the node the Bot will actually talk to (#150).
const real = process.env.LAVALINK_REAL === "1";

describe.skipIf(!real)("the real Lavalink (#150)", () => {
  const node = lavalinkNode(process.env);
  const base = `http://${node.host}:${node.port}`;

  test("the Bot's own manager connects with the configured node, and gets a session", async () => {
    const manager = createLavalink({
      ...node,
      sendToShard: () => {},
      client: { id: "100000000000000001", username: "check" },
    });
    const outcome = new Promise<string>((resolve) => {
      manager.nodeManager.on("connect", (n) => resolve(n.sessionId ? "connected" : "no session"));
      manager.nodeManager.on("error", (_n, e) => resolve(`error: ${(e as Error)?.message}`));
      setTimeout(() => resolve("timeout"), 10_000);
    });
    await manager.init({ id: "100000000000000001", username: "check" });
    try {
      expect(await outcome).toBe("connected");
    } finally {
      for (const n of manager.nodeManager.nodes.values()) n.destroy(undefined, true);
    }
  }, 15_000);

  test("YouTube and YouTube Music searches find tracks; a YouTube URL loads one", async () => {
    const load = async (identifier: string) => {
      const res = await fetch(`${base}/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`, {
        headers: { authorization: node.password },
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { loadType: string; data: unknown };
    };
    for (const q of ["ytsearch:YOASOBI Idol", "ytmsearch:Kenshi Yonezu Lemon"]) {
      const r = await load(q);
      expect(r.loadType).toBe("search");
      expect((r.data as unknown[]).length).toBeGreaterThan(0);
    }
    expect((await load("https://www.youtube.com/watch?v=ZRtdQ81jPUQ")).loadType).toBe("track");
  }, 30_000);
});
