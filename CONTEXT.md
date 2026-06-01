# Narze V6 — Glossary

## Guild
Discord server instance. All state (queue, settings, player) is scoped per Guild. One bot can serve multiple Guilds simultaneously.

## Music Channel
A Discord text channel designated per Guild for bot notifications (e.g. queue recovery messages). Configured by Server Owner, stored in Supabase, cached locally by bot.

## Bot
The Discord.js process (`discordjs/`). Pure music engine — handles audio playback via Lavalink, queue management, and Discord interactions. Works independently without Backend.

## Backend
The NestJS process (`nestjs/`). Optional extension layer — bridges Dashboard ↔ Bot via Redis, manages Auth via Supabase, exposes real-time state to Dashboard via Socket.io. Bot functions fully without it.

## Dashboard
The Next.js frontend (`nextjs/`). Web UI for controlling the Bot. Communicates exclusively via Socket.io to Backend. Requires Backend to be running.

## Connected Mode
Bot runtime state when Redis is reachable on startup. Bot receives settings from Backend via Redis, publishes player events for Dashboard sync. Supabase is still the source of truth — Backend reads from it and delivers via Redis.

## Standalone Mode
Bot runtime state when Redis is unreachable on startup. Bot fetches settings directly from Supabase. Music playback works fully; Dashboard sync is unavailable.

## Source of Truth
Supabase is always the authoritative store for persistent data (guild settings, users). Both modes ultimately read from Supabase — Connected mode via NestJS→Redis, Standalone mode directly. No sync problem exists between modes.

## Queue Recovery
Process where Bot saves current queue to local JSON before shutdown, then restores it on next startup. Bot notifies Discord Music Channel and publishes `bot:{guildId}:player:recovering` to Redis (if Connected Mode) during restore.

## Queue Snapshot
Local JSON file written by Bot before shutdown. Deleted after successful recovery. Not stored in Redis or Supabase.

## Player State
Current playback snapshot: now playing track, position, volume, loop mode, queue list. Owned by Bot, replicated to Dashboard via Redis → NestJS → Socket.io.

## Invalid Player State
Player State that the Bot cannot safely publish because playback identity data is malformed. Examples include an invalid current track, a malformed queue, or queue items missing required identity such as track URI, source, or requester.
