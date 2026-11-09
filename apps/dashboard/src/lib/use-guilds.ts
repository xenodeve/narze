"use client";

import type { GuildSummary } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { useCallback, useSyncExternalStore } from "react";
import { apiGet } from "./api";
import { onSocketEvents } from "./socket";

export type GuildsView = { status: "loading" } | { status: "failed" } | { status: "ready"; guilds: GuildSummary[] };

/** The Backend validates what it emits; the client only checks the fields it renders. */
function isGuildSummary(value: unknown): value is GuildSummary {
  const v = value as Partial<GuildSummary> | null;
  return typeof v?.id === "string" && typeof v.playing === "boolean" && typeof v.queueLength === "number";
}

const LOADING: GuildsView = { status: "loading" };

/**
 * One store per signed-in user (#170): every caller (the sidebar, the home list, the sessions
 * list) shares one fetch and one socket subscription. The last list is kept for the tab, so a
 * page that mounts again shows it at once while it refreshes, instead of starting empty.
 */
interface Store {
  view: GuildsView;
  listeners: Set<() => void>;
  stop: (() => void) | null;
  /** Fetches again while subscribed (a retry after a failure, #176). */
  reload: (() => void) | null;
}

const stores = new Map<string, Store>();

function storeOf(userId: string): Store {
  let store = stores.get(userId);
  if (!store) {
    store = { view: LOADING, listeners: new Set(), stop: null, reload: null };
    stores.set(userId, store);
  }
  return store;
}

function set(store: Store, view: GuildsView): void {
  store.view = view;
  for (const listener of store.listeners) listener();
}

function start(store: Store): () => void {
  let live = true;
  const load = async () => {
    try {
      const res = await apiGet("/api/me/guilds");
      if (!res.ok) throw new Error(String(res.status));
      const guilds = (await res.json()) as GuildSummary[];
      if (live) set(store, { status: "ready", guilds });
    } catch {
      // A refresh that fails keeps the list already shown; only a first load reports the failure.
      if (live && store.view.status !== "ready") set(store, { status: "failed" });
    }
  };
  void load();
  store.reload = () => {
    if (store.view.status === "failed") set(store, LOADING);
    void load();
  };
  const off = onSocketEvents({
    // A Player change arrives as one GuildSummary and replaces its row.
    [SocketEvents.guildSummary]: (summary: unknown) => {
      if (!isGuildSummary(summary) || store.view.status !== "ready") return;
      set(store, { status: "ready", guilds: store.view.guilds.map((g) => (g.id === summary.id ? summary : g)) });
    },
    // A new handshake (reconnect after a drop) refetches the list.
    [SocketEvents.sessionReady]: () => void load(),
  });
  return () => {
    live = false;
    store.reload = null;
    off();
  };
}

/** Tries the server list again (the retry button of a failed load, #176). */
export function retryGuilds(userId: string): void {
  stores.get(userId)?.reload?.();
}

/**
 * Mutual Guilds of the signed-in user, kept live. Keyed on the user, so an hourly token refresh
 * does not refetch, and a different user on the same tab never sees the last user's list.
 */
export function useGuilds(userId: string): GuildsView {
  const subscribe = useCallback(
    (listener: () => void) => {
      // No user yet (a page that renders before the session is known): nothing to fetch.
      if (!userId) return () => {};
      const store = storeOf(userId);
      store.listeners.add(listener);
      if (!store.stop) store.stop = start(store);
      return () => {
        store.listeners.delete(listener);
        if (store.listeners.size === 0) {
          store.stop?.();
          store.stop = null;
        }
      };
    },
    [userId],
  );
  const snapshot = useCallback(() => (userId ? storeOf(userId).view : LOADING), [userId]);
  return useSyncExternalStore(subscribe, snapshot, () => LOADING);
}

/** A Mutual Guild's icon by id, from the shared store (null until known, or if not a Mutual Guild). */
export function useGuildIconUrl(userId: string, guildId: string): string | null {
  const view = useGuilds(userId);
  return view.status === "ready" ? (view.guilds.find((g) => g.id === guildId)?.iconUrl ?? null) : null;
}
