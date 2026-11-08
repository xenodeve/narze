/** Where the Backend (REST + Socket.io) lives; inlined at build time. */
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
