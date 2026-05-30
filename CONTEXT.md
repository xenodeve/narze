# Narze Music Bot System Context

This project is a comprehensive Discord music bot ecosystem.

## Domain Language
- **Bot**: The core Discord client handling commands and events.
- **Dashboard**: A Next.js web interface for remote control.
- **Lavalink**: An external audio server (JVM) that handles music streaming.
- **Riffy**: The Lavalink wrapper library used by the bot.
- **Prisma**: The ORM used for database operations (User data, settings).
- **Bun**: The primary runtime for the Bot component.
- **Player**: The bot's active audio session within a single guild. Encapsulates voice connection, queue, and playback state. One Player exists per guild at most. Created on first play command, destroyed when the queue empties (unless 24/7 mode is active).
  - **Active Player**: A Player that is currently playing or has tracks queued.
  - **Idle Player**: A Player in 24/7 mode that holds the voice connection but has no current track or queue.
- **Queue**: The in-memory ordered list of Tracks managed by Riffy. Source of truth for playback order. Lives only as long as the Player exists.
- **Queue Cache**: An on-disk snapshot of the Queue, persisted on each track change. Used to survive bot restarts. Not authoritative — always secondary to the live Queue.
- **View Permission**: Any member of the guild can view the Player status via the Dashboard.
- **Control Permission**: The ability to issue commands to the Player. Granted to: (1) Discord Server Owner, (2) Bot Owner (see below), (3) any member currently in the same voice channel as the bot. If no Player exists, any member in any voice channel can start playback.
- **Bot Owner** (per guild): The user who set up the bot in the guild, stored in GuildSettings (MongoDB). Distinct from Discord Server Owner. Can control the Player from anywhere without being in a voice channel.
- **Admin** (dashboard): A user in the Firebase admin whitelist with role `admin` or `developer`. Grants access to the Admin Panel and Player control in any guild without voice channel requirement. The bot verifies this status directly via Firebase (see ADR 0001).
- **Developer** (dashboard): A user in the Firebase admin whitelist with role `developer`. Same access as Admin for the Admin Panel.

## Architecture
- **Multi-component**: Separate `/bot` and `/dashboard` folders.
- **Real-time**: Communication between bot and dashboard via SSE/Websockets.
- **Scalable**: Lavalink nodes handle heavy audio processing separately.

## Tech Stack
- **Bot**: TypeScript, Bun, Discord.js, Riffy, Prisma.
- **Dashboard**: Next.js 15, React 19, Firebase, Tailwind CSS.
- **Audio**: Lavalink (Java 17+).

## Database History
The project is in mid-migration. Originally used Supabase (PostgreSQL). Partially migrated to Firebase (Firestore) for play history, admin whitelist, and listening sessions. MongoDB (via Prisma) holds residual GuildSettings and Prefix data from the transition. Supabase is being reconsidered as the unified database due to built-in features (auth, 2FA, RLS) that reduce third-party dependencies. The dual-database state (Firebase + MongoDB) is transitional, not intentional. Target state is Supabase (PostgreSQL) for all storage (see ADR 0002). Migration is deferred until current Player bugs are resolved.
