import { describe, expect, test } from "bun:test";
import type { ListeningSession } from "@narze/shared";
import { createSessionRecorder, type SessionPlay } from "../src/history/session-recorder";

const G = "939000000000000001";
const uma = { id: "100000000000000001", name: "Uma", avatarUrl: null };
const val = { id: "100000000000000002", name: "Val", avatarUrl: "https://cdn.test/v.png" };
const remote = { id: "100000000000000003", name: "Rio", avatarUrl: null };

function rig(saved: ListeningSession[] = []) {
  let clock = 1_000;
  const timers: Array<{ at: number; run: () => void }> = [];
  const store = {
    saves: [] as ListeningSession[],
    closed: [] as Array<{ at: number; guildIds: readonly string[] }>,
    fail: false,
    async save(session: ListeningSession) {
      if (store.fail) throw new Error("supabase down");
      store.saves.push(structuredClone(session));
    },
    async closeActive(at: number, guildIds: readonly string[]) {
      store.closed.push({ at, guildIds });
    },
  };
  const file = {
    written: saved,
    async read() {
      return file.written;
    },
    async write(sessions: ListeningSession[]) {
      file.written = structuredClone(sessions);
    },
  };
  const events: Array<{ type: string; session: ListeningSession }> = [];
  const recorder = createSessionRecorder({
    store,
    file,
    publish: (type, session) => events.push({ type, session: structuredClone(session) }),
    now: () => clock,
    setTimer: (run, ms) => {
      timers.push({ at: clock + ms, run });
      return timers.length;
    },
  });
  return {
    recorder,
    store,
    file,
    events,
    advance(ms: number) {
      clock += ms;
      const due = timers.filter((t) => t.at <= clock);
      timers.splice(0, timers.length, ...timers.filter((t) => t.at > clock));
      for (const t of due) t.run();
    },
    timers,
  };
}

/** Lets a timer-started flush (several awaits deep) finish. */
const settle = () => Bun.sleep(5);

const play = (title: string, requester = uma, members = [uma, val]): SessionPlay => ({
  guildName: "Club",
  channelId: "939000000000000093",
  members,
  track: { title, author: "YOASOBI", uri: `https://x.test/${title}`, thumbnail: null, durationMs: 1000, requester },
});

describe("a Listening Session (#108, spec #31)", () => {
  test("starts on the first track, saved at once so the grid shows it; participants are the room plus a remote requester", async () => {
    const { recorder, store, events } = rig();
    await recorder.trackStarted(G, play("Idol"));
    await recorder.trackStarted(G, play("Lemon", remote));
    expect(store.saves).toHaveLength(1);
    const [session] = store.saves;
    expect(session).toMatchObject({ guildId: G, isActive: true, endTime: null, startTime: 1_000 });
    expect(session?.id).toBe(`${G}-1000`);
    const last = events.at(-1)?.session;
    expect(last?.tracks.map((t) => t.title)).toEqual(["Idol", "Lemon"]);
    expect(last?.tracks[1]?.requester.id).toBe(remote.id);
    expect(last?.participants.map((p) => p.id)).toEqual([uma.id, val.id, remote.id]);
    expect(events.every((e) => e.type === "session:update")).toBe(true);
  });

  test("a participant keeps the time they were first seen; nobody is added twice", async () => {
    const { recorder, events, advance } = rig();
    await recorder.trackStarted(G, play("Idol", uma, [uma]));
    advance(500);
    await recorder.trackStarted(G, play("Lemon", uma, [uma, val]));
    const participants = events.at(-1)?.session.participants ?? [];
    expect(participants).toEqual([
      { ...uma, joinedAt: 1_000 },
      { ...val, joinedAt: 1_500 },
    ]);
  });

  test("changes are written behind: within 5 minutes of the first unsaved one, not reset by later ones", async () => {
    const { recorder, store, advance } = rig();
    await recorder.trackStarted(G, play("Idol"));
    await recorder.trackStarted(G, play("Lemon"));
    advance(4 * 60_000);
    await recorder.trackStarted(G, play("Idol 2"));
    expect(store.saves).toHaveLength(1);
    advance(60_000);
    await settle();
    expect(store.saves).toHaveLength(2);
    expect(store.saves[1]?.tracks).toHaveLength(3);
  });

  test("every change reaches the local file first, so a crash loses nothing", async () => {
    const { recorder, file } = rig();
    await recorder.trackStarted(G, play("Idol"));
    await recorder.trackStarted(G, play("Lemon"));
    expect(file.written[0]?.tracks).toHaveLength(2);
  });

  test("the Bot leaving voice ends it: saved at once, sent as session:end, and the next track starts a new one", async () => {
    const { recorder, store, events, advance } = rig();
    await recorder.trackStarted(G, play("Idol"));
    advance(10_000);
    await recorder.ended(G);
    expect(store.saves.at(-1)).toMatchObject({ isActive: false, endTime: 11_000 });
    expect(events.at(-1)?.type).toBe("session:end");
    await recorder.ended(G);
    expect(events.filter((e) => e.type === "session:end")).toHaveLength(1);
    await recorder.trackStarted(G, play("Lemon"));
    expect(events.at(-1)?.session.id).toBe(`${G}-11000`);
  });

  test("a failed save is kept and retried by the next write, never dropped", async () => {
    const { recorder, store, advance } = rig();
    store.fail = true;
    await recorder.trackStarted(G, play("Idol"));
    advance(5 * 60_000);
    await settle();
    expect(store.saves).toHaveLength(0);
    store.fail = false;
    await recorder.flush();
    expect(store.saves.at(-1)?.tracks).toHaveLength(1);
  });
});

describe("restart (#108, AC1)", () => {
  test("sessions left active end with the restart time, are saved, and the table's own leftovers are closed too", async () => {
    const left: ListeningSession = {
      id: `${G}-500`,
      guildId: G,
      guildName: "Club",
      channelId: null,
      startTime: 500,
      endTime: null,
      isActive: true,
      tracks: [],
      participants: [],
    };
    const { recorder, store, file } = rig([left]);
    await recorder.restore([G]);
    expect(store.saves).toEqual([{ ...left, isActive: false, endTime: 1_000 }]);
    expect(store.closed).toEqual([{ at: 1_000, guildIds: [G] }]);
    expect(file.written).toEqual([]);
  });
});
