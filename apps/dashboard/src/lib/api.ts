"use client";

import { BACKEND_URL } from "./config";
import { currentAccessToken } from "./session";

/** GET from the Backend as the signed-in user; the token is read at call time, so refreshes apply. */
export function apiGet(path: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, {
    headers: { authorization: `Bearer ${currentAccessToken() ?? ""}` },
    signal,
  });
}

/** POST / PUT / DELETE to the Backend as the signed-in user, with a JSON body when given. */
export function apiSend(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${currentAccessToken() ?? ""}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A request that failed to send counts as no answer. */
export const answer = (request: Promise<Response>) => request.catch(() => null);

/** The body of an OK answer, checked by `schema`; null for anything else. */
export async function parsed<T>(
  res: Response | null,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): Promise<T | null> {
  if (!res?.ok) return null;
  const result = schema.safeParse(await res.json().catch(() => null));
  return result.success ? (result.data as T) : null;
}
