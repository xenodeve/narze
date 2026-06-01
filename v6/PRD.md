# Narze V6 — Product Requirements Document

**Version**: 1.0
**Date**: 2026-06-01
**Status**: Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [User Roles and Permissions](#3-user-roles-and-permissions)
4. [Features by App](#4-features-by-app)
   - [Bot (discordjs/)](#41-bot-discordjs)
   - [Backend (nestjs/)](#42-backend-nestjs)
   - [Frontend (nextjs/)](#43-frontend-nextjs)
5. [Data Model](#5-data-model)
6. [Real-Time Flows](#6-real-time-flows)
7. [Auth Flow](#7-auth-flow)
8. [Design System](#8-design-system)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Glossary](#10-glossary)

---

## 1. Overview

### 1.1 What is Narze V6?

Narze V6 is a web dashboard for controlling a self-hosted Discord Music Bot. It enables users to search, queue, and manage music playback from YouTube, Spotify, and SoundCloud via a browser UI — without needing to type Discord slash commands. Every state change, whether initiated from Discord or the Dashboard, propagates in real-time to all connected clients via WebSocket.

V6 is a complete rewrite of v5.0.2. The core lesson from v5 was that merging the bot process with backend responsibilities created a monolith that was difficult to debug and maintain. V6 enforces three cleanly separated application layers with explicit contracts between them.

### 1.2 Target Users

| User Type | Context |
|-----------|---------|
| Discord server members | Control music from browser while in a voice channel |
| Server Owners | Configure bot settings per Discord server |
| Admins | Monitor system health, view logs, manage history |
| Developers | Full system access including high-level management |

### 1.3 Success Criteria

- A user can search for a track and add it to the queue from the Dashboard with no Discord commands required.
- A track added via Discord slash command appears in the Dashboard queue within 500ms.
- The Dashboard queue and Now Playing state remains consistent with bot state across all connected clients in the same guild.
- Bot music playback continues uninterrupted if the Backend or Dashboard goes offline.
- The system works from a single self-hosted machine with a documented setup procedure.
- The Dashboard meets WCAG AA accessibility standards.

---

## 2. Architecture

### 2.1 Three-App Structure

| App | Directory | Technology | Role |
|-----|-----------|-----------|------|
| Bot | `discordjs/` | Discord.js + Lavalink | Music engine — audio playback, queue management, Discord interactions |
| Backend | `nestjs/` | NestJS (Node.js + TypeScript) | Bridge layer — connects Dashboard to Bot, handles auth, exposes real-time state |
| Dashboard | `nextjs/` | Next.js (React + TypeScript + Tailwind) | Web UI — browser control surface for the bot |

### 2.2 Communication Contracts

```
Discord Users
     |
     | (slash commands, reactions)
     v
[ Bot (discordjs/) ] <---> [ Lavalink (audio server) ]
     |        ^
     | Redis  | Redis
     | Pub    | Sub
     v        |
[ Backend (nestjs/) ]
     |        ^
     | Socket.io
     v        |
[ Dashboard (nextjs/) ] <--- (browser)
     |
     | HTTPS (auth callback only)
     v
[ Supabase ] <----- (source of truth: guild settings, users, auth)
```

**Persistent storage**: Supabase is the authoritative store for all persistent data. Both Bot and Backend ultimately read from Supabase.

**IPC (Bot ↔ Backend)**: Redis Pub/Sub via `ioredis`. Bot publishes player events; Backend subscribes and relays to Dashboard. Backend publishes commands; Bot subscribes and acts.

**Real-time (Backend ↔ Dashboard)**: Socket.io. All commands and state updates travel over a single persistent connection per client. No REST endpoints except `/api/auth/callback`.

**Auth**: Supabase Auth with Discord OAuth. JWT issued by Supabase is attached to the Socket.io handshake.

### 2.3 Bot Operating Modes

The Bot auto-detects its operating mode at startup by attempting a Redis connection.

**Connected Mode** (Redis reachable at startup):
- Bot receives guild settings from Backend via Redis.
- Bot publishes all player state changes to Redis for Dashboard sync.
- Bot remains the music engine; Backend is a relay, not a controller.

**Standalone Mode** (Redis unreachable at startup):
- Bot fetches guild settings directly from Supabase.
- Music playback operates fully.
- Dashboard sync is unavailable (Backend cannot relay state it never receives).
- Bot does not attempt to reconnect to Redis after startup mode is determined.

Supabase is the source of truth in both modes. There is no data inconsistency when switching modes between restarts. Settings that Backend pushes via Redis must always mirror Supabase — Backend must not store settings that are not synced to Supabase.

---

## 3. User Roles and Permissions

### 3.1 Permission Levels

| Role | Scope | Access |
|------|-------|--------|
| **User** (General) | Per-guild, requires same Voice Channel as bot | Search tracks, add to queue, reorder/remove own tracks, view player state, view queue |
| **Server Owner** | Per-guild, Discord server owner | All User permissions + configure guild settings (music channel, prefix, volume limit), manage any queue item |
| **Admin** | System-wide | All Server Owner permissions + System Stats panel, Real-time Logs, playback history, Chat History |
| **Developer** | System-wide | All Admin permissions + high-level system management (restart services, flush Redis, manage Lavalink nodes) |

### 3.2 UI Visibility by Role

UI zones are shown or hidden by permission level. Disabled states are not used — if a user cannot access a feature, the element is not rendered.

| UI Zone | User | Server Owner | Admin | Developer |
|---------|------|-------------|-------|-----------|
| Now Playing | Yes | Yes | Yes | Yes |
| Queue | Yes | Yes | Yes | Yes |
| Search | Yes | Yes | Yes | Yes |
| Playback Controls (play/pause/skip/seek) | Yes | Yes | Yes | Yes |
| Volume Control | Yes | Yes | Yes | Yes |
| Loop Mode | Yes | Yes | Yes | Yes |
| Guild Settings Panel | No | Yes | Yes | Yes |
| Admin Panel (stats, logs, history) | No | No | Yes | Yes |
| Developer Panel | No | No | No | Yes |

---

## 4. Features by App

### 4.1 Bot (`discordjs/`)

#### 4.1.1 Music Playback

- Play tracks from YouTube, Spotify, and SoundCloud via Lavalink.
- Lavalink handles all audio transcoding and streaming; the Bot manages Lavalink node connections.
- Supported slash commands mirror all Dashboard controls: `/play`, `/pause`, `/skip`, `/seek`, `/volume`, `/loop`, `/queue`, `/clear`, `/leave`, `/join`, `/playat`, `/playnext`, `/playqueue`, `/skipplay`.
- All playback state is owned by the Bot process. Backend and Dashboard display replicated state only.

#### 4.1.2 Queue Management

- Per-guild queue maintained in-memory by the Bot.
- Queue operations: add track, remove track, move track, clear queue, play at position, play next.
- Queue items include: track title, artist, duration, thumbnail URL, requester Discord user ID, source (YouTube/Spotify/SoundCloud), track URI.

#### 4.1.3 2-Mode Auto-Detection

- On startup, Bot attempts Redis connection using configured `REDIS_URL`.
- If connection succeeds within a configurable timeout (default: 3 seconds): enters Connected Mode.
- If connection fails or times out: enters Standalone Mode, logs warning, fetches settings directly from Supabase.
- Mode is fixed for the lifetime of the process. A restart is required to change modes.
- Bot logs current mode to console on startup.

#### 4.1.4 Queue Recovery

- Before shutdown (SIGTERM/SIGINT), Bot writes current queue to a local JSON snapshot file (path configurable, default: `./queue-snapshot.{guildId}.json`).
- On next startup, Bot checks for snapshot files per guild.
- If a snapshot exists: restore queue, delete the snapshot file, notify via Discord Music Channel, publish `bot:{guildId}:player:recovering` to Redis (Connected Mode only).
- After restore completes, publish normal player state.
- If snapshot file is corrupt or unreadable: log error, proceed without restore, delete the corrupt file.

#### 4.1.5 Redis Publishing (Connected Mode Only)

Bot publishes to Redis on all state-changing events:

| Event | Redis Channel | Payload |
|-------|--------------|---------|
| Track started | `bot:{guildId}:player:trackStart` | Track object, position ms |
| Track ended | `bot:{guildId}:player:trackEnd` | Track object, reason |
| Queue updated | `bot:{guildId}:queue:update` | Full queue array |
| Paused | `bot:{guildId}:player:pause` | — |
| Resumed | `bot:{guildId}:player:resume` | — |
| Volume changed | `bot:{guildId}:player:volume` | Volume integer |
| Loop mode changed | `bot:{guildId}:player:loop` | Loop mode enum |
| Position seeked | `bot:{guildId}:player:seek` | Position ms |
| Bot joined voice | `bot:{guildId}:player:join` | Channel ID |
| Bot left voice | `bot:{guildId}:player:leave` | — |
| Queue recovering | `bot:{guildId}:player:recovering` | Snapshot track count |
| Error | `bot:{guildId}:error` | Error type, message |

Bot subscribes to Backend commands:

| Redis Channel | Action |
|--------------|--------|
| `backend:{guildId}:player:play` | Play track URI |
| `backend:{guildId}:player:pause` | Toggle pause |
| `backend:{guildId}:player:skip` | Skip current track |
| `backend:{guildId}:player:seek` | Seek to position ms |
| `backend:{guildId}:player:volume` | Set volume |
| `backend:{guildId}:player:loop` | Set loop mode |
| `backend:{guildId}:queue:add` | Add track to queue |
| `backend:{guildId}:queue:remove` | Remove track by index |
| `backend:{guildId}:queue:move` | Move track from index A to B |
| `backend:{guildId}:queue:clear` | Clear queue |
| `backend:request:state:{guildId}` | Publish full current state |

#### 4.1.6 Settings Behavior by Mode

**Connected Mode**: Bot receives guild settings (music channel ID, volume limit, etc.) from Backend via Redis channel `backend:{guildId}:settings:update` on startup and on each settings change.

**Standalone Mode**: Bot fetches guild settings directly from Supabase on startup and caches locally. Refreshes on bot restart only.

---

### 4.2 Backend (`nestjs/`)

#### 4.2.1 Socket.io Gateway

- NestJS `@WebSocketGateway` serves the Socket.io server.
- Clients join per-guild rooms upon authenticated connection: room name `guild:{guildId}`.
- All player state broadcasts use `server.to('guild:{guildId}').emit(event, payload)`.
- Gateway validates JWT from Socket.io handshake `auth.token` field before allowing join.

**Client-emitted events (Dashboard → Backend)**:

| Event | Payload | Action |
|-------|---------|--------|
| `player:play` | `{ guildId, uri, source }` | Forward to Bot via Redis |
| `player:pause` | `{ guildId }` | Forward to Bot via Redis |
| `player:skip` | `{ guildId }` | Forward to Bot via Redis |
| `player:seek` | `{ guildId, position }` | Forward to Bot via Redis |
| `player:volume` | `{ guildId, volume }` | Forward to Bot via Redis |
| `player:loop` | `{ guildId, mode }` | Forward to Bot via Redis |
| `queue:add` | `{ guildId, uri, source }` | Forward to Bot via Redis |
| `queue:remove` | `{ guildId, index }` | Forward to Bot via Redis |
| `queue:move` | `{ guildId, from, to }` | Forward to Bot via Redis |
| `queue:clear` | `{ guildId }` | Forward to Bot via Redis |
| `state:request` | `{ guildId }` | Publish `backend:request:state:{guildId}` to Redis |

**Server-emitted events (Backend → Dashboard)**:

All events are broadcast to `guild:{guildId}` room:

| Event | Payload |
|-------|---------|
| `player:trackStart` | Track object, position ms |
| `player:trackEnd` | Track object, reason |
| `player:pause` | — |
| `player:resume` | — |
| `player:volume` | Volume integer |
| `player:loop` | Loop mode enum |
| `player:seek` | Position ms |
| `player:join` | Channel ID |
| `player:leave` | — |
| `player:recovering` | Track count |
| `queue:update` | Full queue array |
| `state:full` | Full PlayerState object |
| `error` | Error type, message |

#### 4.2.2 Redis Subscriber / Publisher

- Backend subscribes to all `bot:{guildId}:*` channels.
- On receiving a Bot event: translate to Socket.io event and broadcast to `guild:{guildId}` room.
- On receiving a Dashboard Socket.io command: translate to Redis channel and publish to `backend:{guildId}:*`.
- Uses `ioredis` directly (not `@nestjs/microservices` Redis transport).
- Maintains two `ioredis` instances: one for subscribing (cannot publish while subscribed), one for publishing.

#### 4.2.3 Auth — Supabase Admin SDK

- Backend uses Supabase Admin SDK (`@supabase/supabase-js` with `SERVICE_ROLE_KEY`) for server-side JWT verification.
- On Socket.io handshake: extract `auth.token`, call `supabase.auth.getUser(token)` to validate.
- Attach `user` and `guildId` to socket data on successful auth.
- Reject connection with error code `401` on invalid or expired JWT.

#### 4.2.4 REST Endpoint — `/api/auth/callback`

This is the only REST endpoint in the system. It handles the Supabase Auth OAuth callback.

- Path: `/api/auth/callback`
- Method: `GET`
- Query params: `code` (OAuth code from Discord via Supabase)
- Action: Exchange code for Supabase session, set cookie, redirect to Dashboard.
- This endpoint is implemented in the Next.js frontend (`/app/api/auth/callback/route.ts`), not in NestJS. NestJS has no REST routes.

#### 4.2.5 Guild Settings Management

- Persist guild settings to Supabase via Supabase Admin SDK.
- On settings update: save to Supabase, then publish to Redis `backend:{guildId}:settings:update` for Bot (Connected Mode) to refresh cache.
- Expose settings read/write via Socket.io events (`settings:get`, `settings:update`) for Server Owner role.

---

### 4.3 Frontend (`nextjs/`)

#### 4.3.1 Layout

- Sidebar (240px fixed width): Guild selector, navigation links, user identity, connection status indicator.
- Main area: two-column split.
  - Left column (~55% width): Now Playing panel with album art, track metadata, playback controls, progress bar, volume slider.
  - Right column (~45% width): Queue panel (scrollable list) + Search panel (input + results).
- Playback controls are always visible — never inside a scroll container.

#### 4.3.2 Socket.io Client

- Single Socket.io connection per browser session, established after successful auth.
- On connection: emit `state:request` for current guild to hydrate initial state.
- Connection lifecycle: connect → join guild room → hydrate state → listen for events.
- On disconnect: show reconnecting indicator in sidebar, queue updates locally and replay on reconnect.
- `socket.io-client` is the only real-time library used.

#### 4.3.3 Supabase Client Auth

- Uses `@supabase/ssr` package for Next.js App Router.
- Auth flow initiates from Dashboard: redirect to Supabase Auth with Discord OAuth provider.
- On callback (`/api/auth/callback`): Supabase exchanges code for session, stores JWT in cookie.
- JWT from cookie is attached to Socket.io handshake `auth.token` field on every connection.
- Session refresh is handled transparently by Supabase client.

#### 4.3.4 Now Playing Panel

- Album art (square, no tinted background, no glow, no border).
- Track title (600 weight, 22px), artist (400 weight, 14px, muted color), source badge (YouTube/Spotify/SoundCloud).
- Progress bar: scrubable, shows elapsed / total duration. Updates in real-time via position interpolation between `player:seek` events.
- Controls: Previous (disabled — no history in V6 scope), Play/Pause, Skip, Shuffle (toggle), Loop mode (off/track/queue cycle).
- Volume: slider, range 0–100.
- All controls emit Socket.io events. Optimistic UI update on emit; revert on error response.

#### 4.3.5 Queue Panel

- Scrollable list of upcoming tracks.
- Each queue item: position number, thumbnail, title, artist, duration, requester avatar.
- Drag-to-reorder (mouse and touch). On drop: emit `queue:move`. Optimistic reorder.
- Remove button per item (visible on hover): emit `queue:remove`.
- Jump-to-track button (play at position): emit `player:play` with specific queue index resolved to URI.
- Empty state: "Queue is empty — search for a track to get started."

#### 4.3.6 Search Panel

- Text input with debounce (300ms).
- Results show: thumbnail, title, artist, duration, source icon.
- Click result: emit `queue:add`. Button changes to checkmark for 1 second, then resets.
- Source filter tabs: All / YouTube / Spotify / SoundCloud.
- Search is stateless on the frontend — results are not persisted.

#### 4.3.7 Guild Settings Panel (Server Owner+)

- Music Channel: dropdown of text channels in the guild.
- Volume limit: slider 0–100.
- Save button: emit `settings:update`. Confirm toast on success.

#### 4.3.8 Admin Panel (Admin+)

- System Stats: Lavalink node status, Redis connection status, active guilds count, active voice connections.
- Real-time Logs: scrollable log stream via Socket.io `admin:log` events.
- Playback History: paginated list of recently played tracks per guild.
- Chat History: recent Discord Music Channel messages per guild.

#### 4.3.9 Developer Panel (Developer only)

- Service controls: restart Bot process (via Backend), flush Redis, disconnect/reconnect Lavalink node.
- Active connections: list of connected Dashboard clients by guild.

#### 4.3.10 Connection Status Indicator

- Sidebar footer shows real-time connection state: Connected (accent color) / Reconnecting (muted, spinner) / Disconnected (muted).
- Bot mode indicator: "Connected Mode" or "Standalone Mode" (received from `state:full` payload).

---

## 5. Data Model

### 5.1 Supabase (Persistent — Source of Truth)

**`guilds` table**

| Column | Type | Description |
|--------|------|-------------|
| `id` | `text` PRIMARY KEY | Discord Guild (server) ID |
| `name` | `text` | Guild display name |
| `music_channel_id` | `text` NULLABLE | Discord text channel ID for bot notifications |
| `volume_limit` | `integer` DEFAULT 100 | Maximum allowed volume (0–100) |
| `created_at` | `timestamptz` | Row creation timestamp |
| `updated_at` | `timestamptz` | Last update timestamp |

**`users` table** (managed by Supabase Auth)

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PRIMARY KEY | Supabase Auth user ID |
| `discord_id` | `text` UNIQUE | Discord user snowflake ID |
| `username` | `text` | Discord username |
| `avatar_url` | `text` NULLABLE | Discord avatar URL |
| `role` | `enum('user','server_owner','admin','developer')` DEFAULT `'user'` | System role |
| `created_at` | `timestamptz` | Row creation timestamp |

**`guild_members` table**

| Column | Type | Description |
|--------|------|-------------|
| `guild_id` | `text` FK → guilds.id | Discord Guild ID |
| `user_id` | `uuid` FK → users.id | Supabase user ID |
| `guild_role` | `enum('member','owner')` | Role within this guild |

**`playback_history` table**

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PRIMARY KEY | Row ID |
| `guild_id` | `text` FK → guilds.id | Guild where track was played |
| `requester_id` | `uuid` FK → users.id | User who queued the track |
| `track_title` | `text` | Track title |
| `track_artist` | `text` | Track artist |
| `track_uri` | `text` | Source URI |
| `source` | `enum('youtube','spotify','soundcloud')` | Track source |
| `duration_ms` | `integer` | Track duration in milliseconds |
| `played_at` | `timestamptz` | When the track started playing |

### 5.2 Redis (Temporary State — In-Flight Only)

Redis holds no persistent data. All data in Redis is ephemeral and can be lost without data corruption — Supabase is always the authoritative store.

| Key / Channel Pattern | Content | TTL |
|----------------------|---------|-----|
| `bot:{guildId}:player:*` | Pub/Sub channels — Bot publishes events | N/A (pub/sub) |
| `backend:{guildId}:*` | Pub/Sub channels — Backend publishes commands | N/A (pub/sub) |
| `state:{guildId}` | Latest full PlayerState JSON (optional cache) | 60 seconds |

**PlayerState object** (published via Redis and relayed via Socket.io):

```typescript
interface PlayerState {
  guildId: string;
  botMode: 'connected' | 'standalone';
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;            // 0–100
  loopMode: 'off' | 'track' | 'queue';
  position: number;          // ms
  currentTrack: Track | null;
  queue: Track[];
  voiceChannelId: string | null;
}

interface Track {
  uri: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationMs: number;
  source: 'youtube' | 'spotify' | 'soundcloud';
  requesterId: string;       // Discord user ID
}
```

### 5.3 Local JSON (Queue Snapshot — Transient)

- File path: `./queue-snapshot.{guildId}.json` (relative to bot process working directory).
- Written on SIGTERM/SIGINT before process exit.
- Read on startup, deleted immediately after successful queue restore.
- Not stored in Supabase or Redis. Loss of snapshot file means queue is not recovered on next start — this is acceptable behavior.

**Snapshot file schema**:

```typescript
interface QueueSnapshot {
  guildId: string;
  writtenAt: string;         // ISO 8601 timestamp
  currentTrack: Track | null;
  queue: Track[];
  position: number;          // ms position in current track
}
```

---

## 6. Real-Time Flows

### 6.1 Command Flow (Dashboard → Bot)

A user clicks "Skip" on the Dashboard.

```
1. Dashboard (nextjs/)
   socket.emit('player:skip', { guildId: '123' })

2. Backend Socket.io Gateway (nestjs/)
   Receives 'player:skip'
   Validates JWT from socket.data.user
   Checks user has permission in guild '123'
   redis.publish('backend:123:player:skip', '{}')

3. Bot (discordjs/)
   Redis subscriber receives message on 'backend:123:player:skip'
   Calls lavalink player.skip()
   Lavalink fires trackEnd event → Bot fires trackStart for next track

4. Bot publishes:
   redis.publish('bot:123:player:trackEnd', { track, reason: 'skip' })
   redis.publish('bot:123:player:trackStart', { track, position: 0 })
   redis.publish('bot:123:queue:update', { queue: [...] })

5. Backend Redis subscriber
   Receives 'bot:123:player:trackEnd'
   Translates → server.to('guild:123').emit('player:trackEnd', payload)

   Receives 'bot:123:player:trackStart'
   Translates → server.to('guild:123').emit('player:trackStart', payload)

   Receives 'bot:123:queue:update'
   Translates → server.to('guild:123').emit('queue:update', payload)

6. Dashboard (nextjs/)
   Socket receives 'player:trackStart' → updates Now Playing panel
   Socket receives 'queue:update' → updates Queue panel
```

### 6.2 State Flow — Discord Slash Command

A Discord user types `/play https://...` in a server.

```
1. Discord user sends slash command in Discord client

2. Bot (discordjs/)
   Discord.js fires interactionCreate
   Bot resolves track via Lavalink search
   Adds track to queue, starts playback if queue was empty
   Publishes:
     redis.publish('bot:123:queue:update', { queue: [...] })
     redis.publish('bot:123:player:trackStart', { track, position: 0 })

3. Backend → Dashboard (same as steps 5–6 above)
   All connected Dashboard clients in guild '123' see updated queue and Now Playing
```

### 6.3 Dashboard Initial State Hydration

A user opens the Dashboard after successful login.

```
1. Dashboard
   Supabase session cookie is valid → JWT attached to socket handshake
   socket.connect()

2. Backend Gateway
   Validates JWT
   Determines guild membership from user record
   socket.join('guild:123')
   Emits 'connect:ready' with user data and guild list

3. Dashboard
   User selects guild (or auto-selects first guild)
   socket.emit('state:request', { guildId: '123' })

4. Backend
   redis.publish('backend:request:state:123', '{}')

5. Bot
   Receives 'backend:request:state:123'
   Constructs full PlayerState
   redis.publish('bot:123:state:full', { ...playerState })

6. Backend
   Receives 'bot:123:state:full'
   server.to('guild:123').emit('state:full', playerState)

7. Dashboard
   Receives 'state:full'
   Hydrates Now Playing panel, Queue panel, volume, loop mode, bot mode indicator
```

### 6.4 Queue Recovery Flow

```
1. Bot receives SIGTERM
   Iterates all active guild players
   For each guild: writes QueueSnapshot to ./queue-snapshot.{guildId}.json
   Gracefully disconnects from Lavalink
   Process exits

2. Bot restarts
   On startup: scans working directory for queue-snapshot.*.json files
   For each snapshot file found:
     Parses JSON
     Restores queue to in-memory queue manager
     Attempts to resume from saved position
     Deletes snapshot file
     Sends message in Discord Music Channel: "Queue restored — {n} tracks"
     If Connected Mode: redis.publish('bot:{guildId}:player:recovering', { trackCount })
     After restore: publishes full state (trackStart, queue:update)
```

---

## 7. Auth Flow

### 7.1 Initial Login

```
1. User visits Dashboard (nextjs/)
   No valid Supabase session cookie → redirect to /login

2. /login page
   User clicks "Sign in with Discord"
   Calls supabase.auth.signInWithOAuth({ provider: 'discord' })
   Browser redirects to Discord OAuth consent screen

3. Discord OAuth
   User grants permission
   Discord redirects to: {NEXT_PUBLIC_SITE_URL}/api/auth/callback?code=...

4. /api/auth/callback (Next.js Route Handler)
   Calls supabase.auth.exchangeCodeForSession(code)
   Supabase returns session with JWT access_token and refresh_token
   Tokens stored in HttpOnly cookies by @supabase/ssr
   Redirect to / (Dashboard home)

5. Dashboard home
   Supabase client reads session from cookie
   JWT available for Socket.io handshake
```

### 7.2 Socket.io Authentication

```
1. Dashboard initiates Socket.io connection
   const socket = io(BACKEND_URL, {
     auth: {
       token: session.access_token   // Supabase JWT
     }
   })

2. Backend Socket.io Gateway — connection middleware
   Extract token from socket.handshake.auth.token
   Call supabase.auth.getUser(token) using Admin SDK
   If invalid/expired: socket.disconnect(true) with error '401'
   If valid: attach user object to socket.data.user
   socket.join('guild:{guildId}')

3. Ongoing — JWT refresh
   Supabase client auto-refreshes token before expiry (using refresh_token cookie)
   Dashboard listens to supabase.auth.onAuthStateChange
   On token refresh: socket.auth.token = newToken; socket.connect() (reconnect with new token)
```

### 7.3 Permission Check (Backend)

Every Socket.io event handler in the Backend verifies:
1. `socket.data.user` exists (auth middleware passed).
2. User's role (`user.role`) meets the minimum required for the event.
3. User is a member of `guildId` in `guild_members` table.

Violation: emit `error` event back to the emitting socket only. Do not broadcast.

---

## 8. Design System

### 8.1 Creative Direction

**North Star**: "The Live Desk" — dark, purposeful, every readout visible at a glance. Nothing decorative. Confidence without verbosity.

**Brand attributes**: Premium, Alive, Direct. Discord-culture energy. Dark and immersive like Spotify, but more expressive.

### 8.2 Color Tokens (oklch)

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `oklch(0.08 0.000 0)` | Application background |
| `panel` | `oklch(0.13 0.000 0)` | Sidebar, toolbar surfaces |
| `card` | `oklch(0.18 0.000 0)` | Now Playing container, queue items, inputs |
| `elevated` | `oklch(0.24 0.000 0)` | Hover states, dropdowns, modals |
| `ink` | `oklch(0.95 0.000 0)` | Primary text |
| `muted` | `oklch(0.58 0.000 0)` | Metadata, timestamps, placeholders |
| `border` | `oklch(0.22 0.000 0)` | Zone separators only |
| `accent` | `oklch(0.66 0.180 195)` | Brand color — cyan-teal |

**The One Accent Rule**: Accent appears on 10% or less of any screen. It signals interactive and live state only. It is forbidden on resting non-interactive elements.

All neutral tokens use chroma `0.000` — no tinting of neutral surfaces.

### 8.3 Typography

Font family: Inter only. No display fonts.

| Role | Weight | Size | Line Height | Letter Spacing |
|------|--------|------|-------------|---------------|
| Title | 600 | 22px | 1.3 | -0.01em |
| Body | 400 | 14px | 1.5 | — |
| Label | 500 | 13px | 1.2 | 0.005em |
| Caption | 400 | 11px | 1.4 | — |

### 8.4 Interaction Rules

- **Focus ring**: `box-shadow: 0 0 0 2px oklch(0.66 0.180 195 / 0.5)` on all interactive elements.
- **Hover**: transition to `elevated` background token, 100ms ease.
- **No backdrop-filter blur** as a surface treatment. This was the core anti-pattern in v5.0.2. Explicitly forbidden.
- **No gradient text fills**.
- **No `border-left` wider than 1px** as a colored accent stripe.
- **No fifth tonal step** between the four defined ones (`panel`, `card`, `elevated`, `bg`).
- **No page-load entrance sequences** (no staggered fade-ins on initial render).
- **Album art**: never has colored backgrounds, tinted surfaces, borders, or drop shadows near it.

### 8.5 Animation

- Duration: 100–200ms for micro-interactions. 200–300ms for panel transitions.
- Easing: `ease` or `cubic-bezier(0.16, 1, 0.3, 1)` for feel.
- All animations must include `@media (prefers-reduced-motion: reduce)` fallback that removes motion.

---

## 9. Non-Functional Requirements

### 9.1 Accessibility

- WCAG AA minimum across all Dashboard screens.
- Color contrast ratio: 4.5:1 minimum for body text against background.
- Keyboard navigation: full keyboard access for playback controls (play/pause, skip, seek) and queue management (add, remove, reorder).
- Screen reader: all interactive controls have accessible labels. Progress bar has `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Focus indicators visible on all interactive elements.
- Drag-to-reorder in Queue panel has a keyboard alternative (move up/move down buttons).

### 9.2 Reduced Motion

All CSS animations and transitions must be wrapped or overridden with:

```css
@media (prefers-reduced-motion: reduce) {
  /* remove transitions, replace with instant state changes */
}
```

This applies to: track change transitions, progress bar interpolation, drag feedback, queue reorder animations, connection status indicator.

### 9.3 Real-Time Performance

- Target latency from Dashboard command emit to Bot action: under 200ms on local network.
- Target latency from Bot event to Dashboard UI update: under 500ms on local network.
- Progress bar position must interpolate smoothly between server updates using client-side timer. Do not rely on server push for every progress tick.

### 9.4 Self-Hosted Deployment

Narze V6 is designed for self-hosting. All three apps and their dependencies must be runnable on a single machine.

**Required services**:
- Node.js 20+
- Redis 7+
- Lavalink (Java 17+)
- Supabase project (hosted or self-hosted)

**Configuration** (environment variables):

Bot (`discordjs/.env`):
- `DISCORD_TOKEN` — Bot token
- `CLIENT_ID` — Application client ID
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- `REDIS_URL` — Redis connection string (optional — absence triggers Standalone Mode)
- `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`

Backend (`nestjs/.env`):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `PORT` — NestJS listen port (default: 3001)

Dashboard (`nextjs/.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BACKEND_URL` — Socket.io Backend URL
- `NEXT_PUBLIC_SITE_URL` — Dashboard public URL (for OAuth callback)

### 9.5 Error States

- Socket disconnected: show reconnecting indicator, queue user actions locally.
- Bot offline (no events from bot in guild): show "Bot offline" in Now Playing panel.
- Lavalink unreachable: Bot logs error, sends message in Music Channel, publishes error event to Redis.
- Auth expired: Supabase client auto-refreshes; if refresh fails, redirect to /login.
- Track load failure: emit `error` event to Dashboard with track info and reason. Show inline error in queue at failed track position.

### 9.6 Bundle and Performance

- Dashboard initial JS bundle: target under 250KB gzipped.
- `socket.io-client` adds approximately 14KB gzipped — accounted for in budget.
- No server-side rendering of real-time state — all player state is client-side after hydration.
- Next.js App Router with React Server Components for static shells; client components only where Socket.io state is consumed.

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **Guild** | A Discord server instance. All state (queue, settings, player) is scoped per Guild. One bot can serve multiple Guilds simultaneously. |
| **Music Channel** | A Discord text channel designated per Guild for bot notifications. Configured by Server Owner, stored in Supabase, cached locally by bot. |
| **Bot** | The Discord.js process (`discordjs/`). Pure music engine — handles audio playback via Lavalink, queue management, and Discord interactions. Works independently without Backend. |
| **Backend** | The NestJS process (`nestjs/`). Optional extension layer — bridges Dashboard to Bot via Redis, manages Auth via Supabase, exposes real-time state to Dashboard via Socket.io. Bot functions fully without it. |
| **Dashboard** | The Next.js frontend (`nextjs/`). Web UI for controlling the Bot. Communicates exclusively via Socket.io to Backend. Requires Backend to be running. |
| **Connected Mode** | Bot runtime state when Redis is reachable on startup. Bot receives settings from Backend via Redis, publishes player events for Dashboard sync. Supabase is still the source of truth. |
| **Standalone Mode** | Bot runtime state when Redis is unreachable on startup. Bot fetches settings directly from Supabase. Music playback works fully; Dashboard sync is unavailable. |
| **Source of Truth** | Supabase is always the authoritative store for persistent data (guild settings, users). Both modes ultimately read from Supabase. No sync problem exists between modes. |
| **Queue Recovery** | Process where Bot saves current queue to local JSON before shutdown, then restores it on next startup. Bot notifies Discord Music Channel and publishes `bot:{guildId}:player:recovering` to Redis (if Connected Mode) during restore. |
| **Queue Snapshot** | Local JSON file written by Bot before shutdown. Deleted after successful recovery. Not stored in Redis or Supabase. |
| **Player State** | Current playback snapshot: now playing track, position, volume, loop mode, queue list. Owned by Bot, replicated to Dashboard via Redis to NestJS to Socket.io. |
| **IPC** | Inter-Process Communication. In V6, IPC between Bot and Backend is Redis Pub/Sub. |
| **Lavalink** | Audio server that handles audio decoding and streaming. Bot communicates with Lavalink to play tracks from YouTube, Spotify, and SoundCloud. |
