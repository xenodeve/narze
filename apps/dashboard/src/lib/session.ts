"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { setSocketUser } from "./socket";
import { getSupabase, hasStoredSession } from "./supabase";

export interface SessionUser {
  name: string;
  avatarUrl: string | null;
}

export type SessionView =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; user: SessionUser; accessToken: string };

/** postMessage type the /auth/callback popup sends its opener. */
export const SIGNED_IN_MESSAGE = "narze:signed-in";

const LOADING: SessionView = { status: "loading" };
const SIGNED_OUT: SessionView = { status: "signed-out" };

let view: SessionView = LOADING;
const listeners = new Set<() => void>();
let started = false;
let following: Promise<SupabaseClient> | undefined;

function publish(next: SessionView): void {
  view = next;
  setSocketUser(next.status === "signed-in" ? { userId: next.userId, accessToken: next.accessToken } : null);
  for (const listener of listeners) listener();
}

/** Display fields only; identity for every server decision comes from the Backend (ADR-0005). */
function toView(session: Session | null): SessionView {
  if (!session) return SIGNED_OUT;
  const meta = session.user.user_metadata as Record<string, unknown>;
  const claims = (meta.custom_claims ?? {}) as Record<string, unknown>;
  const name = [claims.global_name, meta.full_name].find((v): v is string => typeof v === "string" && v.length > 0);
  return {
    status: "signed-in",
    userId: session.user.id,
    accessToken: session.access_token,
    user: { name: name ?? "Discord", avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null },
  };
}

/** The client, subscribed once to session changes (token refresh, sign-out in another tab). */
function follow(): Promise<SupabaseClient> {
  following ??= getSupabase().then((supabase) => {
    supabase.auth.onAuthStateChange((_event, session) => publish(toView(session)));
    return supabase;
  });
  return following;
}

async function refresh(): Promise<void> {
  const supabase = await follow();
  const { data } = await supabase.auth.getSession();
  publish(toView(data.session));
}

function start(): void {
  if (started) return;
  started = true;
  // No stored session: show signed-out at once and never load the Supabase client for it.
  if (hasStoredSession()) void refresh();
  else publish(SIGNED_OUT);
  window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin && event.data === SIGNED_IN_MESSAGE) void refresh();
  });
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): SessionView {
  return useSyncExternalStore(
    subscribe,
    () => view,
    () => LOADING,
  );
}

/** The current access token, for REST calls. */
export function currentAccessToken(): string | null {
  return view.status === "signed-in" ? view.accessToken : null;
}

/**
 * Discord sign-in in a popup (ADR-0005). The popup is opened synchronously inside the click so
 * blockers allow it; if it is blocked anyway, the whole page goes to Discord instead.
 */
export async function signIn(): Promise<void> {
  const popup = window.open("", "narze-sign-in", "popup,width=520,height=760");
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: "identify guilds",
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    popup?.close();
    throw error ?? new Error("no sign-in URL");
  }
  if (popup) popup.location.href = data.url;
  else window.location.assign(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  publish(SIGNED_OUT);
}
