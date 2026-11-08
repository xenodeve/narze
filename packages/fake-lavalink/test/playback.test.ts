import { afterEach, describe, expect, test } from "bun:test";
import { LavalinkManager } from "lavalink-client";
import { type FakeLavalink, startFakeLavalink } from "../src";

const BOT = { id: "1100000000000000001", username: "narze-test" };
const GUILD = "940000000000000001";
const CATALOG = [
  {
    title: "Lemon",
    author: "Kenshi Yonezu",
    uri: "https://music.youtube.com/watch?v=lemon",
    lengthMs: 255_000,
    artworkUrl: "https://i.ytimg.com/vi/lemon/sddefault.jpg",
  },
];

let fake: FakeLavalink | undefined;
let lavalink: LavalinkManager | undefined;
afterEach(async () => {
  await lavalink?.nodeManager.leastUsedNodes()[0]?.destroy?.();
  fake?.stop();
});

async function connected(): Promise<LavalinkManager> {
  fake = await startFakeLavalink({ password: "pw", catalog: CATALOG });
  const manager = new LavalinkManager({
    nodes: [{ id: "fake", host: "127.0.0.1", port: fake.port, authorization: "pw", retryAmount: 1, retryDelay: 50 }],
    sendToShard: () => {},
    client: BOT,
  });
  const ready = new Promise<void>((resolve) => manager.nodeManager.on("connect", () => resolve()));
  await manager.init(BOT);
  await ready;
  while (!manager.nodeManager.leastUsedNodes()[0]?.sessionId) await Bun.sleep(5);
  lavalink = manager;
  return manager;
}

describe("Fake Lavalink playback", () => {
  test("a search resolves catalog tracks by title, with their metadata", async () => {
    const node = (await connected()).nodeManager.leastUsedNodes()[0];
    const result = await node?.search({ query: "lemon", source: "ytmsearch" }, { id: "1" });
    expect(result?.loadType).toBe("search");
    expect(result?.tracks[0]?.info).toMatchObject({ title: "Lemon", author: "Kenshi Yonezu", duration: 255_000 });
  });

  test("a URL resolves to that one track, and an unknown query finds nothing", async () => {
    const node = (await connected()).nodeManager.leastUsedNodes()[0];
    expect((await node?.search({ query: CATALOG[0]?.uri ?? "" }, { id: "1" }))?.loadType).toBe("track");
    expect((await node?.search({ query: "nothing here", source: "ytsearch" }, { id: "1" }))?.loadType).toBe("empty");
  });

  test("playing a track starts it: the client receives trackStart and a position update", async () => {
    const manager = await connected();
    const player = manager.createPlayer({ guildId: GUILD, voiceChannelId: "5", textChannelId: "6" });
    const started = new Promise<string>((resolve) =>
      manager.on("trackStart", (_p, track) => resolve(track?.info.title ?? "")),
    );
    const result = await player.search({ query: "lemon", source: "ytmsearch" }, { id: "1" });
    const first = result.tracks[0];
    if (!first) throw new Error("no track");
    await player.queue.add(first);
    await player.play();
    expect(await started).toBe("Lemon");
    expect(fake?.player(GUILD)?.track?.info.title).toBe("Lemon");
  });

  test("stopping a track ends it like a real node, so the client plays the next one", async () => {
    const manager = await connected();
    const player = manager.createPlayer({ guildId: GUILD, voiceChannelId: "5", textChannelId: "6" });
    const result = await player.search({ query: "lemon", source: "ytmsearch" }, { id: "1" });
    const first = result.tracks[0];
    if (!first) throw new Error("no track");
    await player.queue.add([first, first]);
    const ended = new Promise<string>((resolve) =>
      manager.on("trackEnd", (_p, _t, payload) => resolve(payload.reason)),
    );
    let starts = 0;
    // The client's request that starts the next track must land before the fake stops (afterEach).
    const nextStarted = new Promise<void>((resolve) =>
      manager.on("trackStart", () => {
        starts += 1;
        if (starts === 2) resolve();
      }),
    );
    await player.play();
    await Bun.sleep(20);
    await player.skip();
    expect(await ended).toBe("stopped");
    await nextStarted;
  });
});

describe("Fake Lavalink voice socket (#103)", () => {
  test("closeVoice sends the client a WebSocketClosedEvent with the code and who closed it", async () => {
    const manager = await connected();
    manager.createPlayer({ guildId: GUILD, voiceChannelId: "5", textChannelId: "6" });
    const closed = new Promise<{ code: number; byRemote: boolean }>((resolve) =>
      manager.on("playerSocketClosed", (_p, payload) => resolve({ code: payload.code, byRemote: payload.byRemote })),
    );
    fake?.closeVoice(GUILD, 4006, false);
    expect(await closed).toEqual({ code: 4006, byRemote: false });
  });
});

describe("Fake Lavalink playlists (#104)", () => {
  test("a playlist URL resolves to every track with the playlist's name", async () => {
    fake = await startFakeLavalink({
      password: "pw",
      catalog: CATALOG,
      playlists: [{ name: "Mix - Lemon", url: "https://music.youtube.com/playlist?list=RDlemon", tracks: CATALOG }],
    });
    const manager = new LavalinkManager({
      nodes: [{ id: "fake", host: "127.0.0.1", port: fake.port, authorization: "pw", retryAmount: 1, retryDelay: 50 }],
      sendToShard: () => {},
      client: BOT,
    });
    const ready = new Promise<void>((resolve) => manager.nodeManager.on("connect", () => resolve()));
    await manager.init(BOT);
    await ready;
    lavalink = manager;
    const result = await manager.nodeManager
      .leastUsedNodes()[0]
      ?.search({ query: "https://music.youtube.com/playlist?list=RDlemon" }, { id: "1" });
    expect(result?.loadType).toBe("playlist");
    expect(result?.playlist?.name).toBe("Mix - Lemon");
    expect(result?.tracks.map((t) => t.info.title)).toEqual(["Lemon"]);
  });
});
