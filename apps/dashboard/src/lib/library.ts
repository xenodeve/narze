"use client";

import {
  type ImportPreview,
  ImportPreviewSchema,
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
import { onSocketEvents } from "./socket";

const parsed = async <T>(res: Response | null, schema: { safeParse(v: unknown): { success: boolean; data?: T } }) => {
  if (!res?.ok) return null;
  const result = schema.safeParse(await res.json().catch(() => null));
  return result.success ? (result.data as T) : null;
};

export const listPlaylists = async () =>
  parsed<PlaylistSummary[]>(await apiGet("/api/library/playlists").catch(() => null), PlaylistSummarySchema.array());
export const getPlaylist = async (id: string): Promise<Playlist | "missing" | null> => {
  const res = await apiGet(`/api/library/playlists/${encodeURIComponent(id)}`).catch(() => null);
  if (res?.status === 404) return "missing";
  return parsed<Playlist>(res, PlaylistSchema);
};
export const createPlaylist = async (playlist: NewPlaylist) =>
  parsed<Playlist>(await apiSend("POST", "/api/library/playlists", playlist).catch(() => null), PlaylistSchema);
export const changePlaylist = async (id: string, change: PlaylistChange) =>
  parsed<Playlist>(
    await apiSend("PUT", `/api/library/playlists/${encodeURIComponent(id)}`, change).catch(() => null),
    PlaylistSchema,
  );
export const deletePlaylist = async (id: string) =>
  (await apiSend("DELETE", `/api/library/playlists/${encodeURIComponent(id)}`).catch(() => null))?.ok ?? false;

/** Spec #71: the preview of a Spotify or YouTube playlist; the server's reason when it refuses. */
export async function previewImport(url: string): Promise<ImportPreview | { error: string }> {
  const res = await apiSend("POST", "/api/library/import", { url }).catch(() => null);
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
let likes: Like[] | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
async function loadLikes(): Promise<void> {
  const list = await parsed<Like[]>(await apiGet("/api/library/likes").catch(() => null), LikeSchema.array());
  if (list) {
    likes = list;
    emit();
  }
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (likes === null) void loadLikes();
  const off = onSocketEvents({ [SocketEvents.libraryUpdate]: () => void loadLikes() });
  return () => {
    listeners.delete(listener);
    off();
  };
};

/** The signed-in user's likes, live; null until loaded. */
export function useLikes(): Like[] | null {
  return useSyncExternalStore(
    subscribe,
    () => likes,
    () => null,
  );
}

/**
 * Likes or unlikes a track (AC4): the heart changes at once; the server's answer confirms it,
 * and a refusal puts it back.
 */
export async function toggleLike(track: PlaylistTrack, on: boolean): Promise<void> {
  const before = likes;
  likes = on
    ? [{ ...track, likedAt: new Date().toISOString() }, ...(likes ?? []).filter((l) => l.uri !== track.uri)]
    : (likes ?? []).filter((l) => l.uri !== track.uri);
  emit();
  const res = on
    ? await apiSend("PUT", "/api/library/likes", track).catch(() => null)
    : await apiSend("DELETE", `/api/library/likes?uri=${encodeURIComponent(track.uri)}`).catch(() => null);
  if (!res?.ok) {
    likes = before;
    emit();
  }
}
