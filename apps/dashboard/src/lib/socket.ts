"use client";

import type { Socket } from "socket.io-client";

let socket: Promise<Socket> | undefined;

/**
 * One Socket.io connection per tab, shared by every component (ADR-0007).
 * The client library is imported on first use, so it is not parsed before hydration.
 */
export function getSocket(): Promise<Socket> {
  socket ??= import("socket.io-client").then(({ io }) =>
    io(process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000", {
      transports: ["websocket"],
      withCredentials: true,
    }),
  );
  return socket;
}
