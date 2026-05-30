# ADR 0002: Migrate all data storage to Supabase

## Status
Planned (blocked on Player bug fixes)

## Context

The project currently uses two databases in a transitional state:
- **Firebase Firestore**: play history, admin whitelist, listening sessions, playlists
- **MongoDB (Prisma)**: GuildSettings (musicChannelId, ownerId per guild), Prefix

This dual-database state is a remnant of a partial migration away from the original Supabase setup. It creates unnecessary complexity: two client SDKs, two connection pools, inconsistent data access patterns between bot and dashboard.

Supabase provides built-in features that currently require custom implementations or third-party services: Auth with 2FA, Row Level Security, Realtime, and Storage.

## Decision

Migrate all persistent data — currently split between Firebase Firestore and MongoDB — into a single Supabase (PostgreSQL) instance. This replaces both Firebase Auth and Firestore, as well as the Prisma/MongoDB layer.

This work is deferred until current Player stability bugs are resolved.

## Consequences

- Single database dependency replaces two (Firebase + MongoDB).
- Discord OAuth flow must be re-wired to Supabase Auth instead of Firebase Auth.
- All Firestore reads/writes in bot and dashboard must be replaced with Supabase client calls.
- Prisma schema (`GuildSettings`, `Prefix`) maps to Supabase PostgreSQL tables.
- Admin whitelist moves from Firestore collection to a Supabase table with RLS.
- Play history, listening sessions, and playlists move from Firestore to Supabase tables.
- 2FA becomes available through Supabase Auth without additional integration work.
