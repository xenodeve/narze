# ADR 0001: Bot verifies admin status via Firebase directly

## Status
Accepted

## Context

The dashboard has two separate permission domains:

1. **Discord permissions** — checked by the bot (voice channel co-location, server owner, bot owner per guild)
2. **Admin whitelist** — stored in Firebase Firestore, checked by the dashboard to gate access to the Admin Panel

Admin and Developer users (from the Firebase whitelist) should have Player control equivalent to a guild owner — i.e., able to pause, skip, and play without being in a voice channel.

The alternative was to have the dashboard pass an `isAdmin: true` flag in the request body to the bot API, trusting the client assertion.

## Decision

The bot's permission middleware (`api/middleware/auth.ts`) will query the Firebase admin whitelist directly using the Firebase Admin SDK (already initialised in `lib/firebase.ts`) when checking control permission. If the requesting user's Discord ID appears in the whitelist with role `admin` or `developer`, they are granted control equivalent to guild owner.

## Consequences

- Admin and Developer users can control any Player in any guild from the dashboard without being in a voice channel.
- Client-sent `isAdmin` flags are never trusted — the bot is the single source of truth for permission decisions.
- Bot now depends on Firebase being reachable for admin permission checks. If Firebase is unavailable, admin bypass falls back to standard Discord permission checks (fail open for existing guild members, fail closed for non-members).
