"use client";

import {
  type ImportPreview,
  ImportPreviewSchema,
  LIKED_PLAYLIST,
  type Like,
  LikeSchema,
  type NewPlaylist,
  type Playlist,
  type PlaylistChange,
  PlaylistSchema,
  type PlaylistSummary,
  PlaylistSummarySchema,
  type PlaylistTrack,
  SocketEvents,
} from "@narze/shared";
import { useEffect, useSyncExternalStore } from "react";
import { apiGet, apiSend } from "./api";
import { useSession } from "./session";
import { onSocketEvents } from "./socket";

/** A request that failed to send counts as no answer. */
const answer = (request: Promise<Response>) => request.catch(() => null);
const parsed = async <T>(res: Response | null, schema: { safeParse(v: unknown): { success: boolean; data?: T } }) => {
  if (!res?.ok) return null;
  const result = schema.safeParse(await res.json().catch(() => null));
  return result.success ? (result.data as T) : null;
};
const playlistPath = (id: string) => `/api/library/playlists/${encodeURIComponent(id)}`;

export const listPlaylists = async () =>
  parsed<PlaylistSummary[]>(await answer(apiGet("/api/library/playlists")), PlaylistSummarySchema.array());
export const getPlaylist = async (id: string): Promise<Playlist | "missing" | null> => {
  const res = await answer(apiGet(playlistPath(id)));
  if (res?.status === 404) return "missing";
  return parsed<Playlist>(res, PlaylistSchema);
};
export const createPlaylist = async (playlist: NewPlaylist) =>
  parsed<Playlist>(await answer(apiSend("POST", "/api/library/playlists", playlist)), PlaylistSchema);
export const changePlaylist = async (id: string, change: PlaylistChange) =>
  parsed<Playlist>(await answer(apiSend("PUT", playlistPath(id), change)), PlaylistSchema);
export const deletePlaylist = async (id: string) => (await answer(apiSend("DELETE", playlistPath(id))))?.ok ?? false;

/** Spec #71: the preview of a Spotify or YouTube playlist; the server's reason when it refuses. */
export async function previewImport(url: string): Promise<ImportPreview | { error: string }> {
  const res = await answer(apiSend("POST", "/api/library/import", { url }));
  if (res?.status === 400) return { error: "ใช้ได้เฉพาะลิงก์ Playlist ของ Spotify หรือ YouTube ที่มีเพลงอยู่" };
  return (await parsed<ImportPreview>(res, ImportPreviewSchema)) ?? { error: "โหลด Playlist ไม่สำเร็จ ลองอีกครั้ง" };
}

/** A user's Library changed in another tab (#107, AC3). */
export function useLibraryUpdates(onUpdate: (playlistId: string) => void): void {
  useEffect(
    () =>
      onSocketEvents({
        [SocketEvents.libraryUpdate]: (raw: unknown) => {
          const id = (raw as { playlistId?: unknown })?.playlistId;
          if (typeof id === "string") onUpdate(id);
        },
      }),
    [onUpdate],
  );
}

// Likes: one store for the page, so every heart for a track agrees, and a toggle shows at once.
// Every heart shares one load and one socket listener, however many rows are on screen.
let likes: Like[] | null = null;
/** Whose likes `likes` holds: a sign-out and another sign-in on the same tab must not show them. */
let owner: string | null = null;
let loading: Promise<void> | null = null;
let offSocket: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
function loadLikes(): Promise<void> {
  const forUser = owner;
  if (!forUser) return Promise.resolve();
  const load: Promise<void> = answer(apiGet("/api/library/likes"))
    .then((res) => parsed<Like[]>(res, LikeSchema.array()))
    .then((list) => {
      // A load that finishes after the user changed belongs to nobody on screen.
      if (list && owner === forUser) {
        likes = list;
        emit();
      }
    })
    .finally(() => {
      if (loading === load) loading = null;
    });
  loading ??= load;
  return loading;
}
function setOwner(userId: string | null): void {
  if (owner === userId) return;
  owner = userId;
  likes = null;
  loading = null;
  emit();
  void loadLikes();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    // Nothing listened while no heart was on screen, so what we hold may be stale.
    void loadLikes();
    offSocket = onSocketEvents({
      [SocketEvents.libraryUpdate]: (raw: unknown) => {
        if ((raw as { playlistId?: unknown })?.playlistId === LIKED_PLAYLIST) void loadLikes();
      },
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      offSocket?.();
      offSocket = null;
    }
  };
};

/** The signed-in user's likes, live; null until loaded (and for nobody signed in). */
export function useLikes(): Like[] | null {
  const session = useSession();
  const userId = session.status === "signed-in" ? session.userId : null;
  useEffect(() => setOwner(userId), [userId]);
  return useSyncExternalStore(
    subscribe,
    () => (owner === userId ? likes : null),
    () => null,
  );
}

/**
 * Likes or unlikes a track (AC4): the heart changes at once; the server's answer confirms it,
 * and a refusal puts it back.
 */
export async function toggleLike(track: PlaylistTrack, on: boolean): Promise<void> {
  const previous = likes?.find((l) => l.uri === track.uri);
  likes = on
    ? [{ ...track, likedAt: new Date().toISOString() }, ...(likes ?? []).filter((l) => l.uri !== track.uri)]
    : (likes ?? []).filter((l) => l.uri !== track.uri);
  emit();
  const res = await answer(
    on
      ? apiSend("PUT", "/api/library/likes", track)
      : apiSend("DELETE", `/api/library/likes?uri=${encodeURIComponent(track.uri)}`),
  );
  if (!res?.ok && likes) {
    // Undo only this track: other hearts toggled meanwhile keep their change.
    const rest = likes.filter((l) => l.uri !== track.uri);
    likes = !on && previous ? [previous, ...rest].sort((a, b) => b.likedAt.localeCompare(a.likedAt)) : rest;
    emit();
  }
}
