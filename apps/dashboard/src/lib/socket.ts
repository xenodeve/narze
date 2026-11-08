"use client";

import type { Socket } from "socket.io-client";
import { BACKEND_URL } from "./config";

let socket: Promise<Socket> | undefined;
let signedIn: { userId: string; accessToken: string } | null = null;

/**
 * One Socket.io connection per tab, shared by every component (ADR-0007).
 * The client library is imported on first use, so it is not parsed before hydration.
 * The handshake carries the current access token, if any; the Backend verifies it (ADR-0005).
 */
export function getSocket(): Promise<Socket> {
  socket ??= import("socket.io-client").then(({ io }) => {
    const s = io(BACKEND_URL, {
      transports: ["websocket"],
      withCredentials: true,
      auth: (send) => send(signedIn ? { token: signedIn.accessToken } : {}),
    });
    // socket.io-client does not reconnect after the server closes a socket; this tab still wants one.
    s.on("disconnect", (reason) => {
      if (reason === "io server disconnect") setTimeout(() => s.connect(), 1000);
    });
    return s;
  });
  return socket;
}

/**
 * Who the socket should be. Signing in, out or as someone else re-handshakes; a refreshed token
 * for the same user is only kept for the next handshake, since the open socket is already verified.
 */
export function setSocketUser(next: { userId: string; accessToken: string } | null): void {
  const sameUser = next?.userId === signedIn?.userId;
  signedIn = next;
  if (sameUser) return;
  void socket?.then((s) => {
    s.disconnect();
    s.connect();
  });
}

/** The disconnect setSocketUser causes on purpose; it is not a lost connection. */
export const isRehandshake = (reason: string) => reason === "io client disconnect";

type Handler = (...args: never[]) => void;

/** Subscribes to socket events once the shared socket exists; the returned function unsubscribes. */
export function onSocketEvents(handlers: Record<string, Handler>): () => void {
  let detached = false;
  let off = () => {};
  void getSocket().then((s) => {
    if (detached) return;
    const entries = Object.entries(handlers) as Array<[string, (...args: unknown[]) => void]>;
    for (const [event, handler] of entries) s.on(event, handler);
    off = () => {
      for (const [event, handler] of entries) s.off(event, handler);
    };
  });
  return () => {
    detached = true;
    off();
  };
}
