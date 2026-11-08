import { readFile } from "node:fs/promises";
import {
  type ListeningSession,
  ListeningSessionSchema,
  parseJson,
  type Requester,
  type Track,
  trackKey,
} from "@narze/shared";
import { z } from "zod";
import { writeJsonAtomic } from "../json-file";
import { classify } from "../music/thumbnails";
import type { PlayRecord } from "./history-store";
import { createSessionRecorder, type SessionFileLike, type SessionStoreLike } from "./session-recorder";

type VideoFacts = { categoryId?: string | null; topics?: readonly string[]; description?: string } | null;

const videoId = (uri: string): string | null => {
  try {
    const url = new URL(uri);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    return url.searchParams.get("v");
  } catch {
    return null;
  }
};

/** Spec #33, #115: Play History's music/video flags, with the Bot's own classify() (spec #62). */
export async function playFlags(
  track: Track,
  facts?: (videoId: string) => Promise<VideoFacts>,
): Promise<{ isMusic: boolean; isVideo: boolean }> {
  const sourceName = track.source;
  const id = sourceName === "youtube" ? videoId(track.uri) : null;
  const known = id && facts ? await facts(id).catch(() => null) : null;
  const { isMusicContent } = classify({
    sourceName,
    uri: track.uri,
    author: track.author,
    categoryId: known?.categoryId,
    topics: known?.topics,
    description: known?.description,
  });
  return { isMusic: isMusicContent, isVideo: !isMusicContent };
}

/** The local mirror of active and unsaved sessions (#108): written whole through a temp file and a rename. */
export function createSessionFile(path: string): SessionFileLike {
  return {
    async read() {
      const raw = await readFile(path, "utf8").catch(() => "");
      return parseJson(z.array(ListeningSessionSchema), raw) ?? [];
    },
    write: (sessions: ListeningSession[]) => writeJsonAtomic(path, sessions),
  };
}

/**
 * Listening Sessions and Play History for the Bot (#108). `hook` plugs into createMusic's
 * `history`; the Discord facts (Guild name, who is in the voice channel) come in as callbacks.
 */
export function createHistory({
  store,
  file,
  publish,
  guildName,
  members,
  facts,
  log = () => {},
}: {
  store: SessionStoreLike & { recordPlay(guildId: string, discordId: string, play: PlayRecord): Promise<void> };
  file: SessionFileLike;
  publish: Parameters<typeof createSessionRecorder>[0]["publish"];
  guildName: (guildId: string) => string;
  /** Non-bot members in a voice channel right now. */
  members: (guildId: string, channelId: string) => Requester[];
  facts?: (videoId: string) => Promise<VideoFacts>;
  log?: (what: string, error: unknown) => void;
}) {
  const recorder = createSessionRecorder({ store, file, publish, log });
  return {
    hook: {
      trackStarted(guildId: string, track: Track, voiceChannelId: string | null, recovered = false): void {
        recorder
          .trackStarted(
            guildId,
            {
              guildName: guildName(guildId),
              channelId: voiceChannelId,
              members: voiceChannelId ? members(guildId, voiceChannelId) : [],
              track: {
                title: track.title,
                author: track.author,
                uri: track.uri,
                thumbnail: track.artworkUrl,
                durationMs: track.durationMs,
                requester: track.requester,
              },
            },
            recovered,
          )
          .catch((error) => log("session track", error));
        // A track Queue Recovery restarted was already counted when it first played.
        if (recovered) return;
        playFlags(track, facts)
          .then((flags) =>
            store.recordPlay(guildId, track.requester.id, {
              trackId: trackKey(track.title, track.author),
              title: track.title,
              artist: track.author,
              uri: track.uri,
              thumbnail: track.artworkUrl,
              durationMs: track.durationMs,
              source: track.source,
              ...flags,
            }),
          )
          .catch((error) => log("record play", error));
      },
      playerGone(guildId: string): void {
        recorder.ended(guildId).catch((error) => log("end session", error));
      },
    },
    restore: recorder.restore,
    flush: recorder.flush,
  };
}
