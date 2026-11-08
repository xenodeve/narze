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
