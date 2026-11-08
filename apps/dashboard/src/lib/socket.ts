"use client";

import type { Socket } from "socket.io-client";
import { BACKEND_URL } from "./supabase";

let socket: Promise<Socket> | undefined;
let accessToken: string | null = null;

/**
 * One Socket.io connection per tab, shared by every component (ADR-0007).
 * The client library is imported on first use, so it is not parsed before hydration.
 * The handshake carries the current access token, if any; the Backend verifies it (ADR-0005).
 */
export function getSocket(): Promise<Socket> {
  socket ??= import("socket.io-client").then(({ io }) =>
    io(BACKEND_URL, {
      transports: ["websocket"],
      withCredentials: true,
      auth: (send) => send(accessToken ? { token: accessToken } : {}),
    }),
  );
  return socket;
}

/** Signs the shared socket in or out: a new token means a new handshake. */
export function setSocketToken(token: string | null): void {
  if (token === accessToken) return;
  accessToken = token;
  void socket?.then((s) => {
    s.disconnect();
    s.connect();
  });
}
