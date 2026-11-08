import { describe, expect, test } from "bun:test";
import type { GuildEvent } from "../src/player";
import { moveTrack, type PlayerSnapshot, reducePlayer } from "../src/queue";

describe("moveTrack (spec #46)", () => {
  const q = ["a", "b", "c", "d"];

  test("moving down drops the track before the target index", () => {
    expect(moveTrack(q, 0, 2)).toEqual(["b", "a", "c", "d"]);
  });

  test("moving up places it at the target", () => {
    expect(moveTrack(q, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  test("`to` may equal the length: append", () => {
    expect(moveTrack(q, 1, 4)).toEqual(["a", "c", "d", "b"]);
  });

  test("out-of-range indexes are refused; a no-op move is allowed", () => {
    expect(moveTrack(q, -1, 2)).toBeNull();
    expect(moveTrack(q, 4, 0)).toBeNull();
    expect(moveTrack(q, 0, 5)).toBeNull();
    expect(moveTrack(q, 2, 2)).toEqual(q);
  });
});

const state = (revision: number, epoch = "e1", titles: string[] = []) =>
  ({ revision, epoch, queue: titles.map((title) => ({ title })) }) as unknown as NonNullable<PlayerSnapshot["state"]>;
const event = (type: string, revision: number, data: unknown): GuildEvent => ({
  type,
  guildId: "1",
  revision,
  sequence: revision,
  ts: 0,
  data,
});
const empty: PlayerSnapshot = { state: null, revision: null, epoch: null };

describe("reducePlayer: Queue Revision reconciliation (ADR-0007)", () => {
  test("in-order events apply", () => {
    const one = reducePlayer(empty, event("player:state", 1, state(1)));
    const two = reducePlayer(one.next, event("player:state", 2, state(2, "e1", ["x"])));
    expect(two.decision).toBe("apply");
    expect(two.next.revision).toBe(2);
  });

  test("an out-of-order older event is dropped and the newer state kept", () => {
    const newer = reducePlayer(empty, event("player:state", 5, state(5, "e1", ["new"]))).next;
    const late = reducePlayer(newer, event("player:state", 4, state(4, "e1", ["old"])));
    expect(late.decision).toBe("drop");
    expect(late.next).toBe(newer);
  });

  test("a gap asks for a refetch and keeps the local state until then", () => {
    const local = reducePlayer(empty, event("player:state", 5, state(5))).next;
    const gap = reducePlayer(local, event("player:state", 8, state(8)));
    expect(gap.decision).toBe("refetch");
    expect(gap.next).toBe(local);
  });

  test("a new Bot epoch applies even with a lower revision; player:gone clears", () => {
    const local = reducePlayer(empty, event("player:state", 40, state(40, "old"))).next;
    expect(reducePlayer(local, event("player:state", 1, state(1, "new"))).decision).toBe("apply");
    expect(reducePlayer(local, event("player:gone", 0, null)).next).toEqual(empty);
  });

  test("a jumpToTrack event never changes the queue (it only precedes the update)", () => {
    const local = reducePlayer(empty, event("player:state", 3, state(3, "e1", ["a", "b"]))).next;
    const jump = reducePlayer(local, event("queue:jump", 4, { fromIndex: 1, title: "b" }));
    expect(jump.decision).toBe("drop");
    expect(jump.next).toBe(local);
  });
});
