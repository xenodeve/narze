"use client";

import { BACKEND_URL } from "./config";
import { currentAccessToken } from "./session";

/** GET from the Backend as the signed-in user; the token is read at call time, so refreshes apply. */
export function apiGet(path: string): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, { headers: { authorization: `Bearer ${currentAccessToken() ?? ""}` } });
}
