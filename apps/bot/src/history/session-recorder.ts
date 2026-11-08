import { GuildEventTypes, type ListeningSession, type Requester, type SessionTrack } from "@narze/shared";

/** Spec #31: changes reach Supabase at most this long after the first unsaved one. */
export const SESSION_FLUSH_MS = 5 * 60_000;

/** One track start, as the Player saw it. */
export interface SessionPlay {
  guildName: string;
  channelId: string | null;
  /** Non-bot members in the Bot's voice channel at the start. */
  members: readonly Requester[];
  track: Omit<SessionTrack, "playedAt">;
}

export interface SessionStoreLike {
  save(session: ListeningSession): Promise<void>;
  /** Ends the rows these Guilds still mark active (a Bot restart: they cannot still be playing). */
  closeActive(at: number, guildIds: readonly string[]): Promise<void>;
}

export interface SessionFileLike {
  read(): Promise<ListeningSession[]>;
  write(sessions: ListeningSession[]): Promise<void>;
}

type SessionEventType = typeof GuildEventTypes.sessionUpdate | typeof GuildEventTypes.sessionEnd;

/**
 * Listening Sessions (#108, spec #31): one active per Guild, from the first track until the Bot
 * leaves voice. Every change goes to the local file first (a crash loses nothing), a new session
 * and an ended one go to Supabase at once, and the rest is written behind within SESSION_FLUSH_MS.
 * A failed save stays unsaved and is retried; it is never dropped (v5 dropped it before committing).
 */
export function createSessionRecorder({
  store,
  file,
  publish,
  now = Date.now,
  setTimer = (run, ms) => setTimeout(run, ms),
  log = () => {},
}: {
  store: SessionStoreLike;
  file: SessionFileLike;
  publish: (type: SessionEventType, session: ListeningSession) => void;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  log?: (message: string, error: unknown) => void;
}) {
  const active = new Map<string, ListeningSession>();
  /** Sessions with changes Supabase has not seen, by id (ended ones stay here until saved). */
  const unsaved = new Map<string, ListeningSession>();
  /** Bumped by every change, so a save that finishes after a newer change keeps it unsaved. */
  const versions = new Map<string, number>();
  let timer: unknown = null;
  let writing: Promise<void> = Promise.resolve();

  /** The file holds every session that is active or not yet saved. */
  function mirror(): Promise<void> {
    const all = new Map([...unsaved, ...[...active.values()].map((s) => [s.id, s] as const)]);
    const snapshot = structuredClone([...all.values()]);
    writing = writing.then(() => file.write(snapshot)).catch((error) => log("write sessions file", error));
    return writing;
  }

  function later(): void {
    timer ??= setTimer(() => void flush(), SESSION_FLUSH_MS);
  }

  async function save(session: ListeningSession): Promise<void> {
    const version = versions.get(session.id);
    try {
      await store.save(structuredClone(session));
      if (versions.get(session.id) === version) {
        unsaved.delete(session.id);
        versions.delete(session.id);
      }
    } catch (error) {
      log("save session", error);
      later();
    }
  }

  async function flush(): Promise<void> {
    timer = null;
    for (const session of [...unsaved.values()]) await save(session);
    await mirror();
  }

  function touch(session: ListeningSession): void {
    unsaved.set(session.id, session);
    versions.set(session.id, (versions.get(session.id) ?? 0) + 1);
  }

  function join(session: ListeningSession, who: Requester, at: number): void {
    if (session.participants.some((p) => p.id === who.id)) return;
    session.participants.push({ id: who.id, name: who.name, avatarUrl: who.avatarUrl, joinedAt: at });
  }

  return {
    async trackStarted(guildId: string, play: SessionPlay): Promise<void> {
      const at = now();
      let session = active.get(guildId);
      const isNew = !session;
      if (!session) {
        session = {
          id: `${guildId}-${at}`,
          guildId,
          guildName: play.guildName || "Unknown Server",
          channelId: play.channelId,
          startTime: at,
          endTime: null,
          isActive: true,
          tracks: [],
          participants: [],
        };
        active.set(guildId, session);
      }
      // The Bot may have moved channels, and the name may have arrived late.
      session.channelId = play.channelId ?? session.channelId;
      if (play.guildName) session.guildName = play.guildName;
      session.tracks.push({ ...play.track, playedAt: at });
      for (const member of play.members) join(session, member, at);
      join(session, play.track.requester, at);
      touch(session);
      // The grid shows a session as soon as it starts; later tracks are written behind.
      if (isNew) await save(session);
      else later();
      await mirror();
      publish(GuildEventTypes.sessionUpdate, session);
    },

    async ended(guildId: string): Promise<void> {
      const session = active.get(guildId);
      if (!session) return;
      active.delete(guildId);
      session.isActive = false;
      session.endTime = now();
      touch(session);
      await save(session);
      await mirror();
      publish(GuildEventTypes.sessionEnd, session);
    },

    /** Writes every unsaved change now (shutdown). */
    flush,

    /**
     * Bot start (AC1): sessions the file still holds as active end with the restart time, everything
     * unsaved is saved, and rows the table still marks active are closed (a crash lost their file).
     */
    async restore(guildIds: readonly string[]): Promise<void> {
      const at = now();
      for (const session of await file.read().catch(() => [] as ListeningSession[])) {
        if (session.isActive) {
          session.isActive = false;
          session.endTime = at;
        }
        touch(session);
      }
      await flush();
      await store.closeActive(at, guildIds).catch((error) => log("close active sessions", error));
    },
  };
}

export type SessionRecorder = ReturnType<typeof createSessionRecorder>;
