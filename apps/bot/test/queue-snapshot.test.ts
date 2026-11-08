import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSnapshotStore, type QueueSnapshot } from "../src/music/queue-snapshot";

const dirs: string[] = [];
async function store() {
  const dir = await mkdtemp(join(tmpdir(), "narze-snap-"));
  dirs.push(dir);
  return { dir, snapshots: createSnapshotStore(dir) };
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const track = (title: string) => ({
  encoded: `enc-${title}`,
  info: { title, uri: `https://music.youtube.com/watch?v=${title}`, sourceName: "youtube", length: 1000 },
  userData: { addedAt: 5 },
  requester: { id: "500000000000000001", name: "Dee", avatarUrl: null },
});

const snapshot = (guildId: string, over: Partial<QueueSnapshot> = {}): QueueSnapshot => ({
  guildId,
  voiceChannelId: "70",
  textChannelId: "71",
  current: track("Lemon"),
  positionMs: 30_000,
  paused: false,
  queue: [track("Idol")],
  volume: 40,
  repeatMode: "off",
  twentyFourSeven: true,
  silent: false,
  savedAt: 1,
  ...over,
});

describe("Queue Snapshot store (#103, CONTEXT.md)", () => {
  test("saves one file per Guild and reads every snapshot back", async () => {
    const { dir, snapshots } = await store();
    await snapshots.save(snapshot("960000000000000001"));
    await snapshots.save(snapshot("960000000000000002", { current: null, queue: [] }));
    expect((await readdir(dir)).sort()).toEqual(["960000000000000001.json", "960000000000000002.json"]);
    const all = await snapshots.all();
    expect(all.map((s) => s.guildId).sort()).toEqual(["960000000000000001", "960000000000000002"]);
    expect(all.find((s) => s.guildId === "960000000000000001")).toEqual(snapshot("960000000000000001"));
  });

  test("clear removes a Guild's snapshot; clearing one that is not there is fine", async () => {
    const { snapshots } = await store();
    await snapshots.save(snapshot("960000000000000001"));
    await snapshots.clear("960000000000000001");
    await snapshots.clear("960000000000000001");
    expect(await snapshots.all()).toEqual([]);
  });

  test("a Guild id that is not a snowflake never becomes a path", async () => {
    const { snapshots } = await store();
    await expect(snapshots.save(snapshot("../escape"))).rejects.toThrow();
    await expect(snapshots.clear("../escape")).rejects.toThrow();
  });

  test("a damaged file is skipped, not fatal, and a missing directory reads as empty", async () => {
    const { dir, snapshots } = await store();
    await snapshots.save(snapshot("960000000000000001"));
    await writeFile(join(dir, "960000000000000002.json"), "{ half");
    expect((await snapshots.all()).map((s) => s.guildId)).toEqual(["960000000000000001"]);
    expect(await createSnapshotStore(join(dir, "missing")).all()).toEqual([]);
  });

  test("writes for one Guild land in order: concurrent saves never corrupt it, a clear is not undone", async () => {
    const { dir, snapshots } = await store();
    const guild = "960000000000000001";
    await Promise.all(Array.from({ length: 20 }, (_, i) => snapshots.save(snapshot(guild, { positionMs: i }))));
    expect((await snapshots.all())[0]?.positionMs).toBe(19);
    expect((await readdir(dir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);

    // A save still in flight when the Player is destroyed must not bring the snapshot back.
    const pending = snapshots.save(snapshot(guild));
    const cleared = snapshots.clear(guild);
    await Promise.all([pending, cleared]);
    expect(await snapshots.all()).toEqual([]);
  });
});
