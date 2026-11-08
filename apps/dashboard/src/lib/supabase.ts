"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/** localStorage key of the Supabase session; the PKCE verifier lives next to it with a suffix. */
export const AUTH_STORAGE_KEY = "narze-auth";

let client: Promise<SupabaseClient> | undefined;

/**
 * The browser Supabase client, imported on first use: a signed-out visitor never downloads it
 * until they press Sign In.
 */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", {
      auth: {
        flowType: "pkce",
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        // /auth/callback exchanges the code itself; no other page should react to ?code=.
        detectSessionInUrl: false,
      },
    }),
  );
  return client;
}

/** Whether a session was stored by an earlier visit, read without loading the Supabase client. */
export function hasStoredSession(): boolean {
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
