# Narze v5 feature inventory: the rebuild spec

**Purpose.** This is the only spec for rebuilding Narze v5 from scratch on Next.js, NestJS, discord.js, Supabase and Redis. It lists every capability the current system has, so the rebuild can preserve each one. It also lists the bugs, quirks and security holes, which the rebuild should fix rather than copy.

**Source surveyed.** `D:\Github\narzev5.0.2`, branch `v5.0.2`, HEAD `4a6faf06` ("feat: complete PRD #26 — requester metadata pipeline"). The survey was read-only and done on 2026-11-08. Nothing was compiled or run. `.cloudflared/` and `.env` files were not opened; only `.env.example` was read. All secrets are redacted.

**How to read this.**
- Sections 1–9 describe current behaviour.
- Section 10 lists bugs and quirks to fix. Do not preserve them.
- Section 11 is the numbered acceptance checklist.
- Each part keeps the numbering from its source survey. A reference such as "§3.10" or "see §19" inside a part points to that part's own numbering, so read it relative to the enclosing top-level section.
- File paths are relative to `bot/` or `dashboard/` unless stated otherwise. `file:line` citations refer to commit `4a6faf06`.
- **RECONSTRUCT — source missing** marks behaviour inferred from call sites and docs, because the implementing file is not in the repository (see 0.2).

---

## 0. Cross-cutting facts to read before anything else

1. **The audio client is the npm package `riffy`, not the vendored `sinsacord`.** `functions/lavalink/manager.ts:1` and `interfaces/client.ts:2` import `{ Riffy } from "riffy"`. Nothing imports `bot/src/lib/sinsacord` or `bot/src/lib/sinsacord-filters`, so both are dead code: an Erela.js-style port to Lavalink v4 with filter presets. Section 2 (part §9) describes them for reference only. No audio filters are exposed to users anywhere.
2. **`bot/src/functions/cache/` is missing from the repository.** The root `.gitignore` rule `cache/` matched this *source* directory, so none of its files was ever committed: `autocompleteCache`, `billboardCache`, `historyCache`, `queueCache`, `userCache`, `playlistCache` and `searchResultCache`. They are absent from disk and from `git log --all`. **The v5 tree cannot compile or run as checked out.** Every contract that depends on these modules is marked RECONSTRUCT. The rebuild should put these caches in Redis and must not ignore source folders named `cache`.
3. **The bot HTTP API has no authentication.** It checks no API key, bearer token or session. The caller's identity is self-asserted, through `req.body.user.discordId` or `?userId=`. `checkControlPermission` (`api/middleware/auth.ts:16-19`) **skips the check when `user` is absent** and **allows the request when the check throws** (`:36-40`). The admin endpoints are fully open, including `restart`, `shutdown`, reading any channel's messages and the user cache. CORS is `*`.
4. **ADR 0001 is not implemented.** The ADR says the bot verifies the admin/developer role through the Firebase whitelist. No such code exists in the bot (verified in `api/middleware/auth.ts`, and the bot contains no `adminWhitelist`/`isAdmin` references). Admin gating exists only in the dashboard UI. The dashboard's `/api/admin/whitelist` route is itself unauthenticated, so anyone can grant themselves `developer`. The rebuild must make the server-side role check real.
5. **Some documented features do not exist in the code.** The rebuild should not treat these as preserve requirements unless product asks for them:
   - There is no auto-leave timer. The only automatic leave is `queueEnd → destroy()` when 24/7 is off.
   - The now-playing message has no buttons, and it is never edited or deleted.
   - There are no prefix (message) commands. The `Prefix` Prisma model, `messageCommands` collection and `MessageContent` intent are unused.
   - No WebSocket server exists. Realtime is SSE only, so `docs/websocket-implementation.md` is stale.
   - There is no `reconnect` terminal command and no `LAVALINK_RECONNECT_MODE`/`LAVALINK_RECONNECT_TRIES`, although `project_architecture.md` and `paper.md` describe them.
   - There is no MongoDB "SavedQueue". The queue backup is the on-disk Queue Cache.
   - There is no Zustand store in use. The package is installed but not imported.
   - The admin terminal page streams logs only. It cannot send commands.
   - There are no dashboard controls for loop, shuffle, play-next or add-to-playlist. The bot API supports loop and shuffle.
   - Playlists cannot be renamed and their tracks cannot be edited.
6. **The databases in actual use** (details in §5):
   - **Firestore:** `users`, `adminWhitelist`, `playlists`, and four paths under `playHistory`. Those are per-guild user history, global user history, server history and `playHistory/{guildId}/sessions/{sessionId}`.
   - **MongoDB via Prisma:** `GuildSettings` (`musicChannelId`, `ownerId`) and an unused `Prefix` model.
   - **Local JSON files under `bot/cache/`:** the queue backup, the sessions backup, and the Spotify, YouTube and category caches.
   - **Supabase:** not used. It is the target state set by ADR 0002.
7. **Secret in source.** `bot/src/functions/spotify/spotifyClient.ts:10-11` hardcodes a Spotify client id and secret. **Rotate them**, and in the rebuild load all credentials from the environment. The values are not reproduced here.
8. **Several bot routes are dead because two copies exist.** `server.ts:133` registers the modular `api/routes/*` routers before the inline routes in `server.ts`. Where both define the same path, the router version answers and the inline copy is dead. In some cases the dead inline copy is the richer one: `GET /api/guilds`, `GET /api/user/:userId/sessions`, and `POST /play` in `queue.routes.ts`. §3 lists the diffs so the rebuild can choose deliberately.
9. **A v6 rebuild has already been started in the same Git repository.** The branches `origin/v6` and `origin/v6-webapp` contain commits including "initialize V6 architecture with planning docs and boilerplate", "Add bot Redis bootstrap foundation", "initial dashboard with auth" and "search bridge, auth persistence, queue drag-to-reorder", with a NestJS project under `v6/nestjs`. This survey did not read those branches. Compare them with this spec before duplicating work.
10. **The UI language is Thai.** Bot embeds, dashboard strings and `th-TH` date formatting are all in Thai. The Spotify market is `TH`.

### 0.1 Component map (current → rebuild)

| Current v5 | Role | Rebuild target |
|---|---|---|
| `bot/` Bun + TypeScript, discord.js, `riffy` → Lavalink 4.2.2 (plugins: youtube-plugin 1.18.1, lavasrc 4.8.3, lavasearch 1.0.0 — lavasearch is unused) | Discord client, player, slash commands | NestJS + discord.js + a Lavalink client |
| `bot/src/api/` Express 5 on port 3001 (REST + SSE) | Dashboard backend | NestJS controllers + SSE gateway, with real auth |
| `bot/src/handlers/terminal*` stdin REPL | Operator console | NestJS console/CLI module (§9) |
| `dashboard/` Next.js 15.1, React 19, Tailwind, shadcn/ui, framer-motion, Firebase Auth + Firestore | Web UI; also calls bot endpoints directly from the browser | Next.js + Supabase Auth, calling NestJS |
| Firestore + MongoDB + JSON files under `bot/cache/` | Persistence | Supabase Postgres (durable) + Redis (caches, queue backup, write-behind buffers) |

---

## 1. Slash / prefix commands


Source root: `D:\Github\narzev5.0.2\bot\src`. All paths below relative to it unless noted.
No secrets found in `config/config.json` (nothing to redact).

---

### 0. Global facts

- **Slash commands only.** 18 commands: `cache`, `ping`, `setchannel` (root `commands/`), and 15 in `commands/lavalink/`: `247`, `clear`, `join`, `leave`, `loop`, `pause`, `play`, `playat`, `playnext`, `playqueue`, `queue`, `seek`, `skip`, `skipplay`, `volume`.
- **No prefix / message commands exist.** Evidence:
  - No `messageCreate` listener anywhere in `src/` (grep).
  - `client.messageCommands = new Collection()` (`index.ts:41`, typed in `interfaces/client.ts:7`) is allocated but never populated or read.
  - `GatewayIntentBits.MessageContent` is requested (`index.ts:32`) but unused for commands.
  - Prisma model `Prefix { id ObjectId, guild_id String, prefix String?, createdAt, updatedAt }` exists in `bot/prisma/schema.prisma:17` but `prisma.prefix` is never referenced in code → legacy/dead.
- **No context-menu commands** defined (interactionCreate accepts them, none exist).
- **No cooldowns** anywhere. No global rate limit per user.
- **No owner-only / bot-owner checks** in any slash command. Only Discord perm gate: `setchannel` (`default_member_permissions: ManageGuild`).
- **Music-channel restriction (setchannel) is NOT enforced by any slash command.** `GuildSettings.musicChannelId` is only read by the dashboard API (`api/routes/player.routes.ts:54-55`, `api/server.ts:941-951`, `api/routes/queue.routes.ts:338-342`) to pick the text channel when playback starts from the dashboard (fallback = voice channel id). Slash commands always use `interaction.channel` as the player's textChannel.
- Command object shape: `{ name, description, type: ApplicationCommandType.ChatInput, options?, default_member_permissions?, autocomplete?(client, interaction), run(client, interaction) }`. The whole object (incl. functions) is passed to `client.application.commands.set` (discord.js strips unknown keys).
- Language: all user-facing strings Thai (except `ping`, `247` description, "bot not ready" string, generic error string).
- Colors: success `configjson.embed_color` = `#e4854a`; failure `configjson.embed_fail` = `#FF0000`.
- Standard error embed format: description `` > `❌` <Thai message> `` (backticked emoji), color embed_fail, **ephemeral** (`flags: MessageFlags.Ephemeral`).
- Standard "manager not ready" guard at start of every lavalink command: `if(!client.manager.initiated) return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: Ephemeral })` (plain content, not embed).

#### Lavalink client
- Runtime manager = npm **`riffy` ^1.0.12** (`functions/lavalink/manager.ts:1`, `bot/package.json:33`). The vendored `src/lib/sinsacord` (Erela-style Manager/Node/Player/Queue) is **not imported by any command** (only 2 riffy imports in src; zero imports of lib/sinsacord outside itself). Note: `node_modules/riffy` not present locally — semantics below are Riffy's documented behavior.
- `ManagerCreate()` (`manager.ts:10-34`): single node from env `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASS`, `LAVALINK_SECURE==='true'`; options `defaultSearchPlatform: config.lavalink_config.default_search_platform` ("spsearch"), `restVersion: "v4"`, `reconnectTimeout: 5000`, `reconnectTries: 20`, `bypassChecks.nodeFetchInfo: true`, `send(payload)` → `guild.shard.send(payload)`.
- `loadTracks(query, member)` = `client.manager.resolve({ query, requester: member })` → requester (GuildMember) is attached to every resolved track (`track.info.requester`). This is the only "metadata like requester" added; plus playlist metadata (see below).
- `playerCreate(guild, textChannel, voiceChannel)` (`manager.ts:40-88`, **synchronous**): if player exists → if `!connected` call `connect()`; return existing. Else `createConnection({ guildId, textChannel: textChannel.id, voiceChannel: voiceChannel.id, deaf: true, mute: false })` and after **1000 ms** `setTimeout` call `connect()` if still not connected. Throws on failure.
- `client.manager.get(guildId)` (Riffy) **throws** when no player → several commands rely on try/catch around it for the "no player" message. `client.manager.players.get()` returns undefined instead. Commands mix both styles.
- Player state flags via Riffy `player.set(key,val)/get(key)` (consumed by events — see §6).

---

### 1. Loader / registration / routing

#### `handlers/loader.ts`
`Handlers()` → `LoadEvents()` then `LoadCommands()` (neither awaited). Called from `index.ts` right after `client.login(...)`.

#### `handlers/push.ts` — `LoadCommands()` (async)
- Reads `__dirname/../commands`. For each item: if directory → import every `.ts`/`.js` file in it (one level deep only); if file `.ts`/`.js` → import directly.
- Uses dynamic `await import(path)`; registers `client.commands.set(command.default.name, command.default)`. Missing default export in a subfolder logs `[COMMAND] Failed to load: <dir>/<file>`; at root level silently skipped.
- Logs `[COMMAND] Loaded: <name> (from <dir>/<file>)`, then `[COMMAND] Loaded N command(s)`. Errors caught and logged.

#### `handlers/events.ts` — `LoadEvents()`
- Guard `eventsLoaded` (module-level bool) to prevent double load ("Events already loaded, skipping...").
- Walks `../events` (one level of subfolders, e.g. `events/lavalink/`), for each `.ts/.js`: `delete require.cache[require.resolve(path)]` (hot-reload support) then `require(path)`. Each event file self-registers via `client.on(...)` at import time (files guard with `client.listenerCount(x) === 0`).
- Logs count.

#### Registration (`events/ready.ts:98-102`)
- On `clientReady`: `client.application.commands.set([...client.commands.values()])` → **GLOBAL registration**, every startup, no guild-scoped registration, no diffing. Logs `[SYSTEM] Commands set!`.
- Other ready work (context, not commands): starts TerminalInput, `client.manager.init(client.user.id)`, `initQueueCacheOnStartup()`, `setClientReference`, `restoreSessionsOnStartup()`, `initUserCache()`, after 5000 ms `restoreQueuesFromBackup(client, client.manager)`; creates missing `GuildSettings` per guild with `ownerId = guild.ownerId`; rotating presence every 15000 ms, `type: 4` (custom), status `idle`, activities list: `🛠️ Developing | xeno.2004`, `🛠️ (Final Phase) | xeno.2004`, `🛠️ Update v4 | xeno.2004`, `🎧 /play <input>`, `✅ Youtube | xeno.2004`, `✅ Youtube Music | xeno.2004`, `✅ Spotify | xeno.2004`, `✅ SoundCloud | xeno.2004`, `✅ Twitch | xeno.2004`, `🤝 ${members} users used`, `🔊 ${channels} channels active` (counts computed once at ready).

#### `events/interactionCreate.ts` — routing
1. Ignore everything where `!interaction.guild` (DMs get **no response**).
2. **Autocomplete**: `client.commands.get(commandName)`; if has `autocomplete` → `await command.autocomplete(client, interaction)`; errors logged `Autocomplete error:`; return.
3. **Command / context-menu**: `command.run(client, interaction)`.
   - After success: **dashboard promo** with 30% chance (`Math.random() < 0.3`) if commandName in `['play','skip','pause','volume','loop','clear','seek','247','queue','leave']` → `interaction.channel.send` (NOT a reply, public, never auto-deleted) embed color embed_color, description:
     `-# สามารถควบคุมจาก [Dashboard](https://dashboard.narze.space/) ได้แล้ว ง่ายกว่าใช้คำสั่งเยอะ ลองใช้เลย! \n - https://dashboard.narze.space/` (errors swallowed).
   - On throw: `console.error`, then `interaction.reply({ content: "There was an error while executing this command!", flags: Ephemeral })` (no replied/deferred check).
   - **Always (success or error) logs usage** to a log channel: guild `process.env.LOG_GUILD_ID`, channel `process.env.LOG_CHANNEL_ID`. Embed: color embed_color, author `{ name: "View User", iconURL: user avatar, url: https://discord.com/users/<id> }`, description:
     ```
     User: `tag`(`id`)
     UserChannel: `<voice channel name | 'Not in voice'>`(`<id | 'N/A'>`)
     Command: `commandName`(`commandId`)
     Channel: `textChannel.name`(`id`)
     Server: `guild.name`(`guild.id`)
     ```
     thumbnail guild icon, timestamp. Sent only if `logChannel?.isTextBased()`.
   - Console: `[COMMAND] <tag> Used <cmd> in <guild>(<id>)`.
4. **No button / select-menu / modal routing** in interactionCreate. The only components in the bot are the `/queue` pager buttons, handled by a per-message collector inside `queue.ts` (customIds `queue_prev`, `queue_page_info`, `queue_next`). Unhandled component interactions after the collector expires → Discord "interaction failed" (buttons are disabled at expiry, so normally not clickable).
- `client.interactions` (Collection) is written by `/play` (`client.interactions.set('play', {interaction, command:'play', query, guild, member, timestamp})`, `play.ts:222`) but **never read** anywhere.

#### `handlers/guildUtils.ts` (terminal helpers, not slash)
- `listGuildsAndChannels(client)`: console-prints each guild (name, id, memberCount), voice channels (type 2) with member counts, text channels (type 0) with ✅/❌ SendMessages permission.
- `findGuildByName(client, name)`: case-insensitive substring match on guild name; logs and returns guild or null.
- `findVoiceChannelByName(client, guildId, channelName)`: case-insensitive substring among type-2 channels.
- Used by `handlers/terminalCommands.ts` (terminal/stdin commands `play`, `stop`, `skip`, `leave`, `status`, `list`/`guilds`, `find`, `help` — separate section; not slash).

---

### 2. Shared helpers used by commands

#### `functions/lavalink/voicePermissions.ts`
- `checkVoicePermissions(vc, botMember)` → `{ canJoin = Connect && Speak && ViewChannel, hasConnect, hasSpeak, hasViewChannel, missingPermissions: ["View Channel","Connect","Speak"] subset, detailMessage: "บอทไม่มีสิทธิ์: <list>" | "บอทมีสิทธิ์ครบถ้วน" }`.
- `hasBasicVoicePermissions(vc, botMember)` → bool (ViewChannel+Connect+Speak).
- `checkVoiceChannelLimits(vc, botMember)` → `{ isFull = userLimit>0 && members.size>=userLimit, userLimit, currentUsers, canBypassLimit = ManageChannels, canJoinDespiteFull = !isFull || ManageChannels, limitMessage: "ห้องเสียงเต็ม (n/limit)" | null }`.
- `checkVoiceChannelAccess(vc, botMember)` → `{ canAccess = canJoin && canJoinDespiteFull, errorMessage, permissions, limits }`. **Used by join, play, playat, playnext** (NOT by skipplay/playqueue). Commands ignore `errorMessage` and show their own generic text.
- `getVoicePermissionErrorMessage(vc, botMember)` → `` > `❌` <errorMessage> ในห้อง <#vc> `` (unused by commands).

#### `functions/lavalink/iconConfig.ts` (embed author icon)
- `IconType = 'botavatar' | 'userimage' | 'playlist_thumbnail' | 'artistImage'`. Config `icon_config = { normal_track, playlist_display, playlist_track }`.
- `getIconURL(track, userAvatar, isPlaylistDisplay=false)` (async): choose type: playlist_display if flag; else `playlist_track` if `isFromPlaylist(track)`; else `normal_track`. defaultIcon = `client.user.displayAvatarURL()` || `https://cdn.discordapp.com/embed/avatars/0.png`.
  - botavatar → defaultIcon; userimage → userAvatar||default; playlist_thumbnail → (if from playlist) `getPlaylistThumbnail(track)`||userAvatar||default, else userAvatar||default; artistImage → `getArtistImage(track.info.author)` (Spotify, `functions/spotify/index`) ||userAvatar||default, errors → userAvatar||default; unknown → default.
- `getPlaylistDisplayIcon(playlistThumbnail, userAvatar, artistName?)` uses `config.playlist_display` with same fallback chain (artistImage requires artistName).
- Current config: normal_track `artistImage`, playlist_display `botavatar`, playlist_track `artistImage`.

#### `functions/convertTime/convertTime.js`
- `convertTime(ms)`: zero-padded; `< 3600000` → `MM:SS`; else `HH:MM:SS` (hours mod 24 — durations ≥24h wrap). Minutes always 2 digits (e.g. `03:25`).
- Also exports `convertNumber(n, decPlaces)` (K/M/B/T abbreviations), `chunk(arr,size)`, `convertHmsToMs(hms)` (BUG: branch `hms.length < 3` references undefined `a` → ReferenceError). Commands only use `convertTime`.

#### `functions/guildSettings.ts` (Prisma/MongoDB, model `GuildSettings { id, guildId @unique, guildName?, ownerId, musicChannelId?, createdAt, updatedAt }`)
- `getGuildSettings(guildId)` → findUnique or null (errors → null).
- `upsertGuildSettings({guildId, guildName?, ownerId, musicChannelId?})` → upsert (errors → null).
- `setMusicChannel(guildId, channelId|null)` → update; returns bool (errors → false; throws not).
- `canUserViewBot(client, guildId, userId)` → any cached guild member can view.
- `canUserControlBot(client, guildId, userId, userVoiceChannelId?)` (dashboard rule set): guild owner → yes; `settings.ownerId` (inviter) → yes; no player → yes iff user in any voice channel; player exists → must be in same VC (`player.voiceChannel`). Reasons strings: 'Guild not found', 'Not a member of this server', 'Server owner', 'Bot owner in this guild', 'No active player - can start playback', 'Join a voice channel to start playback', 'You must be in a voice channel to control the bot', 'In same voice channel', 'You must be in the same voice channel as the bot', 'Error checking permissions'.
- `getUserVoiceChannel(client, guildId, userId)` (cache only), `getTextChannels(client, guildId)` → text-based, non-voice, non-thread `{id,name,type}`.
- These control/view checks are used by the dashboard API, **not** by slash commands.

#### Playlist metadata (`functions/lavalink/playlistMetadata.ts` – other section) used here
- `addPlaylistMetadata(tracks, playlistName, playlistUrl, thumbnailUrl)` → tracks tagged with playlist info; `isFromPlaylist(track)`, `formatPlaylistInfo(track, 'short'|'index-only')`, `getPlaylistUrl(track)`, `getPlaylistThumbnail(track)`.
- `getPlaylistThumbnailMain(url, videoThumbnail?, { method:'auto', fallbackToVideo:true, highQuality:true })` (`functions/youtube/index.ts:19`).
- `validateAndConvertThumbnail(url)` (`functions/lavalink/thumbnailValidator.ts`).

#### Autocomplete cache — `functions/cache/autocompleteCache.ts` — **RECONSTRUCT: source missing** (dir `functions/cache/` excluded by `.gitignore` `cache/`, never committed)
Contract inferred from call sites + `bot/docs/autocomplete-cache.md`:
- `getCache(key): Choice[] | null`, `setCache(key, choices)`, `clearAllCache()`, `getCacheStats(): { totalFiles: number, totalSize: bytes, oldestFile: Date|null }`.
- File-based: dir `cache/`, filename = MD5 hash of key + `.json`; file body `{ data, timestamp, query }`.
- `CACHE_EXPIRY = 30 min` (expired file deleted on read); `MAX_CACHE_SIZE = 1000` files; cleanup on every write (delete expired, then oldest beyond limit).
- Key format (all commands): `autocomplete_${default_search_platform}_${query}` (raw query, case-sensitive, not trimmed).
- Also missing: `functions/cache/queueCache.ts` (`updateQueueCache(guildId, {guildName, voiceChannelId, textChannelId, twentyFourSeven})`, `initQueueCacheOnStartup`, `restoreQueuesFromBackup`, `setClientReference`) and `functions/cache/userCache.ts` (`initUserCache`).

#### SSE (`api/utils/sse.ts`)
- `incrementQueueRevision(guildId)` and `broadcastToGuild(guildId, 'queueUpdate', { queue })`. Called by `clear`, `play`, `playnext` only. Queue item format (`formatQueueTracks`, duplicated in play.ts:15 & playnext.ts:15):
  `{ title: info.title||'Unknown', author: info.author||'Unknown Artist', duration: info.length||0, thumbnail: info.artworkUrl||info.thumbnail||undefined, requesterAvatar: requester.user.displayAvatarURL() || requester.displayAvatarURL() || undefined, requesterName: requester.user.username || requester.username || undefined }`.

---

### 3. Shared autocomplete algorithm for `play`, `playnext`, `playat` (query), `skipplay`

Option `query` (String, required, autocomplete). On each keystroke (no debounce besides Discord's own):
1. Empty query → `[{ name: 'กรุณาระบุเพลง', value: 'no_song' }]`.
2. Cache check `getCache(key)` → if hit, `respond(cached)` and return. (play/playnext check cache for both URL and text; playat/skipplay check inside each branch — same effect.)
3. If query `startsWith('https://')`:
   - contains `deezer` or `music.apple` → `[{ name: 'ไม่รองรับ Platform นี้', value: 'error' }]`.
   - else `loadTracks(query, member)`:
     - loadType `error` | `no_results` → `[{ name: '(ข้อผิดพลาด) กรุณาใส่ URL ที่ถูกต้อง', value: 'error' }]`.
     - `playlist` → if `playlistInfo.name` includes `'Mix - '`: display name = name.replace('Mix - ','สถานีวิทยุ') and set module-level `mix = true`. Value: if mix → raw query; else if query includes `list=` and (`youtube`|`youtu.be`) → `https://music.youtube.com/playlist?list=<everything after first "list=">`; else raw query. Name: `(${tracks.length} เพลง) ${displayName}` sliced to 100.
     - single track and query includes `music.youtube` → name `(${author}) ${title}`.slice(0,100), value = **name + query**.
     - single track and query includes `youtu.be`|`youtube`|`spotify` → name `(${author}) ${title}`, value = `tracks[0].info.uri || query`.
     - other URLs (e.g. SoundCloud, Twitch) that resolve to a track → **no choice pushed** (empty list).
4. Else (text) → `loadTracks(query, member)` (search with default platform spsearch); first `min(config.autocomplete_results_limit=7, n)` tracks → `{ name: '(author) title'.slice(0,100), value: '(author) title'.slice(0,100) + track.info.uri }`. None → `[{ name: 'ไม่พบเพลงที่ค้นหา', value: 'error' }]`.
5. Save to cache if non-error (play/playnext: `!choices[0].value.includes('error')`; playat/skipplay: `!choices.some(c => c.value === 'error')`).
6. Exception → `[{ name: 'เกิดข้อผิดพลาดในการค้นหา', value: 'error' }]`. `respond(choices)` errors swallowed. playat slices to 25.
- **skipplay** additionally first checks: no player or (!playing && !paused) → `[{ name: 'ไม่มีเพลงก่อนหน้า ไม่สามารถใช้ skipplay ได้', value: 'nobeforsong_error' }]`.

Shared run-time query normalization (play/playat/playnext/skipplay):
- If module-level `mix` true → use query as-is and reset `mix=false`.
- Else if query includes `list=` and (`youtube`|`youtu.be`) → `https://music.youtube.com/playlist?list=<after "list=">` (keeps any trailing `&index=...` params).
- Sentinel values: `no_song` → `กรุณาระบุเพลง`; `error` → `กรุณาระบุเพลงที่ถูกต้อง`; contains `deezer`/`music.apple` → `ไม่รองรับ Platform นี้`. All ephemeral fail embeds.
- YouTube links are rewritten to YouTube Music: `track.info.uri.replace('www','music')` when uri includes `youtube` (all tracks of playlists too).

---

### 4. Per-command specification

#### `/ping` (`commands/ping.ts`)
- Description `"Ping command"`. No options.
- `deferReply()` (public) → `fetchReply()`; embed color embed_color, title `🏓 |  Ping Status` (two spaces), thumbnail `https://i.gifer.com/fyMe.gif`, inline fields: `Reply Latency` = `reply.createdTimestamp - interaction.createdTimestamp` ms; `Bot Latency` = `|Date.now() - interaction.createdTimestamp|` ms; `API Latency` = `|round(client.ws.ping)|` ms. `editReply`.
- No manager-ready guard, no voice checks.

#### `/cache` (`commands/cache.ts`)
- Description `จัดการ cache ของ autocomplete`. Option `action` (type 3 String, required) choices: `{name:'stats - ดูสถิติ cache', value:'stats'}`, `{name:'clear - ลบ cache ทั้งหมด', value:'clear'}`.
- **No permission restriction** (any member can clear the global cache).
- `stats` → ephemeral embed embed_color, title `📊 Cache Statistics`, inline fields: `📁 จำนวนไฟล์ cache` = `` `N` ไฟล์ ``; `💾 ขนาดรวม` = `` `(bytes/1024).toFixed(2)` KB ``; `📅 ไฟล์เก่าสุด` = `<t:unix:R>` or `ไม่มี`. Footer `Cache จะหมดอายุภายใน 30 นาที`, timestamp.
- `clear` → snapshot stats, `clearAllCache()`, console `[CACHE] Cache cleared by <tag>`; ephemeral embed title `🗑️ Cache Cleared`, desc `✅ ลบ cache ทั้งหมดแล้ว\n\n📊 **ก่อนลบ:**\n• ไฟล์: \`N\`\n• ขนาด: \`X KB\``, timestamp. Error → ephemeral embed_fail title `❌ Error`, desc `เกิดข้อผิดพลาดในการลบ cache`.

#### `/setchannel` (`commands/setchannel.ts`)
- Description `ตั้งค่า Music Text Channel สำหรับบอท`. `default_member_permissions: ManageGuild`.
- Option `channel` (type 7 Channel, optional, `channel_types: [GuildText]`), desc `เลือก Text Channel สำหรับส่งข้อความเกี่ยวกับเพลง (ไม่ระบุ = ลบการตั้งค่า)`.
- `deferReply({ ephemeral: true })`. No guildId → `❌ คำสั่งนี้ใช้ได้เฉพาะใน Server เท่านั้น` (unreachable: interactionCreate drops DMs).
- If no settings row → `upsertGuildSettings({ guildId, guildName, ownerId: guild.ownerId || user.id, musicChannelId: channel?.id })`; else `setMusicChannel(guildId, channel?.id || null)`.
- Reply embed embed_color, title `⚙️ | ตั้งค่า Music Channel`, desc set: `✅ ตั้งค่า Music Channel เป็น <#ch> สำเร็จ!\n\nบอทจะส่งข้อความเกี่ยวกับเพลงใน channel นี้`; cleared: `✅ ลบการตั้งค่า Music Channel แล้ว\n\nบอทจะส่งข้อความใน channel ที่สั่งเพลง`. Footer `ตั้งค่าโดย <tag>`, timestamp. Exception → content `❌ เกิดข้อผิดพลาดในการตั้งค่า กรุณาลองใหม่อีกครั้ง`.
- Writes DB: `GuildSettings.musicChannelId`. (Effect only on dashboard-initiated playback; see §0.)

#### `/247` (`commands/lavalink/247.ts`)
- Description `Toggle 24/7 mode - keeps bot online in voice channel`. No options.
- Checks: ready guard → `manager.get(guildId)` throws → `ไม่มีบอทในห้อง` → user not in VC → `กรุณาเข้าห้องเสียงด้วย` → `member.voice.channelId !== player.voiceChannel` → `คุณต้องอยู่ในห้องเดียวกับบอท`.
- Toggle `player.get('twentyFourSeven')`; set opposite; persist via dynamic import `updateQueueCache(guildId, { guildName, voiceChannelId: player.voiceChannel, textChannelId: player.textChannel, twentyFourSeven })` (queueCache — missing source).
- Replies (public): off → `` > `🌙` | *โหมด 24/7 :* ` ปิดการใช้งาน ` ``; on → `` > `🌕` | *โหมด 24/7 :* ` เปิดการใช้งาน ` ``. Error → ephemeral `เกิดข้อผิดพลาดในการเปลี่ยนโหมด 24/7`.
- 24/7 behavior itself (stay after queue end / alone) lives in events (other section). `skip` consults it.

#### `/clear` (`commands/lavalink/clear.ts`)
- Description `เคลียร์คิว`. No options.
- Order: ready guard → `manager.get` throws → `เกิดข้อผิดพลาดในการเข้าถึง player` (logs error) → `!player` → `ไม่มีบอทในห้อง` (dead w/ Riffy) → `!queue || queue.size===0` → `ไม่มีเพลงในคิว` → not in VC → `กรุณาเข้าห้องเสียงด้วย` → different VC (vs `player.voiceChannel`) → `คุณต้องอยู่ในห้องเดียวกับบอท`.
- `await player.queue.clear()` (does not stop current track), `incrementQueueRevision`, `broadcastToGuild('queueUpdate', { queue: [] })`.
- Reply public: `` > `🧹` | **เคลียร์คิวแล้ว** (`N` เพลง) ``. Error → `เกิดข้อผิดพลาดในการเคลียร์คิว`.

#### `/join` (`commands/lavalink/join.ts`)
- Description `เข้าห้องเสียง`. No options.
- Not in VC → `กรุณาเข้าห้องเสียงด้วย`. `checkVoiceChannelAccess` fails → `` บอทไม่มีอำนาจเข้าห้อง <#vc> ``.
- `player = manager.players.get(guildId)`:
  - none → `playerCreate(guild, interaction.channel, vc)`; if `volume===100 && !get('isVolumeChangeCommand')` → `setVolume(lavalink_config.volume_default=15)`; `connect()`; reply `` > `🔊` | เข้าห้อง <#vc> ``.
  - exists, `!connected` → if different VC: `destroy()`, recreate, default volume; `connect()`; reply `เข้าห้อง <#vc>`; error → ephemeral `บอทไม่มีอำนาจเข้าห้อง <#vc>`.
  - exists & connected, same VC → ephemeral `` > `🔊` | เข้าห้อง <#vc> อยู่แล้ว `` (color embed_color).
  - connected, different VC → **move = destroy + recreate** (queue lost), default volume, connect, reply `` > `🔊` | ย้ายไปห้อง <#vc> ``; error → `ไม่สามารถย้ายไปห้อง <#vc> ได้`.
  - outer error → `เกิดข้อผิดพลาดในการเข้าห้อง`.
- Note: join lets any VC user steal the bot to their channel (no same-channel check).

#### `/leave` (`commands/lavalink/leave.ts`)
- Description `ออกห้องเสียง`. No options.
- `manager.get` throws → ephemeral `` > `❌` **ไม่มีบอทในห้อง** ``. Not in VC → `กรุณาเข้าห้องเสียงด้วย`. Different VC → `คุณต้องอยู่ในห้องเดียวกับบอท`.
- `await player.destroy()`; reply public `` > `🔊`| **ออกจากห้อง** <#user's vc> ``. Error → `เกิดข้อผิดพลาดในการออกจากห้องเสียง`.
- Ignores 24/7 (always leaves).

#### `/loop` (`commands/lavalink/loop.ts`)
- Description `วนซ้ำ`. Option `mode` (String, required) choices `{ '🚫 ปิด': 'off', '🔂 เพลงปัจจุบัน': 'current', '🔁 ทั้งคิว': 'queue' }`.
- Checks: no player (`players.get`) → `ไม่มีบอทในห้อง`; `!current && queue.size===0` → `ไม่มีเพลงที่เล่นอยู่`; not in VC → `กรุณาเข้าห้องเสียงด้วย`; bot's own VC (`guild.members.me.voice`) exists and differs → `คุณต้องอยู่ในห้องเดียวกับบอท`.
- `current`: if `player.loop==='track'` → `setLoop('none')`, reply `` > `🚫` | ลูปเพลง: `ปิด` ``, flags currentLoop=false, queueLoop=false, offLoop=true; else `setLoop('track')`, reply `` > `🔂` | ลูปเพลง: `ปัจจุบัน` ``, flags currentLoop=true, queueLoop=false, offLoop=false. (toggle)
- `queue`: if `loop==='queue'` → none + `ปิด` reply + offLoop flags; else `setLoop('queue')`, reply `` > `🔁` | ลูปเพลง: `คิวทั้งหมด` ``, queueLoop=true others false. (toggle)
- `off`: if loop !== 'none' → none, `ปิด` reply, offLoop=true; else ephemeral `` > `🚫` | ลูปเพลงปิดอยู่แล้ว `` (embed_color).
- Replies public (except already-off). Flags set after reply.

#### `/pause` (`commands/lavalink/pause.ts`) — toggle pause/resume
- Description `พัก/เล่นต่อ`. No options.
- Checks: no player → `ไม่มีบอทในห้อง`; `!player.current` → `ไม่มีเพลงที่เล่นอยู่`; not in VC; bot VC differs → `คุณต้องอยู่ในห้องเดียวกับบอท`.
- Builds: `iconURL = await getIconURL(current, userAvatar)`; base = `**title** ` + `` ` mm:ss ` ``; if from playlist append `\n> ${formatPlaylistInfo(t,'short')} ${formatPlaylistInfo(t,'index-only')}`; author url = track uri, or playlist url if from playlist and `getPlaylistUrl` non-null (ignores `author_url_config`).
- If paused → `pause(false)`; embed author `{ name: 'Go to Page', iconURL, url }`, desc `` `▶️`┃<base><playlist> ``, thumbnail `current.info.thumbnail`, footer `เล่นต่อ`. Else `pause(true)`, desc `` `⏸️`┃... ``, footer `พักการเล่น`. Public. Error → `เกิดข้อผิดพลาดในการพัก/เล่นต่อ`.

#### `/play` (`commands/lavalink/play.ts`)
- Description `เล่น | เพิ่มคิว`. Option `query` (String, required, autocomplete, desc `ชื่อเพลง | ลิ้งก์`). Autocomplete §3.
- Run order: ready guard → normalize query (§3) → not in VC → `กรุณาเข้าห้องเสียงด้วย`; bot in other VC → `` `❌`กรุณาอยู่ในห้องเสียงเดียวกับบอท `` (no space after backtick) → `checkVoiceChannelAccess` fail → `` บอทไม่มีอำนาจเปิดเพลงในห้อง <#vc> `` → sentinel checks (`no_song`/`error`/deezer/apple; note no space: `` `❌`กรุณาระบุเพลง ``, `` `❌`กรุณาระบุเพลงที่ถูกต้อง ``, `` `❌`ไม่รองรับ Platform นี้ ``).
- `loadTracks(queryFiltered, member)` **before** any defer, then:
  - `playerCreate(guild, interaction.channel, member VC)`; default volume 15 if vol==100 && !isVolumeChangeCommand; `set('isFirstFromCommand', true)`; record `client.interactions.set('play', {...})`; if `!player.playing` → `connect()`.
  - **track/search**: `queue.add(tracks[0])`; rewrite uri www→music; if query is `https...` and differs from uri → overwrite `tracks[0].info.uri = queryFiltered` (query also www→music).
    - If already playing or paused → embed author `{ 'Go to Page', iconURL: getIconURL, url: uri }`, desc `` `📝`┃**title** ` mm:ss ` \n > ลำดับ: ` <queue.size> ` ``, thumbnail `validateAndConvertThumbnail(thumbnail)`; incrementQueueRevision + broadcast queueUpdate; public reply.
    - Else `player.play()`; on catch → `reply('ไม่สามารถเล่นเพลงได้')` (plain); `.then` → embed `` `▶️`┃**title** ` mm:ss ` `` (same author/thumbnail). No SSE broadcast in this branch.
  - **no_results** → ephemeral `` `❌`ไม่สามารถหาเพลงได้ ``.
  - **playlist** → `deferReply()` (public); totalDuration = sum lengths; name `Mix - ` → `สถานีวิทยุ…`; thumbnail = `getPlaylistThumbnailMain(queryFiltered, tracks[0].thumbnail, {method:'auto', fallbackToVideo:true, highQuality:true})` (catch → `validateAndConvertThumbnail(first thumbnail)`); rewrite uris; `addPlaylistMetadata(tracks, name, queryFiltered, thumbnailUrl)`; add all to queue.
    - Already playing/paused → iconURL `getPlaylistDisplayIcon(thumbnailUrl, userAvatar, firstTrackArtist)`; embed author `{ 'Go to Playlist', iconURL, url: queryFiltered }`, desc:
      `> \`📝\` **Playlist:** <name>\n> \`⌛\` **เวลา:** \` <total> \` \n> \`📊\` **มี:** \` <n> \` เพลง \n> **คิวทั้งหมด:** \` <queue.size> \` เพลง \n> **ห้อง:** <#vc>`, thumbnail playlist thumb; SSE broadcast; editReply.
    - Else `play()`; catch → editReply embed (color embed_color!) `` > `❌` **ไม่สามารถเล่นเพลงได้** ``; then → same as above but icon `📙` and **no** "คิวทั้งหมด" line.
  - **error** → only console log `[NODE] <exception.message>`; **no reply** (interaction times out).
- Metadata written: requester (via resolve), playlist metadata, uri rewrite. No DB/history writes in command (history via events).

#### `/playnext` (`commands/lavalink/playnext.ts`)
- Description `เพิ่มเพลงถัดจากเพลงปัจจุบัน`. Option `query` (String, req, autocomplete). Same autocomplete & checks as play (messages with space after emoji: `` `❌` กรุณาอยู่ในห้องเสียงเดียวกับบอท `` etc.). Does **not** set `isFirstFromCommand`.
- track/search:
  - Nothing playing/paused → `set('dontShow', true)` (suppress trackStart now-playing embed), add, `play()`; catch → `reply('ไม่สามารถเล่นเพลงได้')`; then → `` `▶️`┃**title** ` mm:ss ` `` embed.
  - Playing → rebuild queue: new track first, then old queue; embed `` `⏭️`┃**title** ` mm:ss ` \n > ลำดับ: ` 1 ` ``, author Go to Page; SSE broadcast; reply.
- no_results → ephemeral `ไม่สามารถหาเพลงได้`.
- playlist → deferReply, thumbnail/metadata as play. Not playing → add all + play; then embed `📙` (as play). Playing → playlist first then old queue; embed `📝` with `> **ลำดับ:** \` 1 ถึง <n> \` \n> **คิวทั้งหมด:** \` <size> \` เพลง \n> **ห้อง:** <#vc>`; SSE broadcast; editReply.
- error loadType → console only, no reply.

#### `/playat` (`commands/lavalink/playat.ts`)
- Description `เพิ่มเพลงในตำแหน่งที่เลือก`. Options: `query` (String, req, autocomplete, `ชื่อเพลง | ลิ้งก์`), `position` (**String**, req, autocomplete, `ตำแหน่งในคิวที่ต้องการแทรก`).
- Position autocomplete: no player or not playing/paused → `[{ 'ไม่มีเพลงในคิว - แทรกเป็นเพลงแรก', '1' }]`. Else positions list = `{ '1. ถัดจากเพลงปัจจุบัน (ลำดับแรก)', '1' }`, `{ '<size+1>. ท้ายคิว', '<size+1>' }`, then `{ '<i>. ลำดับที่ <i>', '<i>' }` for i=2..size. Empty input → first 10; else filter name (lowercase includes) or value includes input → up to 25, none → `{ 'ไม่พบตำแหน่งที่ค้นหา', 'not_found_error' }`. Final respond sliced to 25.
- Run: same voice/permission/sentinel checks (with spaces) + `position==='not_found_error'` → `ไม่พบตำแหน่งที่เลือก`; `parseInt` NaN or <1 → `ตำแหน่งไม่ถูกต้อง`. No upper bound check (clamped).
- `insertTracksAtPosition(tracks, pos)`: copy queue, clear; if queue empty or pos===1 → new tracks then old; else `actual = min(pos-1, len)`: old[0..actual) + new + old[actual..).
- track/search: rewrite uri; not playing → `set('dontShow', true)`, add, play; catch → ephemeral `ตำแหน่งไม่ถูกต้อง` (wrong message); then → `▶️` embed. Playing → insert; `actualPosition = min(insertPosition, queue.size)`; embed `` `📝`┃**title** ` mm:ss ` \n > ลำดับ: ` <actual> ` ``.
- playlist: deferReply, same thumbnail/metadata; not playing → add all + play → `📙` embed; playing → insert; `actualPosition = min(pos, size - n + 1)`; desc includes `> **ลำดับ:** \` <a> ถึง <a + n> \` ` (off-by-one: should be a+n-1), `คิวทั้งหมด`, `ห้อง`.
- **No SSE broadcast / queue revision** (inconsistent with play/playnext).

#### `/playqueue` (`commands/lavalink/playqueue.ts`) — jump to a queued song
- Description `เลือกเพลงจากคิวมาเล่นทันที`. Option `song` (String, req, autocomplete, `เลือกเพลงจากคิว`).
- Autocomplete: no player/not playing&paused → `{ 'ไม่มีเพลงในคิว', 'no_queue_error' }`; size 0 → `{ 'คิวว่างเปล่า', 'empty_queue_error' }`; else first 25 queue tracks; empty input → all as `{ '<pos>. (<author>) <title>'.slice(0,100), '<pos>' }`; with input → filter title/author lowercase includes or position string includes; none → `{ 'ไม่พบเพลงที่ค้นหาในคิว', 'not_found_error' }`. Error → `{ 'เกิดข้อผิดพลาดในการแสดงคิว', 'error' }`. (Only first 25 queue items selectable via autocomplete; typing a number > 25 manually works.)
- Run checks: not in VC; player exists & bot VC differs → `คุณต้องอยู่ในห้องเดียวกับบอท`; no player/not active/`no_queue_error` → `ไม่มีเพลงในคิว`; size 0/`empty_queue_error` → `คิวว่างเปล่า`; `not_found_error` → `ไม่พบเพลงที่ค้นหาในคิว`; `error` → `เกิดข้อผิดพลาดในการเข้าถึงคิว`; index invalid → `ตำแหน่งเพลงไม่ถูกต้อง`; missing → `ไม่พบเพลงในตำแหน่งที่เลือก`.
- Action: rebuild queue with selected first, others in original order (tracks before it are **kept**, not dropped); `player.stop()` → next track starts. No ready-check on manager? (has ready guard). No voice permission check.
- Reply public: author `{ 'Go to Page', getIconURL(selected), uri }`, desc `` `⏭️`┃**Skipped ไปคิวเพลง** **[title](uri)** ` mm:ss ` โดย: <@user> `` (thumbnail commented out). Error → `เกิดข้อผิดพลาดในการเล่นเพลง`. No SSE broadcast.

#### `/queue` (`commands/lavalink/queue.ts`)
- Description `แสดงเพลงที่กำลังเล่นและคิวทั้งหมด`. No options. No voice requirement.
- No player / not playing&paused → ephemeral `ไม่มีเพลงกำลังเล่น`.
- Embed (public): if current track: author `{ 'Go to Current Song', getIconURL(current), uri }`, desc starts `**กำลังเล่น:**\n<status> **[title](uri)** ` mm:ss `\n> **ศิลปิน:** <author>\n\n` where status `` `▶️`┃ `` playing / `` `⏸️`┃ `` paused / `` `⏹️`┃ ``; thumbnail current thumbnail.
- Queue empty → `**คิวเพลง:** \` ว่างเปล่า \``. Else 10 per page: header `**คิวเพลง:** (N เพลง[ - หน้า p/T])\n\n`, items `**<pos>)** **[title](uri)** ` mm:ss `\n> **ศิลปิน:** <author>\n\n`, footer line `**เวลารวมคิว:** \` <total> \``.
- Buttons only if >1 page: row `queue_prev` (label `← หน้าก่อน`, Secondary, disabled on first page), `queue_page_info` (label `p/T`, Primary, always disabled), `queue_next` (label `หน้าถัดไป →`, Secondary, disabled on last).
- Collector: `ComponentType.Button`, `time: 300000` (5 min). Non-invoker click → ephemeral `คุณไม่สามารถใช้ปุ่มนี้ได้`. Player gone/not active → update to fail embed `ไม่มีเพลงกำลังเล่นแล้ว` and remove components. Recomputes queue live each click. On end → edit to disabled buttons (if still >1 page); errors ignored.
- Outer error → `เกิดข้อผิดพลาดในการแสดงคิว` (editReply if replied, else ephemeral reply).

#### `/seek` (`commands/lavalink/seek.ts`)
- Description `ข้ามไปยังเวลาที่ระบุ`. Option `time` (String, required, desc `ระบุเวลาที่ต้องการไป (30 หรือ 2:30 หรือ 1:20:15)`).
- `parseTimeToSeconds`: trim; `^\d+$` → seconds; `^(?:(\d+):)?(\d+):(\d+)$` → requires minutes<60 and seconds<60 (so `90:00` rejected); fallback regex unreachable for matching strings.
- Order: empty → `กรุณาระบุเวลา`; invalid → `` รูปแบบเวลาไม่ถูกต้อง\n> ใช้: `30` (วินาที) หรือ `2:30` (นาที:วินาที) หรือ `1:20:15` (ชั่วโมง:นาที:วินาที) ``; no player → `ไม่มีบอทในห้อง`; `!player.playing` (paused rejected) → `ไม่มีการเล่นเพลงอยู่`; not in VC; bot VC differs; time > floor(length/1000) (when length>0) → `เวลาที่ระบุเกินความยาวของเพลง (<mm:ss>)`.
- `await player.seek(sec*1000)`; public reply `` > `⏭️`┃ข้ามไป: ` mm:ss ` ``. Error → `ไม่สามารถข้ามไปยังเวลาที่ระบุได้`.

#### `/skip` (`commands/lavalink/skip.ts`)
- Description `ข้าม`. `options: []`.
- `manager.get` throws → `ไม่มีเครื่องเล่น`. `!player.playing` (paused rejected) → `ไม่มีเพลงที่เล่นอยู่`; not in VC; `channelId !== player.voiceChannel` → `คุณต้องอยู่ในห้องเดียวกับบอท`.
- Queue empty: normalize twentyFourSeven falsy→false; if false → `player.destroy()` (bot leaves). Reply public (color **embed_fail**) `` `⏭️`┃ **ไม่เหลือเพลงให้ข้าม** ``, footer `ข้าม • เพิ่มคิวอัตโนมัติ`. With 24/7 on: same message, nothing stopped.
- Else `await player.stop()`, then `set('isSkip', true)` (after stop — race with trackStart), reply `` `⏭️`┃**Skipped** โดย: <@user> ``.

#### `/skipplay` (`commands/lavalink/skipplay.ts`) — play now, keep queue
- Description `ลัดคิวเล่นทันที`. Option `query` (String, req, autocomplete). Doc `bot/docs/commands/SKIPPLAY_README.md`.
- Run checks order: `no_song`/empty → `กรุณาระบุเพลง`; `error` → `กรุณาระบุเพลงที่ถูกต้อง`; not in VC; player exists & bot VC differs → `คุณต้องอยู่ในห้องเดียวกับบอท`; deezer/apple → `ไม่รองรับ Platform นี้`; no player / not active / `nobeforsong_error` → `ไม่มีเพลงก่อนหน้า`. **No voice-permission check.**
- `loadTracks`; no tracks → `ไม่สามารถเข้าถึงเพลงได้`. Backup queue, clear, `set('isSkipplay', true)`.
- playlist: `deferReply()`; `thumbnailUrl = getPlaylistThumbnailMain(queryFiltered)` (no options/fallback); Mix rename; rewrite uris; metadata; add playlist then old queue; `player.stop()`; embed author `{ 'Go to Playlist', getPlaylistDisplayIcon(thumb, avatar, firstArtist), url: queryFiltered }`, desc `> \`⏭️\` **Skipped** ไปยัง **[<name>](<url>)** โดย <@user>\n> \`⌛\` **เวลา:** \` <total> \` \n> \`📊\` **มี:** \` <n> \` เพลง\n> **คิวทั้งหมด:** \` <size> \` เพลง \n`, thumbnail `thumbnailUrl || tracks[0].thumbnail`; editReply.
- single (track/search/anything else): add `tracks[0]` (uri rewrite after add — same object), then old queue, `stop()`; reply public `` `⏭️`┃**Skipped** ไปยังเพลง **[title](uri)** โดย: <@user> ``.
- Error → `เกิดข้อผิดพลาดในการ skipplay` (editReply if deferred else ephemeral). No SSE broadcast. The current track is discarded (not re-queued).

#### `/volume` (`commands/lavalink/volume.ts`)
- Description `ปรับความดัง`. Option `amount` (Integer, optional, `min_value: 1`, `max_value: 1000`, desc `ความดัง (%)`).
- `manager.get` throws → `ไม่มีบอทในห้อง`; `!playing` (paused rejected) → `ไม่มีเพลงที่เล่นอยู่`; not in VC; `channelId !== player.voiceChannel` → `คุณต้องอยู่ในห้องเดียวกับบอท`.
- No amount → public `` > `📢`┃**เสียง:** `<vol>%` ``. Else `setVolume(amount)`, `set('isVolumeChangeCommand', true)` (prevents default-volume reset by play/join; reset to false in queueEnd event), reply same format with amount.

---

### 5. config.json (`bot/src/config/config.json`) — no secrets
| Key | Value | Purpose / used by |
|---|---|---|
| `lavalink_config.default_search_platform` | `"spsearch"` | Riffy defaultSearchPlatform; autocomplete cache-key namespace. Options: spsearch (Spotify) / ytmsearch (YT Music) / ytsearch (YouTube) |
| `lavalink_config.description` | doc string | none |
| `lavalink_config.volume_default` | `15` | initial volume set by join/play/playat/playnext (also terminalCommands, API queue.routes) when player volume==100 and not `isVolumeChangeCommand` |
| `lavalink_config.default_image` | ImageKit URL `https://ik.imagekit.io/xenodev/NO%20PICTURE.png?updatedAt=1757172663512` | **unused in code** (grep) |
| `lavalink_config.autocomplete_results_limit` | `7` | max text-search autocomplete choices |
| `icon_config.normal_track` | `"artistImage"` | getIconURL non-playlist |
| `icon_config.playlist_display` | `"botavatar"` | playlist add embeds |
| `icon_config.playlist_track` | `"artistImage"` | tracks from playlist |
| `author_url_config.use_playlist_url` | `false` | trackStart only (`events/lavalink/trackStart.ts:233`); /pause ignores it |
| `author_url_config.description` | doc string | none |
| `embed_color` | `#e4854a` | success embeds |
| `embed_fail` | `#FF0000` | error embeds |
Env vars referenced in this scope: `DISCORD_TOKEN`, `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASS`, `LAVALINK_SECURE`, `LOG_GUILD_ID`, `LOG_CHANNEL_ID` (values not read).
`docs/config-guide.md` is outdated (omits default_search_platform, autocomplete_results_limit, author_url_config, artistImage).

---

### 6. Player flags set by commands (consumed in events)
| Flag | Set by | Meaning / consumer |
|---|---|---|
| `isFirstFromCommand` | play (true) | trackStart: suppress now-playing embed if first track & queue empty (command already replied); reset in trackEnd |
| `dontShow` | playnext, playat (when starting fresh) | trackStart skip embed; reset trackEnd |
| `isSkipplay` | skipplay | trackStart suppress embed; reset trackEnd |
| `isSkip` | skip | trackStart condition; reset trackEnd |
| `currentLoop`/`queueLoop`/`offLoop` | loop | trackStart (no embed while currentLoop) |
| `twentyFourSeven` | 247, skip | stay-connected logic (events) + queueCache persistence |
| `isVolumeChangeCommand` | volume | blocks default volume reset; reset false in queueEnd |
| `isTerminalCommand` | terminalCommands | trackStart logs instead of embed |
trackStart condition (`events/lavalink/trackStart.ts:184`): show embed iff `((!isActualFirstTrack && !isSkipplay && !isCurrentLoop) || (isSkip && !isActualFirstTrack && !isSkipplay)) && !dontShow`, where `isActualFirstTrack = isFirstFromCommand && queue.size===0`.

---


---

## 2. Discord events & player lifecycle (incl. Queue Cache, listening sessions, play history, 24/7)


Source root: `D:\Github\narzev5.0.2\bot\src` (all paths below relative to `bot/`). Read-only survey, 2026-11-08.

### 0. Critical facts up front (read first)

1. **The runtime Lavalink client is the npm package `riffy` (^1.0.12), NOT the vendored `sinsacord`.**
   `src/functions/lavalink/manager.ts:1` and `src/interfaces/client.ts:2` both `import { Riffy } from "riffy"`. Nothing outside `src/lib/sinsacord*` imports sinsacord (grep-verified). `src/lib/sinsacord` + `src/lib/sinsacord-filters` are **dead vendored code** (an Erela.js-style port to Lavalink v4). See §9. Event names/semantics in this doc are therefore Riffy's (`player.get/set` key-value store, `player.setLoop('none'|'track'|'queue')`, `player.queue.size`, `player.guildId`, `player.voiceChannel`, `player.textChannel`).
2. **`src/functions/cache/` is MISSING from the repo.** Root `.gitignore` (and `bot/.gitignore_reserve`) contain `cache/`, which matched the *source* directory `bot/src/functions/cache/` — so `queueCache.ts`, `userCache.ts`, `historyCache.ts`, `autocompleteCache.ts`, `billboardCache.ts`, `playlistCache.ts`, `searchResultCache.ts` were never committed. The checkout does not compile/run as-is. Everything about the **Queue Cache** below is **RECONSTRUCT — source missing**, inferred from call sites.
3. **There is NO auto-leave logic anywhere.** No empty-channel timer, no "bot alone" check, no idle timeout. The only automatic leave is `queueEnd` → `player.destroy()` when 24/7 is off (§4.9). `voiceStateUpdate` only broadcasts SSE permission/channel updates (§3.4).
4. **There are NO now-playing buttons.** trackStart sends a single embed with no components; the only buttons in the bot are `queue_prev` / `queue_page_info` / `queue_next` in `/queue` (commands agent covers). Now-playing messages are never edited or deleted.
5. No handlers exist for Riffy `trackError` / `trackStuck` / `nodeReady`/`nodeCreate`/`nodeDestroy` → library defaults only.

---

### 1. Process bootstrap — `src/index.ts`

Order of execution (module top level):
1. `dotenv.config()`.
2. `initFirebase()` (`src/lib/firebase.ts`) — synchronous; see §7.
3. `EventEmitter.defaultMaxListeners = 50`.
4. `new Client({ intents: [...] })` with intents: `Guilds, GuildMessages, GuildMessageReactions, GuildMembers, GuildVoiceStates, GuildInvites, GuildMessageTyping, GuildIntegrations, GuildWebhooks, DirectMessages, DirectMessageReactions, DirectMessageTyping, MessageContent`. No partials. `client.setMaxListeners(50)`.
5. `client.manager = ManagerCreate()` (Riffy, §2); `client.commands`, `messageCommands`, `events`, `languages`, `interactions` = new `Collection`s. `client.manager.setMaxListeners(50)`.
6. `client.login(process.env.DISCORD_TOKEN)`.
7. `export { client }` then `Handlers()` (`src/handlers/loader.ts`) → `LoadEvents()` then `LoadCommands()`.
8. `client.once('clientReady', ...)` → `createAPIServer(client)` (Express, port `API_PORT||3001`), and stores `apiServer.broadcast` / `apiServer.broadcastToUser` into module vars exposed by `getBroadcast()` / `getBroadcastToUser()`. **Every lifecycle handler calls `getBroadcast()` and silently skips SSE if null** (i.e. events before ready are not broadcast).

Note: `index.ts` registers its own `clientReady` listener *after* `Handlers()` — but `ready.ts` guards with `client.listenerCount("clientReady") === 0`, and LoadEvents runs synchronously before line 68, so ready.ts registers first; then index.ts adds the API-server listener. Both fire.

#### Event loader — `src/handlers/events.ts`
- Module-level `eventsLoaded` flag prevents double-load.
- Reads `src/events/`; for each subdirectory (only `lavalink/`) `require()`s every `.ts|.js`; for top-level files likewise. Deletes `require.cache[...]` first (hot-reload support). Files self-register via `client.on(...)` / `client.manager.on(...)` at import time.
- Several files guard against duplicate registration with `listenerCount(...) === 0` (ready, guildEvents, voiceStateEvents, channel*, nodeConnect); the rest (nodeDisconnect, nodeError, nodeReconnect, player*, queueEnd, socketClosed, track*) do **not** guard → would double-register on hot reload.
- Loaded files: `guildEvents, interactionCreate, raw, ready, voiceStateEvents` + `lavalink/{nodeConnect,nodeDisconnect,nodeError,nodeReconnect,playerCreate,playerDestroy,playerDisconnect,playerMove,queueEnd,socketClosed,trackEnd,trackStart}`.

---

### 2. Lavalink manager — `src/functions/lavalink/manager.ts`

`ManagerCreate()` → `new Riffy(client, nodes, options)`:
- **Single node** from env: `LAVALINK_HOST`, `LAVALINK_PORT` (Number), `LAVALINK_PASS`, `LAVALINK_SECURE === 'true'`. No node identifiers, **no multi-node / failover** (only one node configured; Riffy reconnect handles outages).
- Options: `defaultSearchPlatform: config.lavalink_config.default_search_platform` (= `"spsearch"` in `src/config/config.json`), `restVersion: "v4"`, `reconnectTimeout: 5000` ms, `reconnectTries: 20`, `bypassChecks: { nodeFetchInfo: true }`, `send(payload)` → `client.guilds.cache.get(payload.d.guild_id)?.shard.send(payload)`.
- `client.manager.init(client.user.id)` is called in ready (§3.1).
- `raw` event (`src/events/raw.ts`): every gateway packet → `client.manager.updateVoiceState(data)` (forwards VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE to Riffy).

`loadTracks(query, requester: GuildMember)` → `client.manager.resolve({ query, requester })`.

`playerCreate(guild, textChannel, voiceChannel)`:
- If a player already exists for the guild: if `!existingPlayer.connected` → `existingPlayer.connect()` (logs WARN); return existing. (Note: existing player keeps its *old* textChannel/voiceChannel — the caller's channels are ignored.)
- Else `client.manager.createConnection({ guildId, textChannel: textChannel.id, voiceChannel: voiceChannel.id, deaf: true, mute: false })`.
- Then `setTimeout(1000)`: if `!player.connected` → `player.connect()` (safety reconnect).
- **Self-deafened** on join (`deaf: true`) — MUST-PRESERVE.

Where the player's `textChannel` comes from (= where now-playing embeds go):
- Slash commands (`/play` etc.): `interaction.channel` (text channel where command was run).
- Dashboard/API play (`src/api/routes/player.routes.ts:53-60`): `GuildSettings.musicChannelId` → else the **voice channel id itself** (voice-channel text chat) → if not sendable, first text-based sendable channel in guild.
- So `musicChannelId` is *only* used by API-created players; slash-command players always post in the command channel.

Initial volume (in `/play`, `src/commands/lavalink/play.ts:214`): if `player.volume === 100` and flag `isVolumeChangeCommand` not set → `setVolume(config.lavalink_config.volume_default)` = **15**.

---

### 3. Discord events

#### 3.1 `clientReady` — `src/events/ready.ts` (guarded once)
Step-by-step, in this exact order:
1. `new TerminalInput(client).start()` — interactive stdin REPL (`src/handlers/terminalInput.ts`, prompt `Narze Terminal > `; commands `play, stop, skip, leave, status, list|guilds, find, help, clear|cls, exit|quit`; readline SIGINT prints "Type exit to quit"). Terminal-driven playback sets player flag `isTerminalCommand=true` (`src/handlers/terminalCommands.ts:234`) which suppresses Discord embeds (§4.11).
2. Log "All Green! / <tag> Online!".
3. `client.manager.init(client.user.id)` — connects Lavalink node(s).
4. `await initQueueCacheOnStartup()` — **RECONSTRUCT**: load queue backup JSON from disk into memory.
5. `setClientReference(client)` — **RECONSTRUCT**: gives queueCache a client ref "for live player sync during shutdown" (i.e. on SIGINT/SIGTERM it snapshots live players to disk).
6. `await restoreSessionsOnStartup()` (§6.6).
7. `await initUserCache()` — **RECONSTRUCT**: in-memory user cache + JSON backup (`cache/users.json`).
8. `setTimeout(5000)` → `restoreQueuesFromBackup(client, client.manager)` returns `restoredCount`; logs. **5 s delay to let Lavalink connect** (RECONSTRUCT semantics §5).
9. Guild settings backfill: for **every** guild in cache sequentially, `getGuildSettings(guildId)`; if null → `upsertGuildSettings({ guildId, guildName, ownerId: guild.ownerId, musicChannelId: undefined })`. Logs created count.
10. Presence rotation: `setInterval(15000)` → `client.user.setPresence({ activities: [{ name: random(activities), type: 4 /* Custom */ }], status: 'idle' })`. Activities list (literal):
    `🛠️ Developing | xeno.2004`, `🛠️ (Final Phase) | xeno.2004`, `🛠️ Update v4 | xeno.2004`, `🎧 /play <input>`, `✅ Youtube | xeno.2004`, `✅ Youtube Music | xeno.2004`, `✅ Spotify | xeno.2004`, `✅ SoundCloud | xeno.2004`, `✅ Twitch | xeno.2004`, `🤝 ${members} users used`, `🔊 ${channels} channels active` — `members` = sum of `guild.memberCount`, `channels` = `client.channels.cache.size`, **computed once at ready (stale afterwards)**. First presence only appears after 15 s. Status always `idle`.
11. `client.application.commands.set([...client.commands.values()])` — **global** command registration on every startup (no guild-scoped registration).

Separately (`index.ts`): on `clientReady` → start API server + wire broadcast fns. API server also calls `setBroadcastFunction(broadcastToGuild)` (historyCache) and `setSessionBroadcastFunction(broadcastToGuild)` (ListeningSessionManager) (`src/api/server.ts:3267-3269`).

#### 3.2 `guildCreate` — `src/events/guildEvents.ts:7-63`
1. Determine **bot owner** = inviter: `guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 })`, find entry with `target.id === client.user.id`, use `executor.id`. Fallback (no ViewAuditLog perm / not found): `guild.ownerId`.
2. `upsertGuildSettings({ guildId, guildName, ownerId: inviterId, musicChannelId: undefined })`. **Note**: upsert's `update` branch writes `musicChannelId: undefined` → Prisma ignores undefined, so a re-invite keeps old musicChannelId but **overwrites ownerId** with the new inviter.
3. If `guild.systemChannel` → send plain text (Thai):
   ```
   👋 **สวัสดี!** ขอบคุณที่เชิญฉันเข้ามา!

   🎵 ใช้คำสั่ง `/play <เพลง>` เพื่อเล่นเพลง
   ⚙️ ใช้คำสั่ง `/setchannel` เพื่อตั้งค่า Music Channel
   📖 ใช้คำสั่ง `/help` เพื่อดูคำสั่งทั้งหมด
   ```
   Send errors swallowed.

#### 3.3 `guildDelete` — `src/events/guildEvents.ts:66-71`
Log only. **Settings are intentionally NOT deleted** ("in case the bot comes back"). No player cleanup here (Riffy/voice disconnect handles it).

#### 3.4 `voiceStateUpdate` — `src/events/voiceStateEvents.ts` (guarded once)
Purpose: **SSE only** (dashboard voice-channel list + per-user control permission). No playback side-effects, no auto-leave, no mute/deafen/stage handling (only `channelId` changes are considered; mute/deafen/stream/video toggles are ignored because `oldChannelId === newChannelId`).

Flow when `oldState.channelId !== newState.channelId`:
1. `broadcastVoiceChannelsUpdate(guildId)` — **debounced 1000 ms per guild** (`BROADCAST_DEBOUNCE`; drops, does not trail → last change within the window can be lost). Emits SSE `voiceChannelsUpdate` `{ channels: [{ id, name, memberCount, members: [{ id, username, displayName, avatar }] }] }` — only `ChannelType.GuildVoice` (stage channels excluded), sorted by name.
2. `userId = newState.member?.id || oldState.member?.id`.
3. **Bot left voice entirely** (`userId === bot && old && !new`): for each non-bot member still in the old channel → SSE guild `permissionUpdate { userId, canControl: true, reason: 'Can Play' }` and user-SSE `userPermissionUpdate { guildId, isInVoice: false, canControl: true, reason: 'Can Play' }`. Return.
4. Else if a player exists with `player.voiceChannel`:
   - **Bot moved** (`userId === bot`): for every non-bot member of old channel then new channel, compute `canUserControlBot(client, guildId, memberId, thatChannelId)` → collect; broadcast one SSE `permissionBatchUpdate { users: [{ userId, canControl, reason }] }`; then per-user `userPermissionUpdate { guildId, isInVoice: <member in newChannel>, canControl, reason }`. Note `player.voiceChannel` may already be updated by Riffy (raw handler runs first) — logic doesn't depend on it.
   - **Regular user** joined (`old !== botCh && new === botCh`) or left (`old === botCh && new !== botCh`) the bot's channel: `canUserControlBot(..., userId, newChannelId)` → SSE `permissionUpdate { userId, canControl, reason }` + user-SSE `userPermissionUpdate { guildId, isInVoice: joinedBotChannel, canControl, reason }`.
5. Bot joining a channel when no player exists → nothing beyond step 1.

Also in this file: `channelCreate` / `channelDelete` (GuildVoice only) → `broadcastVoiceChannelsUpdate`; `channelUpdate` → only if voice channel **name** changed. Exports `broadcastVoiceChannelsUpdate`, `getVoiceChannelsList`.

`canUserControlBot` rules (`src/functions/guildSettings.ts:107-166`, reasons are user-visible strings): guild missing → `Guild not found`; member not cached → `Not a member of this server`; `guild.ownerId === userId` → true `Server owner`; `settings.ownerId === userId` → true `Bot owner in this guild`; no player: in voice → true `No active player - can start playback`, else false `Join a voice channel to start playback`; player exists: user not in voice → false `You must be in a voice channel to control the bot`; same channel → true `In same voice channel`; else false `You must be in the same voice channel as the bot`; exception → false `Error checking permissions`. Uses **member cache only** (no fetch). (Admin/developer override is in the API layer, not here.)

#### 3.5 `interactionCreate` — lifecycle aspects only (`src/events/interactionCreate.ts`)
- Only handles interactions **in guilds** (DMs ignored entirely).
- Autocomplete → `command.autocomplete(client, interaction)`; errors logged.
- Chat/context commands → `command.run(client, interaction)`; on throw → ephemeral reply "There was an error while executing this command!" (will itself throw if already replied).
- **Dashboard promo**: after a successful run of any of `play, skip, pause, volume, loop, clear, seek, 247, queue, leave`, with probability **30%** (`Math.random() < 0.3`) send to `interaction.channel` an embed (color `embed_color` `#e4854a`) description: `-# สามารถควบคุมจาก [Dashboard](https://dashboard.narze.space/) ได้แล้ว ง่ายกว่าใช้คำสั่งเยอะ ลองใช้เลย! \n - https://dashboard.narze.space/`.
- **Command audit log**: always (success or failure) sends an embed to channel `LOG_CHANNEL_ID` in guild `LOG_GUILD_ID`: author `View User` (icon = user avatar, url `https://discord.com/users/<id>`), description lines `User: \`tag\`(\`id\`)`, `UserChannel: \`<voice name|Not in voice>\`(\`<id|N/A>\`)`, `Command: \`name\`(\`commandId\`)`, `Channel: \`name\`(\`id\`)`, `Server: \`name\`(\`id\`)`; thumbnail guild icon; timestamp. Crashes (TypeError) if `LOG_GUILD_ID` guild isn't cached (`logGuild.channels` on undefined) — interactionCreate.ts:48.
- Button interactions are not routed here (collectors in the commands handle them).

---

### 4. Lavalink (Riffy) event handlers — `src/events/lavalink/*`

SSE event name ↔ trigger table (guild SSE via `broadcastToGuild`, payload wrapped as `{ type, guildId, data, timestamp, sequence?, revision? }` — `src/api/utils/sse.ts:88`):

| Lavalink event | SSE event(s) |
|---|---|
| trackStart | `trackStart`, then `queueUpdate` (after `incrementQueueRevision`) ; via session manager `sessionUpdate` ; via history cache (RECONSTRUCT) history SSE |
| trackEnd | `trackEnd` |
| queueEnd | `queueEnd` |
| playerDestroy | `playerDestroy` |
| playerDisconnect | (via endSession) `sessionEnd` |
| socketClosed | `voiceDisconnect`, then `voiceReconnected` or `voiceReconnectFailed` |
| voiceStateUpdate | `voiceChannelsUpdate`, `permissionUpdate`, `permissionBatchUpdate`; user-SSE `userPermissionUpdate` |
| (any of queueUpdate/trackStart/trackEnd/queueEnd/playerDestroy) | additionally user-SSE `guildUpdate { guildId, queueLength, isPlaying, hasPlayer }` to users subscribed to that guild (`sse.ts:147-160`): queueEnd → `queueLength 0, isPlaying false, hasPlayer = twentyFourSeven`; playerDestroy → `hasPlayer false` |

`sessionUpdate`/`sessionEnd` are filtered per SSE client: only sent to clients whose `userId` is in `data.participants` (`sse.ts:114-125`). `queueUpdate` gets a per-guild monotonically increasing `sequence` and current `revision`.

#### 4.1 `nodeConnect` (guarded) — log `<host> connected.`
#### 4.2 `nodeDisconnect` — log only. No player migration.
#### 4.3 `nodeError` — normalizes error (Error.message → .message → .reason → string → JSON) and logs host + message. No recovery.
#### 4.4 `nodeReconnect` — log only.
**Node failover: none.** Single node; Riffy retries 20× every 5 s. Players are not moved/restored on node reconnect by bot code.

#### 4.5 `playerCreate` — log `player create from Server: <name>(<id>)`. (Crashes if guild not cached — `guild.name` on undefined.)

#### 4.6 `playerDestroy` — log; SSE `playerDestroy { message: 'Player destroyed', guildId }`. Does **not** end the listening session or clear queue cache itself.

#### 4.7 `playerDisconnect` (bot's voice state channel → null, i.e. kicked/disconnected/left)
- Returns early if guild not cached.
- If flag `isTerminalCommand` → log "TERMINAL NODE Player destroyed" and reset `isTerminalCommand=false`; else log.
- **Ends listening session**: dynamic import → `endSession(player.guildId)` (§6.4).
- Does NOT destroy the player, does NOT clear queue cache, no SSE of its own (Riffy may destroy internally). → In rebuild: bot kicked from voice must end session; decide player teardown explicitly.

#### 4.8 `playerMove` (bot moved to another channel by someone)
- Iterates `client.interactions` (stores last `/play` interaction under key `'play'` only — `play.ts:222`) and compares `value.guild?.id === player.guild` — **`player.guild` is undefined in Riffy (it's `guildId`)** so the match never succeeds; just logs with confused variable names (`old_Channel = channels.get(player)`). **Effectively log-only; no recovery, no message.** Session's `channelId` gets updated lazily on next trackStart (startSession updates channelId).

#### 4.9 `queueEnd`
1. `clearQueueCache(player.guildId)` + `forceSave()` — RECONSTRUCT: delete guild entry from queue backup and write file immediately.
2. SSE `queueEnd { message: 'Queue is empty', twentyFourSeven: <bool> }`.
3. Terminal flag → extra log.
4. **24/7 off** (`player.get('twentyFourSeven')` falsy): `set('isVolumeChangeCommand', false)` then `player.destroy()` → **bot leaves immediately (0 ms delay)** when the queue finishes.
5. **24/7 on**: keep player connected; force `player.current = null`, `playing = false`, `paused = false` ("Idle Player" — prevents stale track on dashboard refresh).
- No message is sent to Discord on queue end. Listening session is NOT ended here (only on playerDisconnect — and since destroy disconnects voice, Riffy's playerDisconnect usually follows; if it doesn't, session stays active until restart).

#### 4.10 `trackEnd` (player, track, payload)
1. SSE `trackEnd { track: { title, author, duration: info.length, thumbnail, uri, requester }, position: info.length, playing: false, queueLength, queue: [{ title, author, duration }] }` (unknown → `'Unknown'`, `'Unknown Artist'`, 0).
2. `guild.members.cache.get(payload.userId)` — unused; crashes if guild uncached.
3. Reset one-shot flags: `isFirstFromCommand=false`, `isSkipplay=false`, `isSkip=false`, `dontShow=false`. (`isTerminalCommand` intentionally kept.)

#### 4.11 `trackStart` (player, track) — the big one (`src/events/lavalink/trackStart.ts`)
Steps in order:
1. **Stale-URL re-resolve**: if `track.info.addedAt` and `now - addedAt > MAX_TRACK_AGE_MS` (**4 h = 14 400 000 ms**) → `client.manager.resolve({ query: info.uri || info.title, requester })`; if results: overwrite `track.track` (encoded), `info.uri`, reset `info.addedAt = now`. Note: this happens *after* Lavalink already started the old encoded track, so it only fixes metadata — the audio is not replayed (quirk).
2. SSE `trackStart { track: { title, author, duration, thumbnail, uri, requester, requesterAvatar, requesterName }, position: 0, paused: false, volume, playing: true, queueLength }` (requester info via `toRequesterInfo()` from `api/utils/metadataAdapter`).
3. `incrementQueueRevision(guildId)` then SSE `queueUpdate { queue: formatQueueForSSE(player.queue) }`.
4. **Play history**: if `track.info.requester` → `requesterId = toRequesterInfo(requester)?.id ?? (string requester)`; if found → `recordTrackPlay(guildId, requesterId, { title, author, uri, thumbnail, length, requester })` (not awaited) (§6.7). Tracks with no requester (e.g. autoplay) are not recorded.
5. **Listening session**: if `player.voiceChannel` and channel is voice-based → `updateSession(guildId, voiceChannelId, { title, author, uri, thumbnail, duration, requesterAvatar, requesterName, requesterId }, voiceChannel.members, guild.name)` (§6.3).
6. **Queue cache** (RECONSTRUCT): `updateQueueCache(guildId, { guildName, voiceChannelId, textChannelId, currentTrack: { title, author, uri, thumbnail, duration, requester(id), requesterName, requesterAvatar }, queue: formatQueueForSSE(player.queue), volume, paused, twentyFourSeven })`.
7. **Now-playing embed decision** — flags read via `player.get`: `isFirstFromCommand`, `isSkipplay`, `isTerminalCommand`, `currentLoop` (also reads `offLoop`, `queueLoop` but unused), `isSkip`, `dontShow`.
   - `isActualFirstTrack = isFirstFromCommand && player.queue.size === 0`.
   - Show iff `((!isActualFirstTrack && !isSkipplay && !isCurrentLoop) || (isSkip && !isActualFirstTrack && !isSkipplay)) && !dontShow`.
   - Meaning: suppressed for the first track started by `/play` with an empty queue (the command's own reply already announces it), for `/skipplay`, for `/playnext`/`/playat` immediate plays (`dontShow`), and on every repeat while **track loop** is on (no spam) — unless the repeat was caused by `/skip`.
   - If `isTerminalCommand` → console log only, no embed.
8. **Embed** sent to `client.channels.cache.get(player.textChannel)` if it has `send` (this is the "multi-guild fix": previously it looped `client.interactions` and posted to the last-used guild — `docs/TRACKSTART_MULTI_GUILD_FIX.md`):
   - Color: `config.embed_color` `#e4854a`.
   - Author: name **`Go to Page`**, `iconURL = getIconURL(track, userAvatar)` (source/platform icon per `functions/lavalink/iconConfig`; fallback avatar = requester avatar via `client.users.fetch(track.requester)` else bot avatar), `url` = track uri, or the playlist URL if `config.author_url_config.use_playlist_url && isFromPlaylist(track)`.
   - Description: `` `▶️`┃**<title>** ` <convertTime(length)> ` `` ; if from playlist add line `> <formatPlaylistInfo(track,'short')> <formatPlaylistInfo(track,'index-only')>`; if requester id (`info.requester.user.id || info.requester.id`) add line `> Requested by <@id>`.
   - Thumbnail: `validateAndConvertThumbnail(info.thumbnail)` (`functions/lavalink/thumbnailValidator`).
   - No buttons, no footer, no timestamp. Message is **never edited or deleted** later (one new message per track).
   - Send is not try/caught (missing perms → unhandled rejection).

---

### 5. Queue Cache (on-disk queue backup) — **RECONSTRUCT — source missing** (`src/functions/cache/queueCache.ts`)

Glossary (`CONTEXT.md:16`): *"Queue Cache: An on-disk snapshot of the Queue, persisted on each track change. Used to survive bot restarts. Not authoritative — always secondary to the live Queue."*

Inferred contract from call sites:
| Function | Caller | Inferred behavior |
|---|---|---|
| `initQueueCacheOnStartup()` async | ready.ts:21 | Load backup JSON → memory map guildId→entry |
| `setClientReference(client)` | ready.ts:24 | Keep client so shutdown handler can snapshot live players ("live player sync during shutdown") |
| `restoreQueuesFromBackup(client, manager)` → `Promise<number>` | ready.ts:35, 5 s after ready | For each cached guild: recreate player in `voiceChannelId` / `textChannelId`, resolve & enqueue `currentTrack` + `queue`, restore `volume`, `paused`, `twentyFourSeven`; return count restored |
| `updateQueueCache(guildId, Partial<entry>)` | trackStart.ts:137 (full), 247.ts:53/69 (only guildName, voiceChannelId, textChannelId, twentyFourSeven) | Merge (partial update ⇒ merge semantics) into memory; persist (likely debounced) |
| `clearQueueCache(guildId)` | queueEnd.ts:13 | Remove entry |
| `forceSave()` | queueEnd.ts:14 | Write immediately |
| `getQueueCacheStats()` → `{ cacheFile, guildCount }` | server.ts:252 admin cache stats ("Queue Backup") | — |

Entry shape (from trackStart.ts:137-155): `{ guildName?, voiceChannelId, textChannelId, currentTrack: { title, author, uri, thumbnail, duration, requester (userId), requesterName, requesterAvatar }, queue: formatQueueForSSE(queue)[], volume, paused, twentyFourSeven }`. No `position` saved → restore restarts current track from 0.
File location: probably `bot/cache/<name>.json` (all sibling caches live in `path.join(process.cwd(),'cache')` — `history-cache.json`, `playlist-cache.json`, `users.json`, `billboard-charts.json`, `youtube-categories.json`, `session-read-cache.json`, `sessions.json`); exact queue file name unknown (exposed as `queueStats.cacheFile`).
When written: every trackStart, every 24/7 toggle (command + presumably API toggle), shutdown. Deleted (entry): queueEnd. Note: player destroyed by `/leave`, kick, or API stop does **not** call `clearQueueCache` in the files I read → stale entry would be restored after restart unless queueCache handles it (unknown).
Rebuild: move to Redis (`queue:{guildId}` hash/JSON), write on trackStart/queue mutation, delete on destroy *and* queueEnd, restore after node `ready`, include position.

Other cache files referenced but missing: `userCache` (`initUserCache`, `updateUserTracksCount`, `getUser`, `updateUserLastActive`, `getUsersForAPI`, `addUserCacheSSEClient`…), `historyCache` (`updateHistoryCacheOnPlay`, `queueHistoryUpdate`, `getCachedUserHistory`, `getCachedServerHistory`, `setUserHistoryCache`, `setServerHistoryCache`, `setBroadcastFunction`, `getCacheStats`).

---

### 6. Listening sessions — `src/functions/history/ListeningSessionManager.ts`

#### 6.1 Types (in memory)
- `SessionParticipant { userId, username, avatarURL, joinedAt: number(ms) }` — comment: "We could track active time later, for now just presence". **No leave time, no listen duration.**
- `SessionTrack { title, author, uri, thumbnail, duration(ms), playedAt(ms), requesterAvatar?, requesterName? }` — **requesterId is NOT stored** on the track (it's passed in but dropped).
- `ListeningSession { sessionId, guildId, guildName, channelId, startTime, endTime?, tracks: SessionTrack[], participants: Map<userId, SessionParticipant>, isActive, lastUpdated }`.

State maps: `activeSessions: Map<guildId, Session>` (one active session per guild), `pendingSessionWrites: Map<sessionId, Session>`, `sessionReadCache: Map<guildId, { sessions: any[], lastFetched, limit }>`, `adminUserStatusClients: Set<res>`.

#### 6.2 Session start — `startSession(guildId, channelId, guildName?)`
- If an active session exists for the guild: update `channelId` if changed (bot moved), fill `guildName` if empty; return it.
- Else create `sessionId = "${guildId}-${Date.now()}"`, `guildName || 'Unknown Server'`, `startTime = now`, empty tracks/participants, `isActive true`; store; start batch throttle.
- **Start condition = first trackStart while no active session for the guild.** (Only caller is updateSession.)

#### 6.3 `updateSession(guildId, channelId, track, members, guildName?)` — called on every trackStart
1. `startSession(...)`.
2. Push track `{ title, author, uri, thumbnail||'', duration, playedAt: now, requesterAvatar, requesterName }`. **No dedup** — every start (incl. track-loop repeats, re-resolves) appends; `trackCount = tracks.length`.
3. Participants: for each member in the voice channel (Collection or array), skip `user.bot`; if not already in map add `{ userId, username: user.username, avatarURL: user.avatarURL() || user.defaultAvatarURL, joinedAt: now }`. **Dedup by userId; first-seen time only; never removed on leave.** Participants are only sampled at track starts (someone who joins and leaves mid-track is never recorded).
4. Remote requester: if `track.requesterId` not in map → add `{ userId, username: requesterName||'Unknown', avatarURL: requesterAvatar||'', joinedAt: now }` (dashboard users who queue without being in voice count as participants).
5. `lastUpdated = now`; `queueSessionWrite(session)`; `updateReadCacheWithSession(session)`.
6. SSE `sessionUpdate` = session with participants as array (participant-filtered, §4 table).
7. `broadcastActiveUsersUpdate()` (§6.8).

#### 6.4 Session end — `endSession(guildId)`
- No-op if no active session. Set `isActive=false`, `endTime=lastUpdated=now`; queue write; update read cache; SSE `sessionEnd` (same shape); delete from `activeSessions`; broadcast active users.
- **End condition: only `playerDisconnect`** (bot's voice channel became null). Not on queueEnd, not on playerDestroy directly, not on empty channel. A 24/7 idle player keeps its session active indefinitely.

#### 6.5 Persistence — write-behind
- `queueSessionWrite`: put into `pendingSessionWrites`, **synchronously** `saveSessionsToJson()` (every track start! `fs.writeFileSync`, pretty-printed), then `startSessionBatchThrottle()`.
- Throttle: `BATCH_INTERVAL = 5 * 60 * 1000` (5 min). Timer starts on first queued write and is **not reset** by later writes (guarantees flush ≤5 min after first change). On fire: `saveSessionsToJson()`, `saveReadCacheToJson()`, `await flushSessionToFirebase()`, `batchTimer = null`.
- `flushSessionToFirebase(session?)`: no-op if Firebase not initialized. One Firestore `batch`; for each pending session `batch.set(ref, data, { merge: true })` and **delete from pending before commit** (optimistic). No 500-op batch limit handling.
- **Firestore doc**: `playHistory/{guildId}/sessions/{sessionId}` with fields: `sessionId, guildId, guildName ('Unknown Server' default), channelId, startTime (ms number), endTime (ms number|null), isActive (bool), trackCount (number), participantCount (number), tracks (array of SessionTrack), participants (array of SessionParticipant), lastUpdated (Firestore serverTimestamp)`. Note: the root doc `playHistory/{guildId}` is never created (only subcollections) — and `playHistory/global` is a pseudo-guild id used by play history (§6.7).
- **Local JSON backup**: `bot/cache/sessions.json` (`path.join(__dirname,'../../../cache')` from `src/functions/history/` → `bot/cache/`). Format: JSON array of `{ type: 'active'|'pending', ...session, participants: [[userId, participant], ...] }` (Map entries). Pending duplicates of active sessions skipped. File **deleted** when there are no active+pending sessions.
- **Read cache JSON**: `bot/cache/session-read-cache.json`: `{ [guildId]: { sessions: [...participants as array], lastFetched, limit (20) } }`, rewritten on every update/end (`updateReadCacheWithSession` → `saveReadCacheToJson`). TTL `SESSION_READ_CACHE_TTL = 5 min`; on load, expired guilds are skipped.
- **Graceful shutdown** (`startSessionGracefulShutdown`, registered only if `process.listenerCount('SIGTERM') === 0`): on SIGTERM/SIGINT → clear timer, save sessions.json + read cache, flush to Firebase. Active sessions are saved as `type:'active'` (not ended). Does not call `process.exit`.

#### 6.6 Restart / crash recovery — `restoreSessionsOnStartup()` (called from ready)
1. `loadReadCacheFromJson()` (non-expired only).
2. If Firebase ready: for each cached guild fetch newest session (`orderBy('startTime','desc').limit(1)`); `latestFirebaseTime = lastUpdated.toMillis() || startTime`; if newer than `cache.lastFetched` → refetch `limit(cache.limit)` and replace cache. Then `saveReadCacheToJson()`.
3. `loadSessionsFromJson()`: sessions with `type:'active'` → **forcibly ended**: `isActive=false`, `endTime = endTime || Date.now()` (end time = restart time, not crash time), into pending; `type:'pending'` → pending.
4. If pending non-empty → `flushSessionToFirebase().then(() => unlink sessions.json)`.
5. Register graceful-shutdown handler.
- A restored queue (§5) starts a **new** session on its first trackStart.

#### 6.7 Play history — `src/functions/history/playHistory.ts`
`recordTrackPlay(guildId, userId, track)` (from trackStart, fire-and-forget):
- No-op without Firebase.
- `trackId = base64("${title}-${author}")` with `/ + =` → `_` (**dedup key = title+author**, case-sensitive; same song from different sources merges).
- `source = track.source || detectSource(uri)`: contains `spotify.com`→`spotify`, `youtube.com|youtu.be`→`youtube`, `soundcloud.com`→`soundcloud`, `deezer.com`→`deezer`, else `unknown`.
- `isMusic`: spotify → true; youtube → `isYouTubeMusicContent(videoId)` (YouTube Data API category check, `functions/youtube/categoryCheck`, cached in `cache/youtube-categories.json`), on error/without videoId → `uri.includes('music.youtube.com')`; others → false. Video id regexes: `youtube.com/watch?v=|youtu.be/|music.youtube.com/watch?v=` + 11 chars, or `/embed/`.
- `trackData = { title, artist: author, url: uri, thumbnail||'', duration: length, source, isMusic, isVideo: source==='youtube' && !isMusic }`.
- `updateHistoryCacheOnPlay(guildId, userId, trackData)` (RECONSTRUCT — in-memory + SSE immediate feedback).
- userCache `uniqueTracksCount`: if user history cached → set to cached length; else **+1 blindly** (overcounts repeats).
- `queueHistoryUpdate(guildId, userId, trackData, trackId)` (RECONSTRUCT — write-behind, flush every 5 min, per header comment).
- Firestore layout (header comment + readers): 
  - per-guild per-user: `playHistory/{guildId}/userHistory/{userId}/tracks/{trackId}`
  - global per-user: `playHistory/global/userHistory/{userId}/tracks/{trackId}` — read with `orderBy(playCount|lastPlayedAt desc).limit(100 default)`
  - server-wide: read path is `playHistory/{guildId}/serverHistory/tracks/items/{trackId}` (`orderBy playCount desc limit 20`) — **header comment says `serverHistory/tracks/{trackId}`, code reads `serverHistory/tracks/items`**; writer is in missing historyCache, so the true write path is unknown.
  - Track doc fields read: `title, artist, url, thumbnail, duration, playCount, source, isMusic, isVideo, lastPlayedAt (Timestamp)`. So writes increment `playCount` and set `lastPlayedAt` (RECONSTRUCT).
- `getUserHistory(userId, limit=100, sortBy='playCount'|'lastPlayedAt')`: cache used only for playCount sort and if cached length ≥ limit. `getServerHistory(guildId)`: cache → Firestore top 20.

#### 6.8 Admin "active users"
- `getActiveUsers()` = union of participants of all active sessions, deduped by userId (first session wins): `{ userId, username, avatarURL, guildId, guildName, joinedAt }`; `getActiveUsersCount()`.
- `broadcastActiveUsersUpdate()` writes raw SSE `data: {"type":"activeUsers","users":[...],"count":n,"timestamp":ms}` to every registered admin SSE `res` (registered via `addAdminUserStatusClient` from the API). Fired on every session update/end.

#### 6.9 `getGuildSessions(guildId, limit=20)` (API reader)
Read cache hit (fresh & `cached.limit >= limit`) → merge in the live active session (prepend or replace by sessionId). Else Firestore `orderBy('startTime','desc').limit(limit)` → set cache + save JSON → prepend active session if missing. No Firebase → only active session. Error → active session only.

---

### 7. Persistence plumbing

- `src/lib/firebase.ts`: `firebase-admin` init from env `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY` (`\\n`→newline), `FIREBASE_CLIENT_EMAIL`. Missing creds → warn, history disabled (all writers no-op). Exports `getFirestore()`, `isFirebaseInitialized()` (db !== null).
- `src/functions/prisma.ts`: singleton `PrismaClient` from `src/lib/prisma` (generated), logs `error,warn` in development; cached on `global` outside production. **`guildSettings.ts` ignores it and creates its own `new PrismaClient()`** (two pools).
- `src/functions/guildSettings.ts` — Prisma/MongoDB model `GuildSettings { id ObjectId, guildId @unique, guildName?, ownerId (inviter; can control without voice), musicChannelId? (text channel for notifications), createdAt, updatedAt }` (`prisma/schema.prisma:26`). Functions: `getGuildSettings` (null on error), `upsertGuildSettings`, `setMusicChannel(guildId, id|null)`, `canUserViewBot` (any cached member; reasons `Guild not found` / `Not a member of this server` / `Guild member`), `canUserControlBot` (§3.4), `getUserVoiceChannel` (cache), `getTextChannels` (text-based, not voice, not thread → `{id,name,type}`).
- Shutdown handlers: `server.ts:125` `process.once('SIGINT'|'SIGTERM', gracefulCacheShutdown)` (search/spotify/youtube caches) + session manager's `process.on` (only if no SIGTERM listener yet — but server.ts registers first? No: ready.ts runs `restoreSessionsOnStartup` and index.ts creates the API server in another `clientReady` listener; ordering of the two `clientReady` listeners is ready.ts first, but `restoreSessionsOnStartup` is awaited after other awaits, so the API server's `once('SIGTERM')` is likely registered first → **session graceful shutdown handler is probably never registered** (race; see bugs). Queue-cache shutdown is in missing code. Nobody calls `process.exit` → on SIGINT the process may not terminate (TerminalInput also intercepts readline SIGINT).

---

### 8. 24/7 mode
- Stored **only on the live player** (`player.set('twentyFourSeven', bool)`) + mirrored to Queue Cache (`updateQueueCache(..., { twentyFourSeven })`) so it survives restart (RECONSTRUCT). Not in GuildSettings/DB.
- Toggled by `/247` (`src/commands/lavalink/247.ts`; requires player + same voice channel; replies `🌕 ... เปิดการใช้งาน` / `🌙 ... ปิดการใช้งาน`) and API (`queue.routes.ts:218`, `server.ts:2831`) which also broadcast SSE `twentyFourSevenChange`.
- Effect: only in `queueEnd` (stay connected as Idle Player vs. destroy) and `/skip` on last track (`skip.ts:50-55` destroys unless 24/7). Everyone leaving the channel has **no effect in either mode** (no auto-leave exists).

### 9. Vendored `sinsacord` / `sinsacord-filters` (UNUSED at runtime — describe for completeness)
- `src/lib/sinsacord/src` = Erela.js-style client ported to Lavalink v4 REST (`PATCH /v4/sessions/{sessionId}/players/{guildId}`, `?noReplace=true`), `clientName: "sinsacord"`. Default options: `autoPlay: true` (auto-advance), `defaultSearchPlatform: "youtube"`, sources `youtube→ytsearch`, `youtube music→ytmsearch`, `soundcloud→scsearch`, `shards: 1`.
- Manager: `init(clientId)`, `search(query, requester)`, `decodeTracks`, `decodeTrack`, `create(options)`, `get(guild)`, `destroy(guild)`, `createNode`, `destroyNode`, `updateVoiceState(packet)` (emits `playerMove` when bot channel changes, `playerDisconnect` + `pause(true)` + clears voiceState when channel → null; leaves a stray `console.log("Update :", update)` at Manager.ts:438). Node selection getters: `leastUsedNode` (fewest `calls`), `leastLoadNodes` (cpu load). Events: `nodeCreate, nodeDestroy, nodeConnect, nodeReconnect, nodeDisconnect(node,{code,reason}), nodeError, nodeRaw, nodeReady (stores sessionId), playerCreate, playerDestroy, queueEnd(player,track,payload), playerMove(player,old,new), playerDisconnect(player,old), trackStart, trackEnd, trackStuck, trackError, socketClosed`.
- Node: retry `retryAmount 5`, `retryDelay 30 000 ms`; reconnect unless close `code 1000 && reason 'destroy'`. **No session resume** configured.
- Player: `queue`, `trackRepeat`, `queueRepeat`, `position`, `playing`, `paused`, `volume`, `voiceChannel`, `textChannel`, `state`, `bands[15]`, `set/get` KV store, `search, setEQ, clearEQ, connect, disconnect, destroy(disconnect=true), setVoiceChannel, setTextChannel, play(track?, {startTime,endTime,noReplace}), setVolume, setTrackRepeat, setQueueRepeat, stop(amount), pause, seek`.
- Queue (extends Array): `current`, **`previous` (single track only, no history list)**, `duration`, `totalSize`, `size`, `add(track|tracks, offset?)`, `remove(pos)|remove(start,end)`, `clear`, `shuffle`.
- trackEnd semantics: `LOAD_FAILED/CLEAN_UP` → advance; `REPLACED` → just emit; trackRepeat → replay (advance if STOPPED); queueRepeat → re-append current; else advance or `queueEnd` (sets current null, playing false). trackStuck/trackError → `player.stop()`.
- `sinsacord-filters` (`customFilter` plugin extends Player): mutually-exclusive boolean presets, each sends an `op:"filters"` payload: `nightcore` timescale speed 1.3 / pitch 1.3 / rate 1; `speedup` speed 1.2 rate 1; `vaporwave` EQ band0 0.3, band1 0.3 + timescale pitch 0.5 + tremolo depth 0.3 freq 14; `bassboost` & `treblebass` (identical) EQ bands 0..13 = 0.6, 0.67, 0.67, 0, -0.5, 0.15, -0.45, 0.23, 0.35, 0.45, 0.55, 0.6, 0.55, 0; `pop` EQ 0.65, 0.45, -0.45, -0.65, -0.35, 0.45, 0.55, 0.6, 0.6, 0.6, 0, 0, 0, 0; `soft` lowPass smoothing 20; `eightD` rotation 0.2 Hz; `karaoke` level 1, monoLevel 1, filterBand 220, filterWidth 100; `vibrato` freq 10 depth 0.9; `tremolo` freq 10 depth 0.5; `reset()` clears all; `customFilter(filter)` = reset + send arbitrary `{equalizer,karaoke,timescale,tremolo,vibrato,rotation,distortion,channelMix,lowPass}`. (Whether the runtime `/filter` command uses Riffy's built-in `player.filters` with the same presets is for the commands agent; these values are a good reference.)

---

### 12. Rebuild notes (NestJS + Supabase + Redis)
- Implement a real auto-leave policy explicitly (current behavior: none besides queueEnd) — if adding one, make it opt-in so default behavior matches.
- Queue backup → Redis key per guild; include position; clear on any destroy path.
- Session write-behind → Redis buffer + periodic Supabase upsert (`listening_sessions`, `listening_session_tracks`, `listening_session_participants`), commit-then-delete, idempotent upsert by sessionId; store requesterId per track; optionally participant leave/duration via voiceStateUpdate.
- Single SIGTERM orchestrator (NestJS `onApplicationShutdown`) flushing all buffers, then exit.

---

## 3. Bot HTTP API and realtime (SSE) channels


Scope: `bot/src/api/**` (server.ts 3273 lines, middleware/, routes/, utils/), `bot/docs/api-documentation.md`, `bot/docs/websocket-implementation.md`, plus the out-of-scope call sites that emit SSE events (events/lavalink/*, events/voiceStateEvents.ts, functions/history/ListeningSessionManager.ts) so the event catalogue is complete.
All paths below relative to `bot/src/` unless noted. Express **5.2.1**, cors 2.8.5 (`bot/package.json:26,29`). Runtime: Bun.

---

### 0. TL;DR — the facts that change the rebuild

1. **The modular routers win, not the inline handlers.** `server.ts:133` calls `registerRoutes(app, …)` *before* any inline `app.get/post` in server.ts. Express dispatches in registration order, so for every path defined in both places the **router version is the live one** and the server.ts version is dead code.
2. Within server.ts, `/queue/clear`, `/queue/move`, `/queue/shuffle` are each defined twice (1013/2580, 1057/2708, 1109/2667) — **both** copies are dead; `routes/queue.routes.ts` serves them.
3. `POST /api/guild/:guildId/play` exists in **player.routes.ts:17** and **queue.routes.ts:255**. Player router is mounted first (`routes/index.ts:39` vs `:40`) → **player.routes version is live**; the richer queue.routes version (owner-only target channel, 15% default volume, URL detection) is dead. server.ts:1911 comment "moved to queue.routes.ts" is therefore wrong.
4. `GET /api/guilds` — admin.routes.ts:26 (`/guilds` under `/api`) shadows the rich inline version at server.ts:1915. **Live version does NOT filter by membership and returns no canControl/isOwner fields** (see §3.10). Dashboard behaviour depending on those fields must come from elsewhere (likely `/api/user/:userId/events` `userInit`).
5. `GET /api/user/:userId/sessions` — history.routes.ts:59 is live (returns `{sessions}` with guildName/guildIcon, no participant filtering, sliced to `limit`); inline server.ts:3176 (participant-filtered, `{sessions, guilds}`) is dead.
6. **There is no authentication anywhere in the bot API.** No API key, no bearer, no x-user-id header. Identity = `req.body.user.discordId` (self-asserted) or `?userId=` query. If `user.discordId` is absent the control-permission middleware **skips the check entirely** (`middleware/auth.ts:16-19`). Errors in the check → allow (`auth.ts:36-40`). Admin endpoints (incl. restart/shutdown, read any channel's messages, user cache) are completely open. Admin/developer "Firebase whitelist" checks do **not** exist in the bot — they must live in the dashboard (Next.js API routes proxy). CORS `*`.
7. `bot/src/functions/cache/` is **missing from the repo** (gitignored `cache/`). Every import from it is marked **RECONSTRUCT — source missing** in §9.
8. `docs/websocket-implementation.md` is **stale**: describes a `ws` WebSocket server with `{type:"subscribe"}` messages. No `ws`/WebSocketServer exists in src (grep). Realtime is pure **SSE**. `docs/api-documentation.md` is partial/outdated (lists only health/status/current-track/queue/guilds; `loop` shown as `"off"` but real values are `none|track|queue`).

---

### 1. Server bootstrap, port, middleware

| Item | Value | Cite |
|---|---|---|
| Entry | `createAPIServer(client)` called from `client.once('clientReady')` in `index.ts:68-73`; stores `(server).broadcast` / `.broadcastToUser` into module-level `broadcastFunction` / `broadcastToUserFunction` exposed via `getBroadcast()` / `getBroadcastToUser()` (`index.ts:56-66`). Events code uses these getters → broadcasts before bot ready are silently dropped. | index.ts:55-73 |
| Port | `process.env.API_PORT || 3001` | server.ts:104 |
| Listen | `app.listen(PORT, async () => { await initBillboardCache(); initPlaylistCache(); initYouTubeSearchCache(); scheduleBillboardUpdates(); })` — binds all interfaces | server.ts:3244-3260 |
| Cache init at construct | `initSearchResultCache, initSpotifyArtistCache, initSpotifyAlbumCache, initYouTubeSearchCache, initYouTubeChannelCache` (YouTube search cache init'd twice — 110 and 3256) | server.ts:107-111 |
| Graceful shutdown | `process.once('SIGINT'|'SIGTERM', gracefulCacheShutdown)` → `shutdownSearchResultCache, shutdownSpotifyArtistCache, shutdownSpotifyAlbumCache, shutdownYouTubeSearchCache, shutdownYouTubeChannelCache` (saves caches to disk). Does NOT call process.exit itself. Also passed into admin router for restart/shutdown. | server.ts:114-126 |
| Middleware order | 1 `cors()` (default: `Access-Control-Allow-Origin: *`, all methods) → 2 `express.json()` (default **100kb** body limit, no custom limit) → 3 modular routers (`registerRoutes`) → 4 inline routes. No rate limiting, no helmet, no auth, no request logging middleware, no 404 handler, no error handler (Express 5 default handler returns HTML 500 for thrown async errors). grep for rateLimit/helmet: none. | server.ts:129-133 |
| Wiring after listen | `setBroadcastFunction(broadcastToGuild)` into historyCache (missing source); dynamic import ListeningSessionManager → `setSessionBroadcastFunction(broadcastToGuild)` | server.ts:3262-3270 |
| CPU sampler | `setInterval(updateCpuUsage, 1000)` at module load, diffing `os.cpus()` times; duplicated in `utils/helpers.ts:6-46` (both run → two intervals) | server.ts:56-90, helpers.ts:44-46 |
| Console hijack | `console.log/warn/error` monkey-patched to push `{timestamp: Date, level:'info'|'warn'|'error', message}` into ring buffer `adminLogs` (MAX_LOGS=1000) and stream to admin log SSE clients. Objects JSON.stringify'd. | server.ts:178-225 |
| Mount table (`registerRoutes`, routes/index.ts:36-51) | `/api/guild` ← player router, queue router, guild router; `/api/charts` ← charts; `/api` ← history, search, playlist, admin (admin only if gracefulShutdownFn passed — it is). `registerRoutesV2` (same under `/api/v2`) is defined but **never called** (grep). | routes/index.ts |

---

### 2. Authorization model (exact)

#### 2.1 `checkControlPermission` (live: `middleware/auth.ts:10-42`; dead identical copy server.ts:136-166)
```
user = req.body.user
if !user?.discordId            → next()   // NO CHECK (backwards compat)
vc   = getUserVoiceChannel(client, guildId, user.discordId)     // cache-only lookup
perm = canUserControlBot(client, guildId, user.discordId, vc)
if !perm.canControl            → 403 {error:'Permission denied', reason: perm.reason}
else next()
on exception                   → next()   // fail-open
```
Applied to: play, pause, resume, skip, skipto, playnow, previous, volume, seek, queue/clear, DELETE queue/:index, queue/shuffle, queue/move, loop, POST 247. NOT applied to join, settings, can-control, events, search, etc.
Note: DELETE requests carry `user` in JSON body (frontend must send a body with DELETE).

#### 2.2 `canUserControlBot` (`functions/guildSettings.ts:107-167`) — order of rules
1. guild not in `client.guilds.cache` → `{false,'Guild not found'}`
2. member not in `guild.members.cache` (cache only, no fetch!) → `{false,'Not a member of this server'}`
3. `guild.ownerId === userId` → `{true,'Server owner'}`
4. `GuildSettings.ownerId === userId` (Prisma `guildSettings`, "bot owner" = whoever invited/configured) → `{true,'Bot owner in this guild'}`
5. no player for guild: in any voice channel → `{true,'No active player - can start playback'}` else `{false,'Join a voice channel to start playback'}`
6. player exists: user not in voice → `{false,'You must be in a voice channel to control the bot'}`; same channel as `player.voiceChannel` → `{true,'In same voice channel'}`; else `{false,'You must be in the same voice channel as the bot'}`
7. exception → `{false,'Error checking permissions'}`
No admin/developer bypass in the bot.

#### 2.3 `canUserViewBot` (`guildSettings.ts:76-99`): guild in cache & member in `members.cache` → `{true,'Guild member'}`; else `'Guild not found'` / `'Not a member of this server'`.
#### 2.4 `getUserVoiceChannel` (`:171-189`): cache-only `member.voice.channelId || null`.
#### 2.5 `getTextChannels` (`:194-213`): `channels.cache` filter `isTextBased() && !isVoiceBased() && !isThread()` → `[{id,name,type}]`.

---

### 3. Route catalogue — LIVE routes

Legend: **[R]** = served by router file; **[I]** = served by server.ts inline (no router collision). "503 not ready" = `if (!client.manager.initiated) 503 {error:'Bot manager not ready yet'}`.
Common error body for 500s: `{error:'<msg>', details:String(error)}` unless noted.

#### 3.1 Health / status
| Method Path | Src | Behaviour / Response |
|---|---|---|
| GET `/api/health` | [I] server.ts:169 | `{status:'ok', timestamp: ISO}` |
| GET `/api/status` | [R] admin.routes.ts:14 (first of two; 2nd at :163 dead) | `{botOnline: client.isReady(), botUser: client.user?.tag||null, guildCount, uptime: floor(process.uptime()*1000), timestamp: ISO}` (dead copy used `client.uptime` and `'Unknown'`) |

#### 3.2 Player state reads
**GET `/api/current-track`** [I] server.ts:617 — 503 not ready. If no players → `{count:0,tracks:[]}`. Else for each player with `current`: `{guildId, guildName, track:{title,author,duration(info.length),thumbnail,uri,requester(raw object)}, position, paused, volume, playing}` → `{count, tracks}`. 500 `'Failed to get current tracks'`.

**GET `/api/current-track/:guildId`** [I] :665 — 503; no player → **404** `{error:'No player in this guild'}`. Player but not (current && (playing||paused)) → `{guildId,guildName,track:null,position:0,paused:false,volume,playing:false,twentyFourSeven}` (24/7 idle status). Else `{guildId,guildName,track:{title,author,duration,thumbnail,uri,requester},position,paused,volume,playing,twentyFourSeven}`. `twentyFourSeven = player.get('twentyFourSeven')||false`.

**GET `/api/queue/:guildId`** [I] :979 — 503; no player 404 `'No player found for this guild'`. → `{guildId,guildName,current: formatCurrentForSSE(player.current), queue: formatQueueForSSE(player.queue), queueLength, position, paused, volume, loop, playing}`.

**GET `/api/guild/:guildId/player/status`** [I] :858 — 503; no player → `{hasPlayer:false, guildId}`; else `{hasPlayer:true, isConnected: !!(player.connected||player.voiceChannel), voiceChannel: player.voiceChannel, guildId}`.

**GET `/api/guild/:guildId/247`** [R] queue.routes.ts:237 — no player `{enabled:false, hasPlayer:false}`; else `{enabled, hasPlayer:true}`.

#### 3.3 Player control (all [R] player.routes.ts, all behind checkControlPermission, all 404 `'No player found for this guild'` when no player, all log `formatUserInfo(user)`)
Body always may contain `user: {discordId, username, avatar?}`.

| Route | Body | Validation / errors | Action | SSE | Response |
|---|---|---|---|---|---|
| POST `/api/guild/:guildId/play` (player.routes.ts:17) | `{query, defaultVolume?, user?, targetVoiceChannelId?}` | 400 `'Query is required'`; 404 `'Bot is not in this server'`; voice channel = `targetVoiceChannelId` (cache→fetch) **else** user's current voice (member cache→fetch). None → 400 `{error:'Voice channel not found. Please select a channel.', requiresVoiceChannel:true, canSelectChannel:true}` (anyone may pick a target channel — no owner check). | text channel = `GuildSettings.musicChannelId` if it exists & has `send`, else first `isTextBased` channel with send, else voice channel id. `client.manager.resolve({query, requester:user})` (requester = **dashboard JSON** `{discordId,username,avatar}`). **Spotify fallback**: if loadType `error` and query contains `spotify.com` → GET `https://open.spotify.com/oembed?url=…`, take `title.replace(' - ',' ')`, resolve again as text search. Error → 400 `{error:'Could not resolve the track', details: exception.message}`; empty/no tracks → 404 `'No results found for the query'`. Get or `createConnection({guildId,textChannel,voiceChannel,deaf:true,mute:false})`; 500 `'Failed to create player'`. If `defaultVolume && player.volume===100` → setVolume(defaultVolume). Playlist: add all tracks; else add `tracks[0]`. If `!playing && !paused`: `if(!connected) connect()`; `await play()`; wait **300ms**; if paused → `pause(false)` (works around socketClosed pausing during handshake — see player.routes.test.ts). | `incrementQueueRevision`; `queueUpdate {queue: formatQueueForSSE(queue)}` | playlist: `{success:true,type:'playlist',trackCount,playlistName}`; single: `{success:true,type:loadType,track:{title,author,duration,uri,thumbnail(artworkUrl||thumbnail)},isQueued: playing||paused}` |
| POST `/pause` (:168) | `{user}` | — | `player.pause(true)` | `playerPause {paused:true, position, by: user?.username||'Unknown'}` | `{success:true, paused:true}` |
| POST `/resume` (:199) | `{user}` | — | `pause(false)` | `playerResume {paused:false, position, by}` | `{success:true, paused:false}` |
| POST `/skip` (:230) | `{user}` | — | `player.stop()` (Riffy advances queue) | revision++; `queueUpdate {queue}` | `{success:true, message:'Track skipped'}` |
| POST `/skipto` (:260) | `{index:number, user}` | 400 `'Index must be a non-negative number'`; `index>=queue.length` → 400 `{error:'Index out of range', queueLength}` | `queue.shift()` × index then `stop()` (index is 0-based into upcoming queue) | revision++; `queueUpdate` | `{success:true, message:'Skipped to track at position ${index+1}'}` |
| POST `/playnow` (:308) | `{index, user}` | same as skipto | **first** broadcast `jumpToTrack {fromIndex:index, trackTitle, by}` (frontend animates & blocks SSE), then `splice(index,1)`, `unshift(track)`, `stop()`; after **600ms** setTimeout: revision++ + `queueUpdate` | as listed | `{success:true, message:'Now playing: …', isJumpToTrack:true}` |
| POST `/previous` (:363) | `{user}` | — | **No real history**: always `player.seek(0)` | `playerSeek {position:0, by}` | `{success:true, message:'Track restarted'}` |
| POST `/volume` (:397) | `{volume:number, user}` | 400 `'Volume must be a number between 0 and 100'` | `setVolume(volume)` | `volumeChange {volume, by}` | `{success:true, volume}` |
| POST `/seek` (:432) | `{position:ms, user}` | 400 `'No track currently playing'`; 400 `'Position must be a positive number in milliseconds'` | clamp `min(position, info.length)`; `seek()` | `playerSeek {position, by: user ? (user.username||'Unknown User') : 'Unknown User'}` | `{success:true, position}` |

#### 3.4 Queue control ([R] queue.routes.ts, all behind checkControlPermission, 404 when no player)
| Route | Body | Validation | Action | SSE | Response |
|---|---|---|---|---|---|
| POST `/api/guild/:guildId/queue/clear` (:16) | `{user}` | none (empty queue OK) | `queue.clear()` | revision++; `queueUpdate {queue:[]}` | `{success:true, message:'Queue cleared'}` |
| DELETE `/api/guild/:guildId/queue/:index` (:45) | path index (0-based, parseInt); body `{user}` | 400 `'Invalid track index'` (NaN/<0/>=len) | `splice(index,1)` | revision++; `queueUpdate` | `{success:true, message:'Track removed', removedTrack:{title,author}|null}` |
| POST `/queue/shuffle` (:86) | `{user}` | none | Riffy `queue.shuffle()` | revision++; `queueUpdate` | `{success:true, message:'Queue shuffled'}` |
| POST `/queue/move` (:115) | `{from:number, to:number, user}` | 400 `'from and to must be numbers'`; 400 `'Invalid index'` unless `0<=from<len && 0<=to<=len` (to==len allowed = append) | splice out; `adjustedTo = to>from ? to-1 : to`; splice in (**drop-before-target semantics**) | revision++; `queueUpdate` | `{success:true, message:'Moved track from ${from} to ${adjustedTo}', movedTrack:{title,author}|null}` |
| POST `/loop` (:163) | `{mode?: 'none'|'track'|'queue', user}` | 400 `'Invalid loop mode. Use: none, track, or queue'` | no mode → cycle none→track→queue→none; else `setLoop(mode)` | **none** (no SSE!) | `{success:true, loop: player.loop}` |
| POST `/247` (:204) | `{enabled?: boolean, user}` | — | non-boolean → toggle; `player.set('twentyFourSeven', v)` (in-memory on player only; lost on destroy) | `twentyFourSevenChange {enabled, by}` | `{success:true, enabled}` |

#### 3.5 Guild routes ([R] guild.routes.ts unless noted)
**GET `/api/guild/:guildId/settings`** (:24) — `getGuildSettings` (Prisma); null → 404 `'Guild settings not found'`; else raw settings row (fields per Prisma GuildSettings: guildId, guildName, ownerId, musicChannelId, …).

**POST `/api/guild/:guildId/settings`** (:41) — body `{musicChannelId?, user?}`. 404 `'Bot is not in this server.'`. If no settings → `upsertGuildSettings({guildId, guildName, ownerId: guild.ownerId, musicChannelId: undefined})` (500 `'Failed to create guild settings'`). If `user.discordId` given and is neither server owner nor settings.ownerId → 403 `'Only the server owner or bot owner can update settings'`. **No user → no check** (anyone). If `musicChannelId !== undefined` → `setMusicChannel` (Prisma update). SSE `settingsUpdate <full settings object>`. → `{success:true, settings}`.

**GET `/api/guild/:guildId/member/:userId`** (:96) — 404 guild; `guild.members.fetch(userId)`; not member → `client.users.fetch` → `{id,username,displayName,avatar,isMember:false}` or 404 `'User not found'`; member → `{id,username,displayName,nickname|null,avatar(member.displayAvatarURL),isMember:true}`.

**GET `/api/guild/:guildId/channels`** (:136) — `{channels: getTextChannels()}`.

**GET `/api/guild/:guildId/voice-channels`** (:148) — 404 guild; all `isVoiceBased()` (voice + stage) → `{id,name,type,memberCount (incl. bots),members:[{id,username,displayName,avatar(64),isBot}] filtered !isBot}` sorted memberCount desc then name → `{channels}`.

**POST `/api/guild/:guildId/join`** (:191, live; inline server.ts:890 dead) — body `{channelId?, user?}`. **No permission check at all.** 404 `'Bot is not in this server'`. Channel = channelId else user's voice channel; not voice-based → 400 `{error:'Voice channel not found', requiresVoiceChannel:true}`. No player → `createConnection({guildId, textChannel: voiceChannel.id (!), voiceChannel, deaf:true, mute:false})`; existing player in another channel → `setVoiceChannel` + `connect()`; then `if(!connected) connect()` (note: createConnection already connects internally — see test comment; this can double-connect). → `{success:true, channelId, channelName}`. No SSE.

**POST `/api/guild/:guildId/can-control`** (:241) — body `{user:{discordId}}` required else 400 `'User discordId is required'`. canView false → `{canView:false, canControl:false, reason}`; else `{canView:true, canControl, reason}`.

**GET `/api/guild/:guildId/search?q|query=&userId=`** [I] server.ts:723 — 503; 400 `'Query is required'`; 404 `'Guild not found'`. `member = guild.members.fetch(userId)` if given. `client.manager.resolve({query, requester: member})` (uses Riffy defaultSearchPlatform; raw query, no prefix). No tracks → `{tracks:[]}`. If `loadType==='playlist'`: `playlistInfo = {name, trackCount, thumbnail: getPlaylistThumbnailMain(query, firstThumb,{method:'auto',fallbackToVideo:true,highQuality:true}) || validateAndConvertThumbnail(firstThumb), url: query}`. Tracks: playlist → all, search → first 10. Per track: `isSpotify = source==='spotify'||uri has spotify.com`; `isYouTube`; `isFromYTMusicUrl = uri has music.youtube.com`; for YouTube (not YTM url) call `isYouTubeMusicContent(identifier)` (YouTube Data API categoryId=10, 1 quota unit, cached 24h; error → false). Thumbnail for YouTube: music → `https://i.ytimg.com/vi/{id}/sddefault.jpg`, video → `https://img.youtube.com/vi/{id}/mqdefault.jpg`. Track shape `{title,author,duration,uri,thumbnail,identifier,source,isVideo,isAudioOnly,isMusicContent}`. → `{tracks,isPlaylist,playlistInfo}`.

**POST `/api/guilds/user-permissions`** [I] server.ts:531 — body `{userId, guildIds:string[]}`; 400 `'userId is required'` / `'guildIds array is required'`. Per guild: not in cache → `{isOwner:false,isBotOwner:false,isInVoice:false,voiceChannelId:null,voiceChannelName:null,canPlay:false,reason:'Guild not found'}`; else isOwner (server owner), isBotOwner (settings.ownerId), voice from `members.cache` only; canPlay: owner/botOwner → true reason `'Server Owner'`/`'Bot Owner'`; inVoice → true `'In ${voiceChannelName}'`; else false `'Join voice channel to play'`. → `{permissions: Record<guildId, …>}`. Used by playlist guild selector.

#### 3.6 Guild list
**GET `/api/guilds?userId=`** — LIVE = admin.routes.ts:26 [R]: `{guilds: [{guildId, guildName, guildIcon(64px)|null, memberCount, isMember: userId ? guild.members.cache.has(userId) : false, hasPlayer, isPlaying: playing && !paused, queueLength}]}` — **all** guilds, no `count`, no sort, no canControl. 
DEAD inline (server.ts:1915) had: membership filter via `members.fetch`, `isOwner, isInVoiceWithBot, canControl, userVoiceChannelId`, sort playing→hasPlayer→name, `{count, guilds}`. **Rebuild decision needed**: the inline semantics match the `userInit` SSE payload (§5.2) and the docs; the shadowing looks accidental.

#### 3.7 History & sessions ([R] history.routes.ts; inline copies dead)
- **GET `/api/user/:userId/history`** (:14) → `{tracks: await getUserHistory(userId)}` (default limit/sort of playHistory). 500 `'Failed to get user history'`.
- **GET `/api/guild/:guildId/history`** (:30) → `{tracks: getServerHistory(guildId)}`.
- **GET `/api/guild/:guildId/sessions?limit=20`** (:46) → `{sessions: getGuildSessions(guildId, limit)}`; 500 `'Failed to fetch sessions'`.
- **GET `/api/user/:userId/sessions?limit=10`** (:59) — guilds where user is member (`members.cache.has` else `members.fetch({user, force:false})`); none → `{sessions:[]}`; else for each guild `getGuildSessions(guildId, limit)` sequentially, each session spread + `{guildId, guildName||'Unknown Server', guildIcon}`; sort `startTime` desc; slice(0,limit) → `{sessions}`. **Does NOT filter by participation** — user sees all sessions of every guild they're in (privacy issue; the dead inline version filtered `participants.some(p=>p.userId===userId)` and returned `{sessions, guilds:[{guildId,name,icon(hash)}]}` with 200/guild).

#### 3.8 Charts ([R] charts.routes.ts; inline copies dead but identical)
- **GET `/api/charts/billboard?refresh=true&limit=100&offset=0`** (:16): refresh → `fetchBillboardChart(true)` and slice; else `getBillboardTracks(limit, offset)` + `fetchBillboardChart(false)` (cache check). null chart → 503 `'Billboard chart data not available'`. → `{success:true, lastUpdated, date, chart, total, count, tracks}`. **Public refresh=true lets anyone force an upstream API call** (no throttle).
- **GET `/api/charts/billboard/recommendations?limit=10`** (:64) → `{success:true, count, tracks: getBillboardRecommendations(limit)}`.
- Data source: `functions/cache/billboardCache` — **RECONSTRUCT** (missing). Known: file `cache/billboard-charts.json` (server.ts:287), auto-refresh every **3 days** via `scheduleBillboardUpdates()` (comment server.ts:2858,2870), `initBillboardCache()` awaited on listen. Upstream Billboard API provider unknown — check `.env.example` for key names.

#### 3.9 Search / artist / album ([R] search.routes.ts)
- **GET `/api/search?q=&source=spotify|youtube|youtubemusic|ytmusic|spotify-api`** (:37). 400 `'Query parameter "q" is required'`. Prefix: youtube→`ytsearch:`, youtubemusic/ytmusic→`ytmsearch:`, spotify/default→`''` (raw query; comment: raw gives better results than `spsearch:`).
  - Lavalink helper `getLavalinkTracks` (:14): `resolve({query: prefix+q, requester:null})`, first 10 → `SearchResultTrack {id(identifier), title, artist(author), duration, thumbnail(artworkUrl||thumbnail), uri, spotifyUrl?(uri contains 'spotify'), youtubeUrl?(uri contains 'youtube')}`; errors → [].
  - source ≠ spotify/spotify-api (youtube*): parallel Lavalink tracks + `searchYouTubeChannels(q, source, 5)` → artists `{id,name,imageUrl,followers(subscriberCount),genres:[],youtubeUrl:'https://www.youtube.com/channel/{id}'}`; `topResult` = artist (score 1) if channel[0].name includes query (case-insens.) else track[0] (0.9). → `{query, source, tracks, artists, albums:[], topResult, fromCache:false}`. Note: `source` 'ytmusic' is passed through as-is to searchYouTubeChannels typed `'youtube'|'youtubemusic'`.
  - `spotify-api`: cache key `spotify-api:${q.lower}` via `getSearchResult/setSearchResult` (searchResultCache **RECONSTRUCT**). Hit → `{...cached, fromCache:true, source:'spotify-api'}`. Miss: parallel `searchSpotifyTracks(q,10)` + `searchSpotify(q,['artist','album'],5)`. tracks `{id,title,artist,artistId,album,albumId,duration(duration_ms),thumbnail(album.images[0]),uri(external_urls.spotify||open.spotify.com/track/id),spotifyUrl}`; artists `{id,name,imageUrl,followers,genres,spotifyUrl}`; albums `{id,name,artistName,artistId,imageUrl,releaseDate,trackCount(total_tracks),spotifyUrl}`. topResult: exact artist name → artist 1.1; else exact track title → track 1.1; else track[0] 0.9; else artist[0] 0.8. Response `{query: cacheKey (!), tracks, artists, albums, topResult, source:'spotify-api', fromCache:false}`.
  - `spotify` (default): `multiCategorySearch(q, q=>getLavalinkTracks(q,''))` (functions/search/searchService) → `{...result, source:'spotify'}`.
  - 500 `'Search failed'`.
- **GET `/api/artist/:id`** (:201) — Spotify artist id. Cache `getArtistDetail/setArtistDetail` (spotifyArtistCache, file-backed). Hit → `{artist:{id,name,imageUrl,followers,genres,spotifyUrl}, topTracks:[{id,name,artists:[{name}],album:{name,id,images:[{url}]},duration_ms,external_urls:{spotify}}], albums:[{id,name,images,release_date,total_tracks,album_type,external_urls}]}` (Spotify-API-like shape rebuilt from cache). Miss → `getArtists([id])`, `getArtistTopTracks`, `getArtistAlbums`; caches only if artist found; returns raw Spotify `artists, album, external_urls`; `artist` may be **null**. 500 `'Failed to get artist info'`.
- **GET `/api/youtube/channel/:id`** (:328) — `getYouTubeChannelInfo(id)`; null → 404 `'Channel not found'`; topTracks = Lavalink `ytsearch:${name} official` → `{artist:{id,name,imageUrl,followers,genres:[],youtubeUrl,source:'youtube'}, topTracks:[{id,title,artist,duration,thumbnail,uri}]}`.
- **GET `/api/album/:id`** (:374) — `getAlbumTracks(id)` (Spotify); empty → 404 `'Album not found'`. → `{id, name, artist, artistId, releaseDate, images, external_urls:{spotify}, tracks:[{id,title,artist(joined ', '),artistId,duration,uri(external_urls.spotify)}]}`.

#### 3.10 Playlists ([R] playlist.routes.ts; inline copies dead but same) — **no ownership checks**
Data model `Playlist` (from missing playlistCache, **RECONSTRUCT**): `{id, userId, name, description, thumbnail, trackCount, tracks: PlaylistTrack[], sourcePlatform?, sourceUrl?, createdAt, updatedAt}`. Firestore collection `playlists`. Cache is write-behind ("will be batched to Firebase", server.ts:1809); file `cache/playlist-cache.json`.
- **GET `/api/playlists?userId=`** (:21): 400 `'userId is required'`; cache hit → `{playlists, source:'cache'}`; miss → Firestore `where('userId','==',userId)`, map Timestamps `.toDate()`, sort createdAt desc, `setUserPlaylistsCache` → `{playlists, source:'firebase'}`; 503 `'Firebase not initialized'` / `'Firebase database not available'`.
- **POST `/api/playlists`** (:82): body `{userId, name, description?, thumbnail?, tracks?, sourcePlatform?, sourceUrl?}`; 400 `'userId and name are required'`; id `pl_${Date.now()}_${random base36 9}`; thumbnail fallback `tracks[0].thumbnail`; `addPlaylistToCache` → `{success:true, playlist}`.
- **GET `/api/playlists/:id`** (:118): cache → `{playlist, source:'cache'}`; else Firestore doc (404 `'Playlist not found'`) → `{playlist, source:'firebase'}` (not written back to cache).
- **PUT `/api/playlists/:id`** (:171): body = arbitrary partial → `updatePlaylistInCache(id, body)` (mass-assignment: can change `userId`) → `{success:true}` (no 404 for unknown id).
- **DELETE `/api/playlists/:id`** (:187) → `deletePlaylistFromCache(id)` → `{success:true}`.
- **GET `/api/playlist-stats`** (:202) → `getPlaylistCacheStats()` raw (fields include `totalPlaylists`, per server.ts:284).

**POST `/api/playlist/fetch`** [I] server.ts:1480 — import-from-URL preview without queuing. Body `{url:string}` (400 `'URL is required'`). 503 `'Music service is not ready. Please try again later.'`. `resolve({query:url, requester:undefined})`: null → 404 `'Could not resolve the playlist URL'`; `error` → 400 `{error:'Failed to load playlist', details}`; `empty`/`no_results` → 404 `'Playlist not found or is empty'`. platform: url contains `spotify.com`→'spotify', `youtube.com|youtu.be`→'youtube', else 'unknown' (so SoundCloud/Apple/Deezer etc. work if Lavalink plugins resolve them, labelled 'unknown').
  - `playlist`: for Spotify, `extractPlaylistId(url)` → `getSpotifyPlaylist(id)` (Spotify Web API) → per item `{albumName, albumReleaseDate, albumArtUrl(images[0]), addedAt}` keyed by track id, stored via `setAlbumInfoBatch` (spotifyAlbumCache). Tracks: `{title, artist(author||'Unknown Artist'), duration, thumbnail(artworkUrl||thumbnail), uri, album (spotify data → else info.album|albumName|albumTitle), addedAt (spotify added_at else now ISO)}`. Playlist thumbnail via `getPlaylistThumbnailMain(url, firstThumb, {method:'auto',fallbackToVideo:true,highQuality:true})` fallback `validateAndConvertThumbnail`. owner = `playlistInfo.author` || (spotify: first track artist) || 'Unknown'. → `{success:true, loadType:'playlist', platform, playlist:{name, thumbnail, trackCount, owner}, tracks}`. **Limits: none** (no cap on track count; Spotify API call may only return first page of items — depends on spotifyClient pagination).
  - `track`/`search` → `{success:true, loadType:'track', platform, tracks:[{title,artist,duration,thumbnail,uri}]}`; no track → 404 `'No track found'`.
  - other → 400 `{error:'Unsupported content type', loadType}`. 500 `{error:'Failed to fetch playlist', message}`.
  - Heavy `[API DEBUG]` console logging of full track objects (server.ts:1523-1541, 1596-1600, 1627-1633) — goes into admin log buffer too.

#### 3.11 Admin (all **unauthenticated**)
- **GET `/api/admin/stats`** [I] server.ts:228 → `{online: client.isReady(), ping: client.ws.ping, uptime: client.uptime||0, guilds, users: users.cache.size, activePlayers: manager.players.size, cpu: % (1s delta sampler), memory:{used,total,percentage} (OS-wide, not process), cache:[{name,size(bytes),items}], ips:["iface: ipv4"] (non-internal IPv4 — leaks LAN/public IPs), nodeVersion, platform, arch}`. Cache rows (names exact): `Search Results`, `Spotify Artists`, `Spotify Albums`, `YouTube Search`, `History Cache` (cache/history-cache.json), `Playlist Cache` (playlist-cache.json), `Queue Backup` (queueStats.cacheFile), `User Cache` (users.json), `Billboard Charts` (billboard-charts.json), `YouTube Categories` (youtube-categories.json), `Session Cache` (session-read-cache.json). items = stats count || count JSON entries (array length / object keys). Note YouTube Channel cache stats imported but not listed. Cache dir = `process.cwd()/cache`.
- **POST `/api/admin/restart`** [R] admin.routes.ts:45 → `{success:true, message:'Restart initiated'}`, after 1s `gracefulShutdownFn(); process.exit(0)` (relies on external supervisor to restart). **POST `/api/admin/shutdown`** (:56) identical body `'Shutdown initiated'`. Neither ends sessions/flushes Firestore explicitly (only cache shutdown fn).
- **GET `/api/admin/guilds`** (:179) → `{guilds:[{id,name,icon,memberCount,ownerId,hasPlayer,joinedAt}], total}`.
- **GET `/api/admin/guild/:guildId/info`** [I] :1193 → `{id,name,icon(128),banner(512),memberCount,ownerId,createdAt(ms),description,features,channels:{text(type0),voice(type2),category(type4)}}`; 404 `'Guild not found'`.
- **GET `/api/admin/guild/:guildId/text-channels`** [I] :1225 → types [0,10,11,12] → `{channels:[{id,name,type,isThread,parentId,parentName,position (threads=999)}]}` text first by position then threads.
- **GET `/api/admin/guild/:guildId/messages/:channelId?limit=50`** [I] :1269 — reads any channel the bot can see. channel from cache else `client.channels.fetch` (threads); type must be 0/10/11/12 else 404 `'Text channel or thread not found'`. `messages.fetch({limit: min(limit,100)})`. Per message: `{id, content, author:{id,username,avatar(64)||default,bot}, timestamp, mentions:[{id,username,avatar(32)}] (+ users parsed from `<@id>`/`<@!id>` in embed descriptions, resolved via members.fetch→users.fetch), mentionedRoles:[{id,name,color(hex)}], attachments:[{id,name,url,proxyURL,size,contentType,fileType:image|video|audio|document|file (by contentType else extension lists),width,height,spoiler}], embeds:[{type,title,description(raw <@id> kept),url,color,provider{name,url},author{name,iconURL},thumbnail,image,video}], reactions:[{emoji(name||id),count}], replyTo: null | {messageId,author:{username,avatar}|null,content(first 100 chars||'[Media/Embed]' / '[Message not loaded]'),mentions:[{id,username}]} (only resolves refs within the fetched batch), thread: null|{id,name,messageCount,lastActivityAt(archiveTimestamp||createdTimestamp),archived}}`; sorted oldest first → `{messages, channel:{id,name}}`. **Privacy/security: unauthenticated read of private Discord chat.**
- **GET `/api/admin/users/cached`** [I] :486 → `{users: getUsersForAPI(), count, cacheStats: getUserCacheStats(), timestamp}` (userCache **RECONSTRUCT**; stats has `totalUsers`).
- **GET `/api/admin/user/:userId/sessions?limit=500`** [R] admin.routes.ts:67 — every guild `getGuildSessions(g,200)` filtered by participant; normalises `startTime` (number or Firestore Timestamp `.toMillis()`), `endTime`, `trackCount||tracks.length`, `guildName` → sorted desc, sliced → `{sessions, total}`.
- **GET `/api/admin/user/:userId/history?limit=500&sortBy=playCount|lastPlayedAt`** (:105) → `getUserHistory(userId, limit, sortBy)` mapped `{id,title,artist,duration,playedAt(lastPlayedAt),source,playCount,thumbnail}` → `{history, total}`.
- **GET `/api/admin/session/:sessionId`** (:132) — linear scan all guilds' `getGuildSessions(g,500)` for `sessionId` → `{session:{...,guildId,guildName,guildIcon(64)}}` or 404 `'Session not found'`.

---

### 4. DEAD code (shadowed — do not port as-is, but note diffs)
| Inline (server.ts) | Shadowed by | Notable diff of dead copy |
|---|---|---|
| 1013 queue/clear (1st) | queue.routes:16 | 400 `'Queue is already empty'`; uses `queue.size`; broadcast includes `queueLength:0, current{…}` |
| 1057 queue/move (1st) | queue.routes:115 | `to < size` (no append), no adjust; payload with `id:'${i}'` |
| 1109 queue/shuffle (1st) | queue.routes:86 | 400 `'Need at least 2 tracks to shuffle'`; manual Fisher-Yates on Riffy queue |
| 2580/2667/2708 (2nd copies) | same | identical semantics to routers but inline mapping |
| 2614 DELETE queue/:index, 2774 loop, 2816/2851 247 | queue.routes | identical |
| 2224-2575 pause…seek | player.routes | `previous` had (pointless) `position>3000` branch and **no** playerSeek broadcast; skip/skipto inline map identical to formatQueueForSSE |
| 890 join | guild.routes:191 | inline required guild membership (fetch), 503 not-ready check, used `settings.musicChannelId` as text channel, response `{success,message:'Joined X',voiceChannel:{id,name}}`, type===2 only (no stage) |
| 1159/1175 history, 3164/3176 sessions | history.routes | user/sessions see §3.7 |
| 1722-1909 playlists | playlist.routes | log text only |
| 1915 /api/guilds | admin.routes:26 | see §3.6 |
| 2006-2218 settings/member/channels/voice-channels/can-control | guild.routes | identical |
| 2871/2921 charts | charts.routes | identical |
| queue.routes.ts:255 POST play | player.routes.ts:17 | dead version: 503 check; voice-channel precedence existing-player VC → user VC → **owner-only** targetVoiceChannelId → owner may reuse existing player VC; 400 `'User must be in a voice channel'` with `canSelectChannel` = isOwner; text channel = musicChannel (text, not voice, not thread) → systemChannel → first text, else 500 `'No suitable text channel found'`; `playerCreate(guild,textChannel,voiceChannel)`; URL extraction regex `https?://[^\s]+`, bare youtube domain gets `https://`; requester = **GuildMember**; default volume **15%** on first play unless `isVolumeChangeCommand`; response `{success, started, added, track, queueLength}`. Worth preserving the owner-only channel selection + 15% default + URL extraction in the rebuild. |
Also dead: `registerRoutesV2` (/api/v2/*), `utils/helpers.ts` `getCpuUsage/getFileSize/countJsonEntries/convertMsToTime/generateProgressBar` (only formatUserInfo used), `enqueueAndNotify` (only tests use it), server.ts imports `loadTracks, playerCreate, getTopBillboardTracks, getCachedUserHistory, getCachedServerHistory, setUserHistoryCache, setServerHistoryCache, multiCategorySearch, guildQueueStates, getQueueState, broadcastGuildUpdateToUsers, TextChannel/GuildMember` unused.

---

### 5. Realtime — SSE channels

Wire format everywhere: `res.write("data: " + JSON + "\n\n")` — **no `event:` field, no `id:`, no `retry:`**; the client dispatches on JSON `type`. No Last-Event-ID resume; clients re-sync via the `init` snapshot + `revision`/`sequence`. Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `Access-Control-Allow-Origin: *`; guild/user streams also `X-Accel-Buffering: no` and `req.socket.setTimeout(0); setNoDelay(true); setKeepAlive(true)`. Guild/user streams do **not** call `flushHeaders()` (admin/presence ones do). No auth on any stream.

#### 5.1 Per-guild stream — GET `/api/guild/:guildId/events?userId=` (server.ts:2940)
- Registry: `sseClients: Map<guildId, Set<{res, userId?}>>` (utils/sse.ts:20). `userId` used only to filter session events.
- On connect: write `init` snapshot:
  ```
  {type:'init', guildId, timestamp, data: hasActiveTrack ? {
     track:{title,author,duration,thumbnail,uri,requester(raw),requesterAvatar,requesterName},
     position, paused, volume, playing, loop, queueLength, twentyFourSeven,
     queue:[{title,author,duration,thumbnail(artworkUrl||thumbnail),requesterAvatar,requesterName}] }
   : {track:null, playing:false, paused:false, volume: player?.volume||100, position:0, queue:[], twentyFourSeven} }
  ```
  `hasActiveTrack = player && player.current && (player.playing || player.paused)`. Note init's requester extraction is ad-hoc (`requester.user.displayAvatarURL()`/`requester.displayAvatarURL()`) — does NOT use toRequesterInfo, so dashboard-JSON requesters get no avatar/name in `init` (inconsistency vs queueUpdate). Init has no `revision`/`sequence`.
- Heartbeat every **30 s**: `{type:'heartbeat', timestamp}`.
- Close: clear interval, remove client, delete guild key when empty. Write failures are swallowed ("will be cleaned up") but nothing removes dead clients except `close`.

#### 5.2 Per-user stream — GET `/api/user/:userId/events` (server.ts:3042)
- Registry: `userSseClients: Map<userId, Set<Response>>`, `userGuildSubscriptions: Map<userId, Set<guildId>>` (sse.ts:23-26).
- On connect: for **every** bot guild, `guild.members.fetch(userId)` (one Discord API call per guild per connect — expensive), build per-guild entry `{guildId, guildName, guildIcon, memberCount, hasPlayer, isPlaying: !!player.current, queueLength, isOwner: serverOwner||botOwner, isInVoiceWithBot, canControl, userVoiceChannelId}`; canControl rule = owner/botOwner → true; player exists → same VC; no player → in any VC. Sort isPlaying, hasPlayer, name. Store subscriptions set (overwrites per connect). Send `{type:'userInit', userId, data:{guilds, count}, timestamp}`.
- Heartbeat 30 s `{type:'heartbeat', timestamp}`.
- Close: remove res; if last → delete both maps. Membership is snapshotted at connect (joins later not reflected until reconnect).
- `broadcastToUser(userId, event, data)` envelope: `{type: event, userId, data, timestamp}` (sse.ts:51-71).

#### 5.3 `broadcastToGuild(guildId, event, data)` semantics (sse.ts:86-160)
- Envelope: `{type: event, guildId, data, timestamp, sequence?, revision?}`.
- Only for `queueUpdate`: `state = getQueueState(guildId)` (`guildQueueStates: Map<guildId,{revision,sequence,lastModified}>`, created lazily at 0), `sequence++` every broadcast; `revision` = current value (incremented separately by callers via `incrementQueueRevision` which also sets lastModified). Both omitted when 0. Sequence increments even when there are no clients. State never deleted (grows per guild; resets on process restart).
- `sessionUpdate`/`sessionEnd`: sent only to clients whose `userId` ∈ `data.participants[].userId`; clients **without** userId receive everything (filter bypass by omitting `?userId`).
- Fan-out to user streams: for events `queueUpdate|trackStart|trackEnd|queueEnd|playerDestroy`, compute `queueLength = data.queueLength ?? data.queue?.length ?? 0`; `isPlaying = trackStart || (trackEnd && queueLength>0) || (queueUpdate && data.playing !== false)`; then `broadcastGuildUpdateToUsers(guildId, {queueLength: queueEnd?0:queueLength, isPlaying: queueEnd?false:isPlaying, hasPlayer: playerDestroy?false : queueEnd? data.twentyFourSeven||false : true})` → each subscribed user gets `{type:'guildUpdate', userId, data:{guildId, queueLength, isPlaying, hasPlayer}, timestamp}`. This runs even when the guild has zero guild-stream clients.

#### 5.4 Guild event catalogue (event name → payload `data` → emitter → trigger)
| Event | data | Emitted by |
|---|---|---|
| `init` | §5.1 | connect |
| `heartbeat` | — (top-level `{type,timestamp}`) | 30 s |
| `queueUpdate` | `{queue: QueueItem[]}` (QueueItem = formatQueueForSSE shape) — always with revision++ beforehand except slash-command sites (check) | API play/skip/skipto/playnow(+600ms)/clear(`[]`)/remove/shuffle/move; `events/lavalink/trackStart.ts:77`; slash `commands/lavalink/clear.ts:73, play.ts:265,355, playnext.ts:268,378` |
| `trackStart` | `{track:{title,author,duration,thumbnail,uri,requester,requesterAvatar,requesterName}, position:0, paused:false, volume, playing:true, queueLength}` | events/lavalink/trackStart.ts:57 (followed by queueUpdate) |
| `trackEnd` | `{track:{title,author,duration,thumbnail,uri,requester}, position: length, playing:false, queueLength, queue:[{title,author,duration}]}` | events/lavalink/trackEnd.ts:12 |
| `queueEnd` | `{message:'Queue is empty', twentyFourSeven}` | events/lavalink/queueEnd.ts:22 (then destroys player unless 24/7) |
| `playerDestroy` | `{message:'Player destroyed', guildId}` | events/lavalink/playerDestroy.ts:14 |
| `playerPause` / `playerResume` | `{paused, position, by}` | API pause/resume |
| `playerSeek` | `{position, by}` | API seek, previous (position 0) |
| `volumeChange` | `{volume, by}` | API volume |
| `jumpToTrack` | `{fromIndex, trackTitle, by}` | API playnow (before mutation) |
| `twentyFourSevenChange` | `{enabled, by}` | API 247 |
| `settingsUpdate` | full GuildSettings row | API settings POST |
| `voiceDisconnect` | `{code, reason, byRemote, recovering}` | socketClosed.ts:23 |
| `voiceReconnected` | `{resumed:boolean, position, track:title}` | socketClosed.ts:84,98 |
| `voiceReconnectFailed` | `{error}` | socketClosed.ts:111 |
| `voiceChannelsUpdate` | `{channels:[{id,name,memberCount,members:[{id,username,…}]}]}` sorted by name; debounced **1 s** per guild | events/voiceStateEvents.ts:54 (any voice join/leave/move) |
| `permissionUpdate` | `{userId, canControl, reason}` (bot-left case: `canControl:true, reason:'Can Play'`) | voiceStateEvents.ts:98, 235 |
| `permissionBatchUpdate` | `{users:[{userId, canControl, reason}]}` | voiceStateEvents.ts:192 (bot moved channels) |
| `sessionUpdate` / `sessionEnd` | full ListeningSession with `participants` as array (participant: userId, username, avatarURL, joinedAt, …) — participant-filtered | ListeningSessionManager.ts:506, 540 |
| (historyCache events) | unknown — `setBroadcastFunction(broadcastToGuild)` given to missing historyCache; likely a history-update event. **RECONSTRUCT** | server.ts:3267 |
No `loop` change event exists (loop changes are invisible to other clients until next `init`).

#### 5.5 User event catalogue
| Event | data | Emitter |
|---|---|---|
| `userInit` | `{guilds, count}` | connect |
| `heartbeat` | — | 30 s |
| `guildUpdate` | `{guildId, queueLength, isPlaying, hasPlayer}` | derived in broadcastToGuild (§5.3) |
| `userPermissionUpdate` | `{guildId, isInVoice, canControl, reason}` | voiceStateEvents.ts:107, 205, 248 |

#### 5.6 Admin / presence streams (server.ts, all unauthenticated; no heartbeat except presence/connect)
| Endpoint | Registry | Initial message | Updates |
|---|---|---|---|
| GET `/api/admin/logs/events` (:334) | `adminLogClients: Set<Response>` | `{type:'history', logs: last 100}` | each console line raw `{timestamp, level, message}` (no `type` field!) |
| GET `/api/admin/users/events` (:355) | `adminUserStatusClients` in ListeningSessionManager.ts:789 (`addAdminUserStatusClient/remove`) | `{type:'activeUsers', users, count, timestamp}`; user = `{userId, username, avatarURL, guildId, guildName, joinedAt}` deduped across active listening sessions | same payload via `broadcastActiveUsersUpdate()` on every sessionUpdate/sessionEnd |
| GET `/api/presence/connect?discordId&username&avatarURL` (:409) | `onlineDashboardUsers: Map<discordId,{discordId,username,avatarURL,connectedAt}>` | none to the user; 400 `{error:'discordId required'}` if missing | heartbeat 30 s `{type:'heartbeat',timestamp}` to user; on connect & close → `broadcastPresenceUpdate()` to admin. On close: delete from map, `updateUserLastActive(discordId)` (userCache, RECONSTRUCT). **Keyed by discordId: two tabs → closing one marks user offline while the other is still open** (Map not ref-counted). Identity self-asserted via query. |
| GET `/api/admin/presence/events` (:465) | `dashboardPresenceAdminClients: Set` | `{type:'dashboardPresence', users, count, timestamp}` | same on every presence connect/disconnect |
| GET `/api/admin/users/cached/events` (:505) | userCache `addUserCacheSSEClient/removeUserCacheSSEClient` (RECONSTRUCT) | `{type:'userCacheUpdate', users, count, timestamp}` | pushed by userCache on changes (presumed same shape) |

Presence semantics: "online on dashboard" = has an open `/api/presence/connect` SSE (dashboard opens it while logged in). "Active users" (different concept) = participants of currently active listening sessions (people in VC with the bot while tracks play).

---

### 6. queueCoordinator (`api/utils/queueCoordinator.ts`)
- **Not a lock/serializer.** Despite the name it does not serialize concurrent mutations — it's a formatting + notify helper. Concurrent API calls mutate `player.queue` directly with no mutex; ordering is guaranteed only by Node's single thread per handler segment (await points in `/play` allow interleaving).
- `formatCurrentForSSE(track)` → null | `{title, author, duration(info.length), thumbnail(info.thumbnail), uri, requester(raw), requesterName, requesterAvatar}` via toRequesterInfo.
- `formatQueueForSSE(queue)` → `[{title||'Unknown', author||'Unknown Artist', duration||0, thumbnail: artworkUrl||thumbnail||undefined, requesterAvatar, requesterName}]`. **No uri, no identifier, no id** in queue items (frontend keys by index).
- `enqueueAndNotify(player, guildId, tracks, requesterInput, deps?)` — `queue.add` each, `incrementRevision` once, broadcast `queueUpdate {queue}`; DI via `deps` for tests. `requesterInput` unused. Not used in prod code.
- Revision/sequence contract (client side "recheck system"): `revision` = logical queue version, bumped once per mutation; `sequence` = monotonically increasing per-guild message counter on queueUpdate, lets clients drop out-of-order/duplicate updates. MUST-PRESERVE.
- Tests: queueCoordinator.test.ts (requester extraction from dashboard JSON, revision called once, broadcast 'queueUpdate').

### 7. metadataAdapter (`api/utils/metadataAdapter.ts`)
`toRequesterInfo(input) → {id, username, avatar: string|null} | null`, recognising three requester shapes stored on `track.info.requester`:
1. GuildMember: `obj.user.id` & `obj.user.username` strings → `{id:user.id, username:user.username, avatar: obj.displayAvatarURL?.() ?? null}` (guild avatar)
2. User: `id`,`username` strings + `displayAvatarURL` fn → same
3. Dashboard JSON: has `discordId` → `{id:String(discordId), username: username??'Unknown', avatar: avatar??null}`
else null. Rebuild: normalise requester to a single persisted `{id, username, avatar}` at enqueue time instead of storing heterogeneous objects. Tests in metadataAdapter.test.ts cover all 3 + null/undefined.

### 8. helpers / test notes
- `formatUserInfo(user)` → `'username (discordId)'` | `'Unknown User'` (logging only).
- player.routes.test.ts documents a Riffy quirk: `createConnection()` already calls `connect()` (Riffy.js:198); calling `connect()` again while connected leaves `establishing=true` → `connection.resolve()` deferred never resolves → 10 s timeout "Player connection is not initiated". Fix: connect only if `!player.connected`; after `play()` wait 300 ms and unpause if socketClosed paused it during handshake. MUST-PRESERVE behaviour (or equivalent in new Lavalink client).

---

### 9. RECONSTRUCT — source missing (`bot/src/functions/cache/*` not in repo)
Contracts inferred from call sites in this scope:
| Module | Imported names | Inferred contract |
|---|---|---|
| billboardCache | `fetchBillboardChart(force:boolean)`, `getBillboardRecommendations(limit)`, `getBillboardTracks(limit, offset)`, `getTopBillboardTracks` (unused), `initBillboardCache()` (async), `scheduleBillboardUpdates()` | chart object `{lastUpdated, date, chart, tracks[]}`; null when unavailable; force=true hits upstream API; persisted to `cache/billboard-charts.json`; scheduler refreshes every 3 days. Recommendations = tracks "formatted for player" (shape unknown — likely `{title, artist, thumbnail, …}` with a search query). |
| historyCache | `setBroadcastFunction(fn)`, `getCachedUserHistory`, `getCachedServerHistory`, `setUserHistoryCache`, `setServerHistoryCache` (unused here), `getCacheStats()` → `{userCacheSize, serverCacheSize}` | file `cache/history-cache.json`; emits some guild SSE event via injected broadcast. |
| queueCache | `getQueueCacheStats()` → `{cacheFile, guildCount}` | queue backup persistence (for restore after restart). |
| userCache | `getUserCacheStats()` → `{totalUsers,…}`, `getUsersForAPI()` → user[], `updateUserLastActive(discordId)`, `addUserCacheSSEClient(res)`, `removeUserCacheSSEClient(res)` | file `cache/users.json`; pushes `userCacheUpdate` SSE to admin. |
| playlistCache | `initPlaylistCache`, `getCachedUserPlaylists(userId)→Playlist[]|null`, `getCachedPlaylist(id)→Playlist|null`, `setUserPlaylistsCache(userId, list)`, `addPlaylistToCache(pl)`, `updatePlaylistInCache(id, partial)`, `deletePlaylistFromCache(id)`, `getPlaylistCacheStats()→{totalPlaylists,…}`, types `Playlist`, `PlaylistTrack` | write-behind cache batching to Firestore `playlists`; file `cache/playlist-cache.json`. |
| searchResultCache | `initSearchResultCache`, `shutdownSearchResultCache`, `getSearchCacheStats()→{cacheFile, entries}`, `getSearchResult(key)`, `setSearchResult(result)` (keyed by `result.query`), type `SearchResultTrack {id,title,artist,artistId?,album?,albumId?,duration,thumbnail?,uri,spotifyUrl?,youtubeUrl?}` | file-backed, saved on shutdown. |
Other caches referenced (exist elsewhere): spotifyArtistCache, spotifyAlbumCache (`getAlbumInfo, setAlbumInfoBatch, getMissingTrackIds, initSpotifyAlbumCache, getCacheStats`), youtubeSearchCache, youtubeChannelCache, youtube categoryCheck (`isYouTubeMusicContent`, 24h cache, `cache/youtube-categories.json`), ListeningSessionManager (`session-read-cache.json`).

---


---

## 4. Music resolution: search sources, metadata, thumbnails, autocomplete, caches


Source snapshot: `D:\Github\narzev5.0.2` (read-only). All paths are relative to that root unless absolute.
Scope: search, source selection, Lavalink plugin config, Spotify Web API, YouTube Data API, artist images, thumbnails, playlist metadata, the YouTube category check, autocomplete, Billboard/top charts, and every cache in this area.

> **CRITICAL GAP: `bot/src/functions/cache/` IS MISSING.** `bot/.gitignore` has the rule `cache/`, which also matched the *source* directory `src/functions/cache/`, so it was never committed. These modules are imported but absent: `autocompleteCache`, `searchResultCache`, `billboardCache`, `playlistCache`, `historyCache`, `queueCache`, `userCache`. Anything below marked **RECONSTRUCT — source missing** is inferred from call sites and docs and must be designed fresh. The current tree **cannot compile**.

---

### 1. Search sources and prefixes

#### 1.1 Prefixes that actually appear in code/config
| Prefix | Meaning | Where used |
|---|---|---|
| `spsearch:` | Spotify search (LavaSrc) | **Global default** for every free-text `manager.resolve`: `bot/src/config/config.json` → `lavalink_config.default_search_platform: "spsearch"` (comment: `spsearch = spotify | ytmsearch = youtube music | ytsearch = youtube`). Passed to Riffy as `defaultSearchPlatform` in `bot/src/functions/lavalink/manager.ts:21`. |
| `ytsearch:` | YouTube search | `bot/src/api/routes/search.routes.ts:49` (source=`youtube`) and `:344` (YouTube channel "top tracks" = `ytsearch:<channelName> official`). Also the LavaSrc mirror providers (`ytsearch:"%ISRC%"`, then `ytsearch:%QUERY%`). |
| `ytmsearch:` | YouTube Music search | `search.routes.ts:53` (source=`youtubemusic` or `ytmusic`). |
| `scsearch:` | SoundCloud | Only in the vendored `bot/src/lib/sinsacord/src/structures/Manager.ts:210-212` (an unused/legacy Erela-style manager, mapping `"youtube music"→ytmsearch`, `"youtube"→ytsearch`, `"soundcloud"→scsearch`). Lavalink has `soundcloudSearchEnabled: true`. |
| `amsearch:`, `dzsearch:`, `ymsearch:` | Apple Music / Deezer / Yandex | **Not used.** LavaSrc `applemusic: false`, `deezer: false`, `yandexmusic: false`. Autocomplete explicitly rejects `deezer`/`music.apple` URLs (see §8). |

#### 1.2 How the source is chosen
1. **Discord slash commands** (`/play`, `/playnext`, `/playat`, `/skipplay`): no user-facing source picker.
   - If the query starts with `https://`:
     - URL contains `deezer` or `music.apple` → the autocomplete answers "ไม่รองรับ Platform นี้" (platform not supported) with value `error`. The run path also rejects these (`playat.ts:268`, `playnext.ts:199`).
     - Otherwise the URL goes to Lavalink as-is (`loadTracks(query, member)` → `client.manager.resolve({query, requester})`).
   - Otherwise it is free text, and Riffy prefixes it with `defaultSearchPlatform` (`spsearch`).
   - **YouTube playlist rewrite:** if the query contains `list=` and `youtube`/`youtu.be`, it is rewritten to `https://music.youtube.com/playlist?list=<everything after list=>` (`play.ts:87-88`, `:149-150`). The exception is a "Mix" (YouTube radio) playlist, which keeps the original URL. Mix detection: `playlistInfo.name.includes('Mix - ')`, and the name is displayed as `'Mix - '` → `'สถานีวิทยุ'` ("radio station").
2. **Dashboard full search page** (`/dashboard/search`): the user picks a source tab: `spotify` | `spotify-api` (default in UI state, `dashboard/app/dashboard/search/page.tsx:447`) | `youtube` | `youtubemusic`. The proxy `dashboard/app/api/search/route.ts` defaults `source=spotify` and forwards to bot `GET /api/search?q=&source=` with a 10 s timeout (504 on timeout).
3. **Dashboard quick-search popup** (now-playing page): `GET /api/player/:guildId/search?q=&userId=`, which proxies to bot `GET /api/guild/:guildId/search`. It uses the raw query, so the default platform (`spsearch`) applies and URLs are resolved directly. Debounce is 250 ms (`dashboard/app/dashboard/page.tsx:435-462`).
4. **Dashboard header search box:** navigates to `/dashboard/search?q=` after a 1000 ms debounce, or immediately on Enter (`dashboard/app/dashboard/layout.tsx:370-400`).
5. **Spotify URL fallback** (dashboard play, `bot/src/api/routes/player.routes.ts:65-88`): if `resolve` returns `loadType==='error'` and the query contains `spotify.com`, the bot calls `https://open.spotify.com/oembed?url=<url>`, takes `title.replace(' - ', ' ')`, and resolves that as free text (default platform).
6. **URL detection helpers** (all substring- or regex-based):
   - `isSpotifyUrl`: `url.includes('spotify.com') || url.includes('spotify:')` (`bot/src/functions/spotify/index.ts:113`)
   - `isSpotifyPlaylistUrl`: contains `spotify` and (`/playlist/` or `playlist:`) (`spotify/index.ts:106`)
   - `extractSpotifyPlaylistId`: `/spotify:playlist:([a-zA-Z0-9]+)/`, `/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/`
   - `extractSpotifyTrackId` (index.ts): `/spotify:track:(...)/`, `/open\.spotify\.com\/track\/(...)/`
   - spotifyClient.ts: `extractPlaylistId` `/playlist\/([a-zA-Z0-9]+)/`; `extractTrackId` `/track[:/]([a-zA-Z0-9]+)/`; `extractArtistId` `/artist[:/](...)/`; `extractAlbumId` `/album[:/](...)/`
   - YouTube `isPlaylistUrl`: `list=` plus (`youtube.com`|`youtu.be`|`music.youtube.com`), or a Spotify playlist URL (`bot/src/functions/youtube/index.ts:110`)
   - YouTube `extractPlaylistId`: `/[?&]list=([^&]+)/`
   - `/api/playlist/fetch` platform: `spotify.com` → `spotify`; `youtube.com`|`youtu.be` → `youtube`; anything else → `unknown`.

#### 1.3 Quirk: raw query in "spotify" mode
`search.routes.ts:55-60` deliberately sends the **raw query with no prefix** in `spotify` mode. Its comment says the popup's raw query "returns better results (e.g. 'Hold') than 'spsearch:' ('Side A')". With Riffy, a raw query still gets `defaultSearchPlatform` (spsearch) prepended, so the difference the comment observed is unexplained.

For `youtube` and `youtubemusic`, the code builds `ytsearch:<q>` / `ytmsearch:<q>` itself and passes it as `query`. **VERIFY:** Riffy 1.0.x builds `identifier = /^https?:\/\//.test(query) ? query : \`${source||defaultSearchPlatform}:${query}\``. If so, the request becomes `spsearch:ytsearch:...`. `node_modules` is not present, so this could not be checked. In the rebuild, pass the source explicitly, never as a string prefix inside the query.

---

### 2. Lavalink server and plugins

Files: `bot/lavalink/application_example.yml` (secrets are placeholders in the example and redacted below), `bot/lavalink/application.test.ts`, the jars in `bot/lavalink/plugins/`, and `bot/lavalink/Lavalink-4.2.2.jar`. The real `application.yml` was not opened.

- **Lavalink 4.2.2.** Started with `startlavalink.bat`. Server on port 2333, address 0.0.0.0, http2 off, `password: <REDACTED>`.
- **Plugin jars installed** (asserted by `application.test.ts`): `youtube-plugin-1.18.1.jar`, `lavasrc-plugin-4.8.3.jar`, `lavasearch-plugin-1.0.0.jar`. Older jars must be gone: Lavalink-4.1.1, lavasrc-4.8.1, youtube-plugin-1.13.5.
- **Test rule:** the real `application.yml` must have **no `lavalink.plugins` declarations** ("prevents SSL update-check crash"). Jars are managed manually. The example yml is stale: it still declares lavasrc 4.8.1, lavasearch 1.0.0 and youtube-plugin 1.13.5 via maven `https://maven.lavalink.dev/releases`.
- **Test rule:** `ANDROID` must not be in `plugins.youtube.clients`. The example still lists it, which is stale.
- **Built-in sources:** `youtube: false` (the youtube-plugin replaces it), `bandcamp`, `soundcloud`, `twitch`, `vimeo`, `nico`, `http` all true, and `spotify: true` (not a real built-in key; ignored). `youtubeSearchEnabled: true`, `soundcloudSearchEnabled: true`.
- **All filters enabled:** volume, equalizer, karaoke, timescale, tremolo, vibrato, distortion, rotation, channelMix, lowPass.
- **Audio settings:** bufferDurationMs 400, frameBufferDurationMs 5000, opusEncodingQuality 10, resamplingQuality LOW, trackStuckThresholdMs 10000, useSeekGhosting true, `youtubePlaylistLoadLimit: 6` (pages), playerUpdateInterval 5, gc-warnings true.
- **youtube-plugin:** `enabled`, `allowSearch`, `allowDirectVideoIds`, `allowDirectPlaylistIds` all true.
  - Clients, in order: `TVHTML5EMBEDDED, TV, MUSIC, WEB, (ANDROID — must be removed), ANDROID_MUSIC, ANDROID_VR, IOS`.
  - Per-client options:
    - ANDROID_MUSIC: playlistLoading false, video true, search true, playback true
    - MUSIC: playlist false, video true, search true, playback false
    - WEB: playlist false, video true, search true, playback true
    - WEBEMBEDDED: playlist false, video false, search false, playback true
    - TVHTML5EMBEDDED: playlist false, video false, search false, playback true
    - IOS: playlist false, video true, search true, playback false
  - `oauth: enabled true, refreshToken <REDACTED>, skipInitialization false`.
- **LavaSrc:**
  - `providers: ['ytsearch:"%ISRC%"', 'ytsearch:%QUERY%']`. Spotify tracks are mirrored to YouTube by ISRC first, then by title query.
  - `sources: spotify true, applemusic false, deezer false, yandexmusic false, flowerytts false, youtube true`.
  - `spotify: clientId <REDACTED>, clientSecret <REDACTED>, countryCode "TH", playlistLoadLimit 50, albumLoadLimit 50` (pages).
- **LavaSearch 1.0.0** is installed, but **no code calls `/loadsearch`**. It has no functional use today.
- **`dunctebot` config block:** `ttsLanguage en-AU`; sources getyarn, clypit, tts, pornhub, reddit, ocremix, tiktok, mixcloud, soundgasm, pixeldrain. **No dunctebot jar is installed**, so this block is dead config. Decide explicitly whether to drop it.
- **Ops settings:** metrics.prometheus disabled (`/metrics`); sentry dsn empty; logging to `./logs/`, INFO; request logging on (client info, query string, payload ≤10000); logback rolling 1GB × 30.
- **Riffy client** (`bot/src/functions/lavalink/manager.ts`): one node from env `LAVALINK_HOST/PORT/PASS/SECURE` (`'true'` string compare); `restVersion: "v4"`, `reconnectTimeout 5000`, `reconnectTries 20`, `bypassChecks.nodeFetchInfo: true`.

---

### 3. Spotify Web API

There are **two independent Spotify implementations.** The rebuild should merge them into one `SpotifyService` with one cached token.

#### 3.1 `bot/src/functions/spotify/spotifyClient.ts` (search, artist and album pages, playlist album enrichment)
- **Credentials are hardcoded in source** (`spotifyClient.ts:10-11`, `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`, values `<REDACTED>`). This is a leaked secret: **rotate it**, and load from env/secret store in the rebuild. The header comment claims they come "from application.yml", which is false.
- **Auth:** client-credentials. `POST https://accounts.spotify.com/api/token` with `Authorization: Basic base64(id:secret)` and body `grant_type=client_credentials`.
- **Token cache:** module memory `accessToken` / `tokenExpiry = now + expires_in*1000`. Refresh happens when `now >= expiry - 5 min`.
- **Credential sanity check:** if the id or secret is shorter than 32 chars, it throws `No valid credentials`, and every API function returns **MOCK DATA** (an "Imagine Dragons (Mock)" artist, "Mock Song n", "Evolve (Mock Result)", image `i.scdn.co/image/ab6761610000e5eb920dc1f617550de8388f368e`). Rebuild: drop the mocks or put them behind an explicit dev flag.
- **No rate-limit handling:** no 429/`Retry-After` handling, no concurrency limit. Non-OK responses return `[]`/`null`, or `continue` for batches.
- **Base URL:** `https://api.spotify.com/v1`. Endpoints:
  | Function | Endpoint | Notes |
  |---|---|---|
  | `getPlaylist(id)` | `GET /playlists/{id}?fields=id,name,owner,images,tracks(total,items(added_at,track(id,name,artists,album,duration_ms,external_urls)))` then pages `GET /playlists/{id}/tracks?offset=100&limit=100&fields=items(added_at,track(...)),next`, following `next` | Pagination loop. The first `nextUrl` is hard-coded to offset=100. |
  | `getTracks(ids)` | `GET /tracks?ids=` in batches of 50 | Sequential batches. |
  | `getArtists(ids)` | `GET /artists?ids=` in batches of 50 | |
  | `getArtistTopTracks(id, market='TH')` | `GET /artists/{id}/top-tracks?market=TH` | |
  | `getArtistAlbums(id, limit=20)` | `GET /artists/{id}/albums?include_groups=album,single&limit=20&market=TH` | |
  | `getAlbumTracks(albumId)` | album-detail cache first (§10.4), else `GET /albums/{id}` then `getTracks(all track ids)` | Caches the result. Only the first page of album tracks is used (no paging past 50). |
  | `searchSpotify(q, types=['artist','album'], limit=5)` | `GET /search?q=&type=artist,album&limit=5` | **No market param.** |
  | `searchSpotifyTracks(q, limit=10)` | `GET /search?q=&type=track&limit=10&market=TH` | Used by `spotify-api` mode. |
- **Market:** hard-coded `TH` everywhere it is set. LavaSrc also uses `countryCode TH`. Must preserve, ideally as config.

#### 3.2 `bot/src/functions/spotify/index.ts` (thumbnails and artist images)
- Reads credentials from `../../../lavalink/application.yml` → `plugins.lavasrc.spotify.clientId/clientSecret`, using `yaml`. It rejects values containing `YOUR_SPOTIFY`.
- **No token caching:** it fetches a new token and re-reads the YAML on every call. Every embed with `artistImage` costs 2–3 HTTP calls.
- Functions:
  - `getSpotifyPlaylistThumbnail(url, {size='large'|'medium'|'small', fallbackToDefault=true})` → `GET /v1/playlists/{id}`. large = max height; medium = first with height 200–400, else images[1], else images[0]; small = min height. On failure it returns the default `https://developer.spotify.com/assets/branding-guidelines/icon1@2x.png`.
  - `getSpotifyTrackThumbnail(url)` → `GET /v1/tracks/{id}` → `album.images[0].url`. **Unused.**
  - `getSpotifyArtistImage(name)` → `GET /v1/search?q=<name>&type=artist&limit=1` → the first image with height 200–500, else images[0].
  - `getArtistImage(name)` = Spotify only. A Last.fm hook is commented as future work.
  - `searchSpotifyTrack(title, artist)` → `GET /v1/search?q="<title> <artist>"&type=track&limit=1` → `{thumbnail: album.images[0], artistImage: getSpotifyArtistImage(artists[0].name), url: external_urls.spotify}`. Its comment says it is "for Billboard tracks that lack thumbnail". Its caller is presumably the missing `billboardCache`.

---

### 4. Artist image logic

- **Trigger:** `bot/src/functions/lavalink/iconConfig.ts`. The embed author icon depends on `config.json.icon_config`. Current values: `normal_track: "artistImage"`, `playlist_display: "botavatar"`, `playlist_track: "artistImage"`. Allowed values: `botavatar | userimage | playlist_thumbnail | artistImage`.
- **`getIconURL(track, userAvatar, isPlaylistDisplay)`:**
  - The icon type is chosen in this order: `isPlaylistDisplay` → `playlist_display`; else `isFromPlaylist(track)` → `playlist_track`; else → `normal_track`.
  - For `artistImage`: `getArtistImage(track.info.author)`, i.e. a Spotify artist search by the **Lavalink author string**. Fallback chain: artist image → user avatar → bot avatar (`client.user.displayAvatarURL()`) → `https://cdn.discordapp.com/embed/avatars/0.png`.
- **`getPlaylistDisplayIcon(playlistThumbnail, userAvatar, artistName?)`:** the same logic for the playlist "added" embed.
- **No cache** for name→image lookups. Rebuild: cache in Redis by normalized artist name with a long TTL.
- **Dashboard search results:** the artist image is Spotify `artists.images[0].url` (spotify modes), or the YouTube channel thumbnail high→medium→default (youtube modes, §6).
- **"YouTube Artist Image" is advertised but unimplemented.** `bot/src/functions/youtube/artistImage.ts` and `bot/docs/youtube-artist-image.md` are **empty (0 bytes)**, yet README and releasenote advertise "YouTube Artist Image System". Treat it as unimplemented.
- `docs/artist-image-status.md` claims the fallback `artistImage → userimage → botavatar → discord default`, ~200–500 ms per lookup, and ~95% success for well-known artists. It also references `src/examples/artistImageTest.ts`.

---

### 5. Thumbnail logic

#### 5.1 `bot/src/functions/lavalink/thumbnailValidator.ts`
- **`isValidImageUrl(url)`:** `HEAD` request, `AbortSignal.timeout(5000)`. Valid only if `ok`, `content-type` starts with `image/`, **and** `content-length` exists and is > 1024 bytes. The size rule rejects YouTube's tiny grey placeholder. If `content-length` is missing, the image is treated as invalid.
- **`validateAndConvertThumbnail(url)`:** used for every `/play` embed thumbnail.
  - If the URL contains `mqdefault`: try `maxresdefault` → else `hqdefault` → else the original mqdefault.
  - Any other URL is HEAD-checked; if invalid it returns `null` and no thumbnail is shown.
- **`getOptimalYoutubeThumbnail(videoId)`:** tries `i.ytimg.com/vi/{id}/maxresdefault.jpg`, then `hqdefault.jpg`, then `mqdefault.jpg`. **Unused.**
- **`thumbnailOptimizer.ts` is empty (0 bytes).**
- **Doc:** `docs/thumbnail-validation.md` (same flow; reason given: avoid the white/blank maxres image).

#### 5.2 Dashboard quick-search thumbnails (`bot/src/api/server.ts:819-829`)
- YouTube track **classified as music** → `https://i.ytimg.com/vi/{id}/sddefault.jpg` (code comment: "square-ish").
- YouTube track **classified as video** → `https://img.youtube.com/vi/{id}/mqdefault.jpg` (16:9).
- All other sources → `track.info.thumbnail` (Riffy).
- Elsewhere the code uses `track.info.artworkUrl || track.info.thumbnail`.

#### 5.3 Playlist thumbnail (`bot/src/functions/youtube/index.ts` → `getPlaylistThumbnailMain(url, videoThumbnail?, {method='auto', fallbackToVideo=true, highQuality=true})`)
1. Spotify playlist URL → `getSpotifyPlaylistThumbnail(url, {size:'large', fallbackToDefault:true})`, which returns the Spotify logo when no image is found. Return it if truthy.
2. YouTube, `auto` mode (skipped for any Spotify URL):
   - (a) `getBestPlaylistThumbnail`: axios GET of the page with a Chrome 91 User-Agent.
     - Take `<meta property="og:image">` and upgrade `hqdefault`/`mqdefault` → `maxresdefault`.
     - Else parse `var ytInitialData = {...};`: `sidebar.playlistSidebarRenderer.items[0].playlistSidebarPrimaryInfoRenderer.thumbnailRenderer.playlistVideoThumbnailRenderer.thumbnail.thumbnails[last].url`, else `header.playlistHeaderRenderer.playButton...watchEndpoint.videoId` → `i.ytimg.com/vi/{videoId}/maxresdefault.jpg`.
     - Else the pattern `https://i.ytimg.com/vi_webp/{playlistId}/maxresdefault.webp`. This is bogus (a playlist id is not a video id), but it is always truthy, so steps (b), (c) and the video fallback are effectively unreachable.
   - (b) `ytmusic-api` `YTMusic().initialize(); getPlaylist(id).thumbnails[last]`.
   - (c) `getPlaylistThumbnailSimple` → the same bogus `vi_webp/{playlistId}/maxresdefault.webp`.
3. If still empty and `fallbackToVideo` is set: use the first track's thumbnail, upgrading `mqdefault` → `maxresdefault` without validation.
4. Callers wrap the call in try/catch and fall back to `validateAndConvertThumbnail(firstTrackThumbnail)`.

Other modes: `web-scraping`, `ytmusic-api`, `simple`.

Unused alternates:
- `playlistThumbnailYTI.ts`: `youtubei.js` `Innertube.create().music.getPlaylist(id).header.thumbnail.thumbnails[last]`.
- `playlistThumbnailSimple.getValidPlaylistThumbnail`: HEAD-checks four patterns.
- `getPlaylistThumbnailFromFirstVideo`: YouTube oEmbed `thumbnail_url`, upgraded to maxres.
- `getPlaylistThumbnailFromAPI`: contains the literal `key=YOUR_API_KEY` and never calls it.
- `generatePlaylistThumbnailUrl(id, maxres|hq|mq|default)`.

Docs: `functions/youtube/README.md` and `docs/spotify-integration.md`. The documented fallback chains are: Spotify `API → Spotify default icon → video thumbnail → null`; YouTube `scraping → YTMusic API → simple URL → video thumbnail → null`.

**Rebuild recommendation:** use the YouTube Data API `playlists.list?part=snippet` (thumbnails.maxres/high), or the `og:image` scrape, then the first track's validated thumbnail. Drop the `vi_webp/{playlistId}` pattern.

---

### 6. YouTube Data API v3 usage

The env var is `YOUTUBE_API_KEY` (`bot/.env.example`, which notes 10,000 units/day). Every function degrades gracefully without a key: it returns `[]`, `null` or `false`.

#### 6.1 Category check / music-only classification (`bot/src/functions/youtube/categoryCheck.ts`)
- **Purpose:** decide whether a YouTube result is **music** or a **video**, so the dashboard can show a square artwork vs a 16:9 video thumbnail and set the `isVideo`, `isAudioOnly` and `isMusicContent` flags. It **does not filter results out**. It only labels them.
- **`isYouTubeMusicContent(videoId)`:** `GET https://www.googleapis.com/youtube/v3/videos?part=snippet,topicDetails&id={id}&key=` (1 unit). `isMusic` is the OR of:
  1. `snippet.categoryId === '10'` (Music)
  2. a `topicDetails.topicCategories` URL containing `wiki/Music`, `wiki/Pop_music`, `wiki/Rock_music`, `wiki/Hip_hop_music`, `wiki/Electronic_music`, `wiki/Classical_music`, `wiki/Jazz`, `wiki/Country_music`, `wiki/R%26B` or `wiki/Soul_music`
  3. `snippet.channelTitle` ends with `' - Topic'`
  4. the lowercase description contains `provided to youtube by` or `auto-generated by youtube`
- No key, an API error or a missing item → `false` (treated as video).
- **`batchCheckMusicContent(ids)`:** up to 50 ids per request. Its topic list is **shorter** (only Music, Pop, Rock, Hip_hop, Electronic), which is inconsistent with the single-video check. A missing item is cached as `false`. **Unused**: the guild search calls the single-id function once per track in `Promise.all` (up to 10 API calls per search, plus 10 file writes).
- **Applied in** `GET /api/guild/:guildId/search` (`server.ts:804-817`):
  - Spotify-sourced tracks or `music.youtube.com` URIs → music, no API call.
  - YouTube tracks (`sourceName==='youtube'` or the URI contains youtube.com/youtu.be) → call the API.
- **Cache:** see §10.6.

#### 6.2 Channel search (`bot/src/functions/youtube/youtubeChannelSearch.ts`)
- **`searchYouTubeChannels(query, source='youtube'|'youtubemusic', maxResults=5)`:**
  - Check the YT search cache first.
  - For `youtubemusic`, the query becomes `"<q> official artist"`.
  - `GET /youtube/v3/search?part=snippet&type=channel&q=&maxResults=5&key=` (**100 units**).
  - Then `GET /youtube/v3/channels?part=snippet,statistics&id=<comma ids>&key=` (1 unit).
  - Result fields:
    - `id`, `name`
    - `description` (sliced to 200 chars)
    - `thumbnailUrl` (high → medium → default)
    - `subscriberCount` (undefined if `hiddenSubscriberCount`)
    - `videoCount`
    - `customUrl`
  - Empty results are cached too.
- **`getYouTubeChannelInfo(channelId)`:** `GET /channels?part=snippet,statistics,brandingSettings&id=`. **Not cached**, even though `youtubeChannelCache` exists. `bannerUrl` is not extracted.
- **`formatSubscriberCount(n)`:** `x.xM subscribers` / `x.xK subscribers` / `n subscribers`. Unused in the bot, but must preserve if the UI shows counts.

---

### 7. Search API (bot) — endpoints and response shapes

Routes are registered by `bot/src/api/routes/index.ts`. `registerRoutes` mounts the search routes at `/api`. `registerRoutesV2` mounts the same routers at `/api/v2/*` for parallel testing. The modular routers are registered **before** the inline handlers in `server.ts`. Duplicated paths (e.g. `/api/charts/billboard`) are therefore served by the modular router, and the inline copies are dead code.

#### 7.1 `GET /api/search?q=&source=` (`search.routes.ts:37-198`)
`source` defaults to `spotify`. A missing or empty `q` returns 400 `{error:'Query parameter "q" is required'}`. On exception: 500 `{error:'Search failed'}`.

The common shape (`MultiCategorySearchResult` + `source`):
```ts
{ query: string; source: string;
  topResult?: { type:'track'|'artist'|'album'; data: Track|Artist|Album; score:number } | null;
  tracks: SearchResultTrack[]; artists: SearchResultArtist[]; albums: SearchResultAlbum[];
  fromCache: boolean }
SearchResultTrack = { id, title, artist, artistId?, album?, albumId?, duration(ms), thumbnail?, uri, spotifyUrl?, youtubeUrl? }
SearchResultArtist = { id, name, imageUrl?, followers?, genres?: string[], spotifyUrl?, youtubeUrl? }
SearchResultAlbum  = { id, name, artistName, artistId?, imageUrl?, releaseDate?, trackCount?, spotifyUrl? }
```
(The types live in the missing `searchResultCache`, so they are inferred from usage.)

**Lavalink track mapping** (`getLavalinkTracks`, first 10 results):
- `id = info.identifier`, `title`, `artist = info.author`, `duration = info.length`
- `thumbnail = info.artworkUrl || info.thumbnail`
- `uri`
- `spotifyUrl` / `youtubeUrl` = the uri if it contains `spotify` / `youtube`

Modes:
- **`spotify` (default):** `multiCategorySearch` (`bot/src/functions/search/searchService.ts`):
  1. Check the search-result cache by query (§10.1). On a hit, return it with `fromCache: true`.
  2. In parallel: Lavalink tracks (raw query, so `spsearch` by default) **plus** `searchSpotify(q, ['artist','album'], 5)`.
  3. Map the Spotify artists and albums. `imageUrl` = `images[0]`. Album `artistName` = first artist, or `'Unknown'`.
  4. Batch-write the artists into the Spotify artist info cache (§10.2).
  5. Pick the top result (§7.2).
  6. Cache **only if `tracks.length > 0`**, so an empty result is retried next time.
- **`spotify-api`:** pure Spotify Web API.
  - Cache key `spotify-api:<q lower trim>` in the same search-result cache. On a hit, return `{...cached, fromCache:true, source:'spotify-api'}`.
  - `searchSpotifyTracks(q,10)` and `searchSpotify(q,['artist','album'],5)` run in parallel.
  - Tracks map as: `{ id, title=name, artist=artists[0].name, artistId, album=album.name, albumId=album.id, duration=duration_ms, thumbnail=album.images[0], uri=external_urls.spotify || open.spotify.com/track/{id}, spotifyUrl }`.
  - topResult: exact artist name match (score 1.1) → exact track title match (1.1) → first track (0.9) → first artist (0.8).
  - **v7 differs (#164):** every mode, this one included, measures its top result with the §7.2 fuzzy match. The developer chose this on 2026-11-09: no fixed scores.
  - The response `query` field is the **cache key** (`spotify-api:...`), not the user query. This quirk is visible to clients.
- **`youtube` / `youtubemusic`:**
  - Lavalink tracks (`ytsearch:`/`ytmsearch:`) and `searchYouTubeChannels(q, source, 5)` run in parallel.
  - Artists = channels: `{ id, name, imageUrl=thumbnailUrl, followers=subscriberCount, genres:[], youtubeUrl:'https://www.youtube.com/channel/{id}' }`. `albums: []`.
  - topResult: if the first channel's name includes the query (case-insensitive) → artist (score 1). Else the first track (0.9). Else `null`.
  - **v7 differs (#164):** measured with the §7.2 fuzzy match, the same as every mode.
  - `fromCache` is always false, and the tracks are **not cached** (only channels are).
  - Any other unknown `source` string also takes this branch.

#### 7.2 Top-result fuzzy match (`searchService.ts:43-123`, npm `string-similarity`)
- **Candidates:** each track twice (`title`, and `title + ' ' + artist`), then the artists (by name), then the albums (by name).
- **Exact match:** case-insensitive and trimmed. The winner is chosen by type priority track 10 > artist 2 > album 1, with `score 1.1`.
- **Otherwise:** `findBestMatch(queryLower, names)`. Keep every candidate within 0.1 of the best rating, then sort by type priority only.
- **Minimum score:** artist 0.6, others 0.2. Below the minimum, return the first track with score 0, or `undefined` if there are no tracks.
- **v7 differs (#164):** below the minimum, the first track keeps its own measured rating instead of 0.

#### 7.3 `GET /api/artist/:id` (Spotify artist page, `search.routes.ts:201-325`)
- **Cache hit** (artist detail, §10.2): the cached data is rebuilt into Spotify-like objects.
- **Cache miss:** `getArtists([id])`, `getArtistTopTracks(id)` (market TH, up to 10), `getArtistAlbums(id)` (album+single, limit 20, TH). The detail is cached only if the artist was found.
- **Response:**
```ts
{ artist: { id, name, imageUrl, followers, genres, spotifyUrl } | null,
  topTracks: { id, name, artists, album:{name,id?,images,release_date?}, duration_ms, external_urls }[],
  albums: { id, name, images, release_date, total_tracks, external_urls, album_type? }[] }
```
- `album_type` is present only on cache hits. A fresh response omits it, which makes the two shapes inconsistent.
- 500 `{error:'Failed to get artist info'}`.

#### 7.4 `GET /api/album/:id` (`search.routes.ts:374-418`)
- `getAlbumTracks(id)`: album-detail cache, else `/albums/{id}` + `/tracks?ids=`. No tracks → 404 `{error:'Album not found'}`.
- **Response:**
```ts
{ id, name, artist, artistId|null, releaseDate, images, external_urls:{spotify:'https://open.spotify.com/album/{id}'},
  tracks: { id, title, artist: artists.map(name).join(', '), artistId|null, duration(ms), uri: external_urls.spotify }[] }
```
- Album metadata is taken from **the first track**.
- **Bug:** on a cache hit, the rebuilt tracks have `artists:[{name}]` with no `id`, so `artistId` is `null` and only one artist name appears.
- The dashboard proxy uses a 15 s timeout.

#### 7.5 `GET /api/youtube/channel/:id` (`search.routes.ts:328-371`)
- `getYouTubeChannelInfo(id)` (not cached); 404 if missing.
- "Top tracks" = Lavalink `ytsearch:<channelName> official`, first 10. This is not the channel's real uploads.
- **Response:**
```ts
{ artist:{id,name,imageUrl,followers,genres:[],youtubeUrl,source:'youtube'}, topTracks:{id,title,artist,duration,thumbnail,uri}[] }
```

#### 7.6 `GET /api/guild/:guildId/search?q|query=&userId=` (inline in `server.ts:723-855`; the dashboard popup)
- 503 if `!client.manager.initiated`. 400 if the query is empty. 404 if the guild is unknown.
- The requester member is fetched when `userId` is given.
- `manager.resolve({query, requester})`, so raw URLs and default-platform search both work.
- **Playlist result:** `playlistInfo = {name, trackCount, thumbnail: getPlaylistThumbnailMain(query, firstTrack.thumbnail, auto) || validateAndConvertThumbnail(...), url: query}`. All tracks are returned.
- **Search result:** the first 10 tracks.
- **Per track:**
```ts
{ title, author, duration, uri, thumbnail, identifier, source: info.sourceName,
  isVideo: isYouTube && !isMusic, isAudioOnly: isSpotify || isMusic, isMusicContent }
```
- **Response:** `{ tracks, isPlaylist, playlistInfo|null }`. With no result: `{tracks:[]}`.

#### 7.7 `POST /api/playlist/fetch {url}` (inline `server.ts:1480-1717`; used to import playlists into saved playlists)
- 400 if there is no URL. 503 if the manager is not ready.
- `resolve(url)`:
  - `error` → 400 `{error, details: exception.message}`
  - `empty`/`no_results` → 404
- **Playlist:**
  - For Spotify, it calls `spotifyClient.getPlaylist(id)` to get per-track `albumName`, `albumReleaseDate`, `albumArtUrl` and `addedAt`. These are keyed by the **Spotify track id**, matched against `track.info.identifier` (LavaSrc spotify tracks use the Spotify id as identifier). The data is cached in the album cache's track→album map (§10.4).
  - Album fallback: `info.album || info.albumName || info.albumTitle`.
  - `addedAt`: the Spotify `added_at`, else now (ISO).
  - Owner: `playlistInfo.author`. For Spotify the fallback is the first track's artist; otherwise `'Unknown'`.
  - Thumbnail via `getPlaylistThumbnailMain`, as above.
  - Response: `{success:true, loadType:'playlist', platform, playlist:{name, thumbnail, trackCount, owner}, tracks:{title, artist, duration, thumbnail, uri, album?, addedAt}[]}`.
- **Track/search:** `{success:true, loadType:'track', platform, tracks:[{title,artist,duration,thumbnail,uri}]}`.
- Any other load type → 400 `{error:'Unsupported content type', loadType}`.
- The handler logs a lot of `[API DEBUG]` output (the full first-track JSON). Remove it in the rebuild.

#### 7.8 Dashboard proxies (Next.js, `dashboard/app/api/...`)
| Route | Forwards to | Timeout | Env |
|---|---|---|---|
| `search/route.ts` | `/api/search?q=&source=` (default `spotify`) | 10 s → 504 `Search timeout` | `BOT_API_URL` (default `http://localhost:3001`) |
| `artist/[id]` | `/api/artist/{id}` | 10 s | `BOT_API_URL` |
| `album/[id]` | `/api/album/{id}` | 15 s | `BOT_API_URL` |
| `youtube/channel/[id]` | `/api/youtube/channel/{id}` | 10 s | `BOT_API_URL` |
| `player/[guildId]/search` | `/api/guild/{gid}/search?q=&userId=` | none | **`NEXT_PUBLIC_BOT_API_URL`** (inconsistent env name) |

- All proxies pass the status code through, with `{error}`.
- None of them authenticate the user. The bot API itself has no auth on these routes.

---

### 8. Discord autocomplete (`/play`, `/playnext`, `/playat`, `/skipplay`)

This logic is copy-pasted in four files: `bot/src/commands/lavalink/play.ts:45-135`, plus `playnext.ts`, `playat.ts` and `skipplay.ts`. The details differ slightly between files (e.g. where the cache check sits relative to the deezer check).

- **Data source:** Lavalink `manager.resolve` (`loadTracks(query, member)`) using the **default platform** (`spsearch`). No player is created.
- **Min chars:** none. An empty query returns the choice `{name:'กรุณาระบุเพลง', value:'no_song'}`. There is no debounce beyond Discord's own.
- **Result count:** `config.json.lavalink_config.autocomplete_results_limit` = **7** (Discord allows at most 25).
- **Choice label:** `` `(${author}) ${title}` `` truncated with `.slice(0,100)`.
- **Choice value:** `label.slice(0,100) + track.info.uri`. For a `music.youtube` URL it is `label + query`; for youtube/youtu.be/spotify URLs it is `info.uri || query`.
  - **Bug:** the value can exceed Discord's 100-char limit, in which case `respond()` fails and the error is swallowed by `.catch(()=>{})`.
  - **Quirk:** the run handler gets `"(Artist) Titlehttps://..."`, which does not start with `https`, so it is **re-searched as text**. The rebuild should use a short value (the URI, or an id into a per-interaction map) and resolve it deterministically.
- **URL input:**
  - deezer / music.apple → `{name:'ไม่รองรับ Platform นี้', value:'error'}`
  - load error/no_results → `{name:'(ข้อผิดพลาด) กรุณาใส่ URL ที่ถูกต้อง', value:'error'}`
  - **playlist** → a single choice:
    - name: `` `(${n} เพลง) ${name}` ``; Mix playlists show `สถานีวิทยุ…`
    - value: the music.youtube.com-rewritten playlist URL (or the original URL for a Mix)
- **No results:** `{name:'ไม่พบเพลงที่ค้นหา', value:'error'}`. **Exception:** `{name:'เกิดข้อผิดพลาดในการค้นหา', value:'error'}`. The run handler turns `error`/`no_song` into error embeds.
- **Bug:** `let mix` is a **module-global** flag. It is set during autocomplete and consumed by the next `/play` run from any guild or user, so it can leak across guilds.
- **Cache:** see §10.7.

---

### 9. Playlist metadata (`bot/src/functions/lavalink/playlistMetadata.ts`)

- **`addPlaylistMetadata(tracks, playlistName, playlistUrl, playlistThumbnail?)`** mutates every track to add:
  - `playlistName`, `playlistUrl`, `playlistThumbnail`
  - `isFromPlaylist=true`
  - `playlistIndex` (1-based)
  - `playlistTotalTracks = tracks.length`
- **Accessors:** `isFromPlaylist`, `getPlaylistName`, `getPlaylistThumbnail`, `getPlaylistUrl`, `getPlaylistMetadata`.
- **`formatPlaylistInfo(track, format)`:**
  - `'short'` → `` จาก: ` <name> ` `` (inline code)
  - `'full'` → `จาก: **<name>** **(**i/n**)**`
  - `'index-only'` → `` `(i/n)` ``
  - default → `จาก: <name>`
  - The docs show older emoji variants (`📄 …`), which are outdated.
- **`createPlaylistEmbedField(track)`** → `{name:'`📄` Playlist', value:'**<name>**\nเพลงที่ i จาก n เพลง', inline:true}`.
- **Per-source extraction:**
  - title = Lavalink `playlistInfo.name` (Mix → `สถานีวิทยุ…`)
  - thumbnail per §5.3
  - URL = the user query (rewritten to music.youtube.com for YouTube playlists)
  - owner (dashboard fetch only) = `playlistInfo.author`, with a first-track-artist fallback for Spotify
- **`author_url_config.use_playlist_url`** (currently **false**): when true, the embed's "Go to Page" author link points to the playlist URL for tracks from a playlist; otherwise it points to the track URL (`docs/author-url-configuration.md`).
- Playlist embed lines (docs): `📝 Playlist: <name>`, `⌛ เวลา: <total duration>`, `📊 มี: N เพลง`, `คิวทั้งหมด: M เพลง`. The trackStart line is `▶️┃**Title** 3:45` + `> จาก: <name> (i/n)`.

---

### 10. Every cache in scope

All file caches live under a `cache/` directory, but the paths are computed **inconsistently**:
- `path.join(__dirname,'../../../cache')` resolves to `bot/cache/` when running from `src/functions/*/` with Bun.
- `path.join(process.cwd(),'cache')` (categoryCheck and the admin stats) depends on the cwd.

The rebuild should move every cache to **Redis** with the TTLs below. Supabase is only needed if something must survive Redis eviction.

Common pattern for the JSON caches:
- In-memory `Map` loaded at startup by `init*()`; expired entries are skipped on load.
- Lazy TTL eviction on `get`.
- Saved to JSON, debounced 30 s after the last change (where `scheduleDebouncedSave` is actually called).
- `shutdown*()` on SIGINT/SIGTERM saves if dirty (`server.ts:106-126`).
- `get*Stats()` → `{entries, isDirty, cacheFile[, ttlMinutes]}`, surfaced in `GET /api/admin/stats` → `cacheStats[]` as `{name, size(bytes), items}`. Names: `Search Results`, `Spotify Artists`, `Spotify Albums`, `YouTube Search`, `History Cache`, `Playlist Cache`, `Queue Backup`, `User Cache`, `Billboard Charts`, `YouTube Categories`, `Session Cache` (`server.ts:278-290`).
- **No max size or LRU** on any of the JSON caches.

#### 10.1 Search result cache — RECONSTRUCT — source missing (`functions/cache/searchResultCache`)
- **API used:** `getSearchResult(query)`, `setSearchResult({query, topResult, tracks, artists, albums})`, `initSearchResultCache()`, `shutdownSearchResultCache()`, `getSearchCacheStats()` → `{entries, cacheFile}`.
- **Types:** `SearchResult`, `SearchResultTrack`, `SearchResultArtist`, `SearchResultAlbum`.
- **Keys:** the raw query for `spotify` mode (normalization unknown; probably lower/trim), and `spotify-api:<lower trim q>` for spotify-api mode. **YouTube modes are not cached.**
- **Value:** the result without `fromCache`.
- **TTL:** unknown. Choose one (suggest 30 min–24 h).
- **Persistence:** a JSON file (the name is unknown; it is referenced via `searchStats.cacheFile`).
- **Rule:** never cache a result with 0 tracks (spotify mode).

#### 10.2 Spotify artist cache (`bot/src/functions/spotify/spotifyArtistCache.ts`)
- **File:** `cache/spotify-artist-cache.json`, shaped `{artists:{[id]:CachedArtistInfo}, artistDetails:{[id]:CachedArtistDetail}, lastUpdated}`.
- **Info map:** key = Spotify artist id. Value `{id?, name, imageUrl, followers, genres, spotifyUrl, cachedAt}`. Filled by `setArtistInfoBatch` from every spotify-mode search.
  - **`getArtistInfo` and `getMissingArtistIds` are imported by searchService but never used.** The cache is write-only.
- **Detail map:** key = artist id. Value `{artistId, name, imageUrl, followers, genres, spotifyUrl, topTracks:{id,name,artistName,albumName,albumId,imageUrl,duration,uri:'spotify:track:id'}[], albums:{id,name,imageUrl,releaseDate,totalTracks,albumType}[], cachedAt}`. Used by `/api/artist/:id`.
- **TTL:** 7 days for both maps.
- **Bug:** `setArtistInfo`, `setArtistInfoBatch` and `setArtistDetail` mark the cache dirty but **do not schedule a save**. Data is persisted only by `clearCache` or at shutdown, so a crash loses it.
- `AUTO_SAVE_INTERVAL` (5 min) is declared and unused.
- `clearCache()` clears both maps and saves after the debounce.
- **Stats:** `getArtistCacheStats()` counts only the info map.

#### 10.3 YouTube channel search cache (`bot/src/functions/youtube/youtubeSearchCache.ts`)
- **File:** `cache/youtube-search-cache.json`, shaped `{searches:{[key]:CachedSearchResult}, lastUpdated}`.
- **Key:** `` `${query.toLowerCase().trim()}:${source}` `` with source `youtube|youtubemusic` (e.g. `keshi:youtube`).
- **Value:** `{query, source, channels:{id,name,description,thumbnailUrl,subscriberCount,videoCount,customUrl}[], cachedAt}`. Empty channel lists are cached.
- **TTL:** 30 min. Save debounced 30 s on every set and on clear.
- **Stats:** `getYouTubeCacheStats()` → `{entries, isDirty, cacheFile, ttlMinutes:30}`.
- **Quirk:** `initYouTubeSearchCache()` is called twice: `server.ts:110` and again at `:3256`. Each call reloads the file into the map.
- **Purpose:** save quota (search.list costs 100 units).

#### 10.4 Spotify album cache (`bot/src/functions/spotify/spotifyAlbumCache.ts`)
- **File:** `cache/spotify-album-cache.json`, shaped `{tracks:{[spotifyTrackId]:CachedAlbumInfo}, albums:{[albumId]:CachedAlbumDetail}, lastUpdated}`.
- **tracks map:** track id → `{albumName, albumReleaseDate, albumArtUrl, addedAt, cachedAt}`. Filled by `/api/playlist/fetch` for Spotify playlists.
  - **It is never read for that purpose:** the fetch always calls the API, and `getAlbumInfo` / `getMissingTrackIds` are imported but unused.
  - `addedAt` is playlist-specific but keyed per track only, which is a design flaw.
- **albums map:** album id → `{albumId, albumName, artistName, artistId, imageUrl, releaseDate, spotifyUrl, tracks:{id,name,artistName,duration,uri:'spotify:track:id'}[], cachedAt}`. Used by `getAlbumTracks` / `/api/album/:id`.
- **TTL:** 7 days.
- **Saves:** `setAlbumDetail` schedules a debounced save; `setAlbumInfoBatch` does **not** (same bug as §10.2).
- **Quirk:** `/api/playlist/fetch` calls `initSpotifyAlbumCache()` **on every request** (`server.ts:1554`). This re-reads the file, can overwrite newer in-memory entries with stale file data, and spams logs.
- **Stats:** `getCacheStats()` counts only the tracks map.

#### 10.5 YouTube channel detail cache (`bot/src/functions/youtube/youtubeChannelCache.ts`)
- **File:** `cache/youtube-channel-cache.json`, shaped `{channels:{[channelId]:CachedChannelDetail}, lastUpdated}`.
- **Value:** `{channelId, name, description, thumbnailUrl, bannerUrl, subscriberCount, videoCount, customUrl, videos:{id,title,channelTitle,thumbnailUrl,duration,publishedAt,category:'music'|'video'}[], cachedAt}`.
- **TTL:** 1 h. Debounced save.
- **Status:** initialised and shut down, but **`get/setChannelDetail` are never called** (`/api/youtube/channel/:id` does not use it). The schema shows the intended channel-page model (banner + videos labelled music/video). Rebuild: either implement the channel page with this cache or drop it.

#### 10.6 YouTube category cache (`bot/src/functions/youtube/categoryCheck.ts`)
- **File:** `path.join(process.cwd(),'cache','youtube-categories.json')`, a flat object `{[videoId]:{isMusic:boolean, timestamp:number}}`.
- **TTL:** 7 days. A code comment in server.ts says 24 h, which is stale.
- Lazy-loaded on first use. Expired entries are not purged from the file.
- **Saves:** the **whole file is rewritten synchronously after every single-video API check** (so up to 10 writes per guild search), and once per batch.
- `clearCategoryCache()` clears memory only. `getCacheStats()` → `{size, hitRate:0}` (hit rate is not tracked).

#### 10.7 Autocomplete cache — RECONSTRUCT — source missing (`functions/cache/autocompleteCache`)
- **API used:** `getCache(key)` → choices[] | null; `setCache(key, choices)`; `getCacheStats()` → `{totalFiles, totalSize(bytes), oldestFile: Date|null}`; `clearAllCache()`.
- **Key:** `` `autocomplete_${default_search_platform}_${query}` `` (raw query, case-sensitive). The platform prefix exists so that changing the platform invalidates the cache.
- **Value:** the Discord choices array `{name, value}[]`. Only stored if `choices[0].value` does not include `'error'`.
- **Spec from `docs/autocomplete-cache.md`:**
  - **one JSON file per key** named by an **MD5 hash** of the query, in `cache/`
  - content `{data, timestamp, query}`
  - `CACHE_EXPIRY = 30 min`; an expired file is deleted on read (`fs.unlinkSync`)
  - `MAX_CACHE_SIZE = 1000` files; on every write, expired files are purged and then the oldest are deleted beyond 1000
  - "does not cache URL links directly" (doc claim; the code above *does* cache URL lookups under the same key scheme, so this needs verifying)
- **Admin command `/cache`** (`bot/src/commands/cache.ts`), option `action` (required, choices `stats` | `clear`), replies are ephemeral:
  - `stats` → embed "📊 Cache Statistics" with fields: file count, total size KB (2 dp), oldest file as `<t:unix:R>`; footer "Cache จะหมดอายุภายใน 30 นาที".
  - `clear` → clears everything and shows the before-counts. Logs `[CACHE] Cache cleared by <tag>`. On error, an `embed_fail` embed.
  - **No permission check:** any user can clear the cache. The rebuild must restrict it to bot owner/admin.
- **Rebuild:** Redis `autocomplete:{platform}:{sha1(normQuery)}` with TTL 1800 s. LRU comes from Redis `maxmemory-policy`, or use a sorted set capped at 1000.

#### 10.8 Billboard charts cache — RECONSTRUCT — source missing (`functions/cache/billboardCache`)
- **API used:**
  - `initBillboardCache()` (awaited at server start, `server.ts:3250`)
  - `scheduleBillboardUpdates()` (`:3259`)
  - `fetchBillboardChart(force:boolean)` → `{tracks, lastUpdated, date, chart}|null`
  - `getBillboardTracks(limit, offset)`
  - `getTopBillboardTracks` (imported, unused)
  - `getBillboardRecommendations(limit)`
- **Data source:** RapidAPI "billboard-api2" (`RAPIDAPI_KEY` in `.env.example`, `https://rapidapi.com/SUSPENDED/api/billboard-api2`). The `SUSPENDED` in that URL suggests the provider may be dead, so verify before rebuilding. The dashboard calls it the "Billboard Radio Songs chart".
- **Refresh:** "cached, updates every 3 days" (comments in `charts.routes.ts:15` and `dashboard/lib/top-charts.ts:131`).
- **File:** `cache/billboard-charts.json`.
- **Enrichment:** each track is likely enriched via `spotify/index.ts:searchSpotifyTrack(title, artist)` → `thumbnail`, `artistImage`, `url` (Spotify track URL), `source`.
- **Track shape** (dashboard `BillboardTrack`):
```ts
{ rank:string, title, artist, image, thumbnail?, artistImage?, url?, source?, weeksAtNo1?, lastWeek, peakPosition, weeksOnChart, detail:'up'|'down'|'same' }
```
- **Endpoints** (`bot/src/api/routes/charts.routes.ts`, mounted at `/api/charts`):
  - `GET /api/charts/billboard?refresh=true&limit=100&offset=0`
    - `refresh=true` → `fetchBillboardChart(true)`; otherwise `getBillboardTracks(limit, offset)` + `fetchBillboardChart(false)` for metadata.
    - 503 `{error:'Billboard chart data not available'}` if null.
    - Success: `{success:true, lastUpdated, date, chart, total, count, tracks}`.
    - 500: `{error, details}`.
    - **`refresh=true` is unauthenticated**, so anyone can burn the RapidAPI quota.
  - `GET /api/charts/billboard/recommendations?limit=10` → `{success:true, count, tracks}` ("formatted for player"; the shape is unknown).
- **Dashboard** (`dashboard/lib/top-charts.ts`):
  - `fetchBillboardChart()` → `GET {NEXT_PUBLIC_BOT_API_URL}/api/charts/billboard`. A non-JSON response or an error → `null`.
  - `billboardToChartTracks()` maps to `ChartTrack{id:'billboard-<rank>', title, artist, thumbnail: thumbnail||image, duration:0, url: url||'', position: parseInt(rank), source}`. Used by `components/NowPlayingSection.tsx` (the "top-charts" section).
  - `fetchTopCharts(region='thailand'|'global', limit=10)` → `GET /api/top-charts/{region}?limit=`. **That endpoint does not exist in the bot**, so it always falls back to the 4 hardcoded `FALLBACK_TRACKS` (APT., Die With A Smile, Whiplash, number one girl; Spotify URLs) with `playlistName 'Top Hits (Offline)'`.
  - `getTopCharts()` is deprecated and returns the fallback.
  - This implies a planned Spotify-playlist-based Thailand/Global top chart.

#### 10.9 Playlist cache — RECONSTRUCT — source missing (`functions/cache/playlistCache`)
- Owned by another note (saved playlists). In this scope: `getPlaylistCacheStats()` → `{totalPlaylists}`, file `cache/playlist-cache.json`, `GET /api/playlist-stats`.

#### 10.10 Uncached lookups that should be cached in the rebuild
- `getArtistImage(name)` (every embed)
- `getSpotifyPlaylistThumbnail`
- `getYouTubeChannelInfo`
- the YouTube playlist thumbnail scrape
- `isValidImageUrl` HEAD results
- the Spotify token in `spotify/index.ts`

---

### 11. Config and env relevant to this area

- **`bot/src/config/config.json`:**
  - `lavalink_config.default_search_platform` (`spsearch`)
  - `lavalink_config.volume_default` (15)
  - `lavalink_config.default_image`
  - `lavalink_config.autocomplete_results_limit` (7)
  - `icon_config.{normal_track, playlist_display, playlist_track}`
  - `author_url_config.use_playlist_url`
  - `embed_color` `#e4854a`, `embed_fail` `#FF0000`
- **`bot/.env.example`** (values are placeholders):
  - `DISCORD_TOKEN`
  - `DATABASE_URL` (a mongodb+srv example, despite Prisma/PG elsewhere)
  - `LOG_GUILD_ID`, `LOG_CHANNEL_ID`
  - `LAVALINK_PORT/HOST/PASS/SECURE`
  - `API_PORT=3001`
  - `RAPIDAPI_KEY`
  - `YOUTUBE_API_KEY`
  - `FIREBASE_PROJECT_ID/PRIVATE_KEY/CLIENT_EMAIL`
  - **No Spotify vars.** `bot/README.md` documents `SPOTIFY_CLIENT_ID/SECRET`, but no code reads them.
- **Dashboard env:** `BOT_API_URL` (server proxies) vs `NEXT_PUBLIC_BOT_API_URL` (player search proxy, top-charts).
- **`bot/package.json` dependencies in this area:**
  - `riffy ^1.0.12`
  - `string-similarity ^4.0.4`
  - `yaml ^2.8.1`
  - `axios ^1.9.0`
  - `ytmusic-api ^5.3.0`
  - `youtubei.js ^15.0.1` (unused code path)
  - `youtube-sr ^4.3.12` (**unused**)
  - `ytdl-core ^4.11.5` (**unused**)
  - `fs ^0.0.1-security` (junk package)
  - Runtime is Bun (`bun --watch --smol src/index.ts`). The `start` script is `bun bun run --smol src/index.ts`, which looks broken (double `bun`).

---


---

## 5. Data model (Firestore, MongoDB/Prisma, local files; Supabase = target)

Listening-session and play-history documents are written by the bot. Their full field lists and write semantics are in §2 (part §6). Cache stores and TTLs are in §4 (part §10). The Queue Cache file is described in §2 (part §5). Supabase is not used in v5; it is the ADR 0002 target.

### F. Persistence: Firestore + Prisma

#### F.1 Firestore collections ACTUALLY used by code
| Path | Doc id | Writer | Readers | Fields |
|---|---|---|---|---|
| `users/{uid}` | `discord_{discordId}` | Next `/api/auth/discord/callback` (Admin SDK, merge) | `/api/user/me`, `/api/auth/discord/user/guilds`, `/api/admin/users`, admin user-detail page (client SDK `getDoc`) | `id`(=doc id), `discordId`, `username`, `discriminator`, `email`, `avatar` (hash\|null), `verified`, `accessToken`, `refreshToken`, `tokenExpiresAt` (number ms), `guilds: {id,name,icon,owner}[]`, `createdAt` (Timestamp, first login), `updatedAt` (Timestamp). Read-but-never-written-by-dashboard: `lastActive` (Timestamp), `playCount` (admin detail), `totalPlayCount` (`/api/admin/users`), `permissions` (useAuth) — inconsistent field names (`playCount` vs `totalPlayCount`), possibly written by the bot or never populated. Schema-doc-only: `preferences {language:'th'\|'en', theme:'light'\|'dark'\|'auto', notificationsEnabled}`. |
| `adminWhitelist/{discordId}` | Discord ID | Next `/api/admin/whitelist` POST/PATCH/DELETE | GET | `discordId`, `username`, `role: 'admin'\|'developer'`, `addedAt` (Timestamp), `addedBy` (discordId or 'unknown'). **Not in FIRESTORE_SCHEMA.md.** |
| `playlists/{autoId}` | Firestore auto id | Next `/api/playlists` (unused) and bot `/api/playlists` (live, batched) | same | `id`, `userId` (discordId), `name`, `description`, `thumbnail`, `trackCount`, `tracks: PlaylistTrack[]` (embedded array), `sourcePlatform` ('spotify'\|'youtube'\|'custom'\|null), `sourceUrl`, `createdAt`, `updatedAt`. Query `where userId ==` (sorted in memory → no composite index). **Not in schema doc.** |
| `playHistory/{guildId}/userHistory/{userId}/tracks/{trackId}` | `trackId = base64(title + '-' + author)` with `/ + =` → `_` (`bot/src/functions/history/playHistory.ts:65`) | bot (write-behind batched every ~5 min per comment) | Next `/api/player/{g}/top-played` (orderBy playCount desc limit 30; writes back `isMusic/isVideo`) | `title`, `artist`, `url`, `thumbnail`, `duration` (ms), `source` ('youtube'\|'spotify'\|'soundcloud'\|'deezer'\|'unknown'), `isMusic`, `isVideo`, `playCount`, `totalPlayTime`, `lastPlayedAt` (Timestamp); schema doc adds `addedAt`, `updatedAt`. |
| `playHistory/global/userHistory/{userId}/tracks/{trackId}` | same id scheme | bot | bot `getUserHistory(userId, limit, sortBy 'playCount'\|'lastPlayedAt')` → dashboard via `/api/user/{id}/history`, admin `/api/admin/user/{id}/history` | same fields. ("global" is a pseudo-guild doc id.) |
| `playHistory/{guildId}/serverHistory/tracks/items/{trackId}` | same id scheme | bot | bot `getServerHistory` (orderBy playCount desc limit 20) → `/api/guild/{g}/history` | same fields. (Schema doc says `guildHistory/topTracks` — **outdated**; bot file header says `serverHistory/tracks/{trackId}` but code uses `serverHistory/tracks/items/{trackId}`.) |
| `playHistory/{guildId}/sessions/{sessionId}` | session id (bot-generated) | bot `flushSessionToFirebase` (batch `set merge`) | bot (orderBy `startTime` desc limit N) → `/api/guild/{g}/sessions`, `/api/user/{id}/sessions`, `/api/admin/session/{id}`, `/api/admin/user/{id}/sessions` | `sessionId`, `guildId`, `guildName` ('Unknown Server' default), `channelId`, `startTime` (ms), `endTime` (ms\|null), `isActive`, `trackCount`, `participantCount`, `tracks: SessionTrack[]` (embedded, all tracks), `participants: SessionParticipant[]` (embedded), `lastUpdated` (serverTimestamp). |

**Indexes needed** (implied by queries): `tracks` collection-group-less single-field desc on `playCount` and on `lastPlayedAt` (auto single-field indexes suffice); `sessions` desc on `startTime`; `users` desc on `createdAt`. The schema doc lists playHistory by `playCount` DESC, favorites by `savedAt` DESC, playHistory by `lastPlayedAt` DESC. No `firestore.rules` / `firestore.indexes.json` / `firebase.json` exists in the repo.

**Bot history writes depend on modules missing from this checkout**: `bot/src/functions/history/playHistory.ts:15` imports `../cache/historyCache` (and dynamically `../cache/userCache`), but no `historyCache.ts`/`userCache.ts` exists under `bot/` (only `functions/{convertTime,guildSettings.ts,history,lavalink,prisma.ts,search,spotify,youtube}`) — verify with the bot-side notes.

#### F.2 Collections in `FIRESTORE_SCHEMA.md` but NOT used by any code (aspirational)
- `guilds/{guildId}`: `id, name, icon, ownerId, musicConfig {musicChannelId, autoPlayEnabled, defaultVolume (0-100), prefix}, botStatus {connected, playerActive, lastSeen}, members[{userId, roles[], canPlayMusic, canManageQueue, canEditSettings}], createdAt, updatedAt`.
- `favorites/{userId}/tracks/{trackId}` and `favorites/{guildId}/topTracks/{trackId}`: `id, title, artist, duration, url, thumbnail, source, savedAt, genre, notes, guilds[{guildId, playCount, lastPlayedAt}]`.
- `guildConfig/{guildId}`: `musicChannels[{channelId, name, isPrimary, allowDjRole, autoRemoveMessages}], permissions{requireRoleToPlay, djRoleId, allowedRoles[]}, announcements{enableNowPlaying, enableTrackEnd, channelId}, stats{totalTracksPlayed, totalPlayTime, uniqueArtists, uniqueTracks}, createdAt, updatedAt`.
- These describe intended features (DJ role, per-guild permissions, favorites, announcements) that the rebuild may choose to implement; they are not current behaviour.

#### F.3 Security rules (from `FIRESTORE_SCHEMA.md:200-242`; deployment status unknown — no rules file in repo)
- `users/{userId}`: read/update only if `request.auth.uid == userId`; create if signed in; no delete. ⇒ **breaks the admin user-detail page's client-side read of another user's doc** (falls back to bot cache).
- `guilds/{guildId}`: read/create any signed-in; update/delete only `ownerId == uid` (note uid is `discord_{id}`, ownerId is a Discord id → would never match).
- `playHistory/{g}/userHistory/{u}/tracks/{t}`: read any signed-in; write if `uid == userId`.
- `favorites/{u}/tracks/{t}`: owner only. `guildConfig/{g}`: read signed-in; write guild owner.
- No rules for `adminWhitelist`, `playlists`, `sessions`, `serverHistory`, `global` (all access goes through Admin SDK, which bypasses rules).
- Doc's "Data Sync Flow" (Bot → Firestore realtime → Dashboard WebSocket) is **not** how it works: dashboard never uses Firestore listeners; realtime is bot SSE.

#### F.4 Prisma (bot, MongoDB) — `bot/prisma/schema.prisma`
- Generator `prisma-client-js`, output `../src/lib/prisma`; datasource `mongodb`, `url = env("DATABASE_URL")`.
- `model Prefix { id String @id @default(auto()) @map("_id") @db.ObjectId; guild_id String; prefix String?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt }` — per-guild text-command prefix (no unique on guild_id).
- `model GuildSettings { id ObjectId PK; guildId String @unique; guildName String?; ownerId String /* Discord user who invited the bot — can control without being in voice */; musicChannelId String? /* text channel for music commands & notifications */; createdAt; updatedAt }` — source of the "Bot owner in this guild" permission and the music-channel setting edited via `/api/guild/{g}/settings` (bot creates it on first POST with `ownerId = guild.ownerId`, `bot/src/api/routes/guild.routes.ts:51-58`).

---

### E. Types

#### E.1 `types/bot.ts`
- `BotStatus { state: 'online'|'offline'|'starting'|'idle'|'playing'|'paused'; uptime: number(ms); guilds: number; lastUpdated: Date; version: string }` (only online/offline produced).
- `Track { title; artist; thumbnail; duration(ms); position?; url; requestedBy: { id; username; avatar } }`.
- `BotData { status: BotStatus; currentTrack: Track|null; queue: Track[] }` (unused).
- `User { id (Firebase uid = 'discord_{discordId}'); discordId; username; avatar (full URL); permissions: string[]; createdAt: Date }`.
- `BotLog { id; timestamp: Date; action; userId; details: Record<string,any>; guildId }` (unused).
- `Stats { id; date; songsPlayed; commandsUsed; uniqueUsers; totalPlaytime }` (unused).

#### E.2 `types/queue.types.ts`
- `QueueSong { id; videoId; title; artist; duration; thumbnail?; addedAt: number; addedBy: string(userId); opId: string (unique op id for dedup); status?: 'pending'|'confirmed'|'failed'; pendingSince?: number }`.
- `QueueState { guildId; revision: number; songs: QueueSong[]; currentSong?: QueueSong|null; checksum: string (comment says MD5, actually 32-bit hash); lastModified: number }`.
- `QueueComparisonResult { matches; missingInClient: QueueSong[]; missingInServer: QueueSong[]; revisionChanged; serverRevision; clientRevision }` (only `matches` is ever meaningful).
- `SSEQueueUpdate { type:'queueUpdate'; guildId; revision?; sequence?; data:{ queue: any[] }; timestamp }`.

#### E.3 `types/session.ts` (listening sessions; mirrors bot Firestore `playHistory/{guildId}/sessions/{sessionId}`)
- `SessionParticipant { userId; username; avatarURL; joinedAt: number }`.
- `SessionTrack { title; author; uri; thumbnail; duration(ms); playedAt: number; requesterAvatar?; requesterName? }`.
- `ListeningSession { sessionId; guildId; guildName?; channelId; startTime(ms); endTime?; tracks: SessionTrack[]; participants: SessionParticipant[]; isActive; trackCount; participantCount }`.

---


---

## 6. Auth & permissions (Discord OAuth, Firebase, View/Control, admin/developer) and dashboard server routes

The bot side of permissions (`checkControlPermission`, `canUserControlBot`, `canUserViewBot`) is in §3 (part §2). Note that the bot has no authentication (see §0.3) and no admin bypass (§0.4).

### C. Auth & permissions

#### C.1 Env / config (`.env.example`; values redacted)
| Var | Side | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID / _STORAGE_BUCKET / _MESSAGING_SENDER_ID / _APP_ID` | client | Firebase web SDK (`lib/firebase.ts`; logs a "Firebase Config Check" of which keys are present) |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | client+server | OAuth client id |
| `NEXT_PUBLIC_DISCORD_REDIRECT_URI` | client+server | e.g. `http://localhost:3000/api/auth/discord/callback`; also used to derive post-login base URL |
| `DISCORD_CLIENT_SECRET` | server | token exchange |
| `NEXT_PUBLIC_BOT_API_URL` | client+server | bot HTTP/SSE base (default `http://localhost:3001`) |
| `FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY` | server | Admin SDK service account (`lib/firebase-admin.ts`, `\\n`→newline). Same vars in bot (`bot/src/lib/firebase.ts`; if missing, bot disables play-history tracking with a warning). |
| `YOUTUBE_API_KEY` | server | top-played music detection |
| `NEXT_PUBLIC_VOLUMEDEFAULT` | client+server | default volume (15) sent with `play` |
| (undocumented) `BOT_API_URL` | server | used by 7 routes, see B.0 |

#### C.2 Discord OAuth → Firebase login, end to end
1. **`/login`** (`app/login/page.tsx`): button calls `getDiscordAuthorizationUrl()` (`lib/discord-auth.ts:37-49`) → `https://discord.com/api/oauth2/authorize?client_id=…&redirect_uri=…&response_type=code&scope=identify email guilds` (**no `state`, no PKCE, no `prompt`**). Opens in a **centered popup 500×700** named "Discord Login". Popup blocked → Thai error. Listens to `window` `message`: `{type:'DISCORD_LOGIN_SUCCESS'}` → `window.location.href='/'`; `{type:'DISCORD_LOGIN_ERROR', error}` → show error. Polls `popup.closed` every 500 ms to reset loading. Reads `?discord_error=` to show server-side errors.
2. **Discord → `GET /api/auth/discord/callback?code=…`** (in the popup):
   - `getDiscordAccessToken(code)` → `POST https://discord.com/api/v10/oauth2/token` (form-urlencoded `client_id, client_secret, grant_type=authorization_code, code, redirect_uri`) → `{access_token, refresh_token, expires_in}`.
   - `getDiscordUser` → `GET /api/v10/users/@me`; `getDiscordUserGuilds` → `GET /api/v10/users/@me/guilds` (Bearer).
   - Upsert Firestore `users/discord_{discordId}` via `set(..., {merge:true})`: `{ id, discordId, username, discriminator, email, avatar (hash|null), verified, accessToken, refreshToken, tokenExpiresAt: Date.now()+expires_in*1000 (number ms), guilds:[{id,name,icon,owner}], updatedAt: Date }`, plus `createdAt: Date` only when new (`callback/route.ts:29-57`). Discord guild `permissions`/`features` are **dropped**.
   - `adminAuth.createCustomToken('discord_{id}', { discordId, username, email })` → developer claims.
   - Redirect popup to `/login/callback?token={customToken}` (**custom token in URL query**).
3. **`/login/callback`** (`app/login/callback/page.tsx`): `signInWithCustomToken(auth, token)`; success → if `window.opener`: `postMessage({type:'DISCORD_LOGIN_SUCCESS'}, '*')` then `window.close()` after 1 s, else `router.push('/')` after 1.5 s; failure → `postMessage({type:'DISCORD_LOGIN_ERROR', error}, '*')`. (**targetOrigin `'*'`; opener does not check `event.origin`.**)
4. **Session persistence**: Firebase Auth web SDK default local persistence (IndexedDB) — survives reloads/tabs. No server session or cookie. The Firebase ID token (auto-refreshed by SDK) is sent only to `/api/user/me`.
5. **`AuthProvider` / `useAuth`** (`hooks/useAuth.tsx`):
   - 3 s safety timeout forces `loading=false` if `onAuthStateChanged` hasn't fired.
   - On user: `getIdToken()` → `GET /api/user/me` → `User { id: uid, discordId, username||'Unknown', avatar URL, permissions: userData.permissions||[], createdAt (from Firestore `_seconds`) }`. Avatar: `https://cdn.discordapp.com/avatars/{discordId}/{hash}.png`, or default `https://cdn.discordapp.com/embed/avatars/{i}.png` with `i = discriminator%5` if legacy discriminator ≠ '0', else `(BigInt(discordId) >> 22n) % 6`.
   - Then `checkAdminRole(discordId)` → `isAdmin`, `isDeveloper`, `adminRole`.
   - `/api/user/me` not ok / throws → fallback User from Firebase profile (`displayName||email`, `photoURL`, discordId `''`) — e.g. Google sign-in.
   - Signed out → user null, roles cleared.
   - Also exposes legacy `signInWithDiscord()` (Firebase OIDC provider `'oidc.discord'` popup, scopes identify+email) and `signInWithGoogle()` (GoogleAuthProvider popup) with Thai `alert`s; the live login page uses the custom-token flow instead.
   - `signOut()` = `firebaseSignOut(auth)` only (no Discord token revoke, no Firestore cleanup). Pages redirect via their own effects (admin layout → `/login`).
6. **Discord token refresh: NOT implemented.** `refreshToken`/`tokenExpiresAt` stored but never read. Firestore `guilds` refreshes only on next login. Bot resolves membership from gateway cache instead.

#### C.3 Guild list & filtering
- Firestore `users/{uid}.guilds` = all Discord guilds at login (served only by unused `/api/auth/discord/user/guilds`).
- Live guild list comes from the bot: `GET {BOT}/api/guilds?userId={discordId}` (bot-side filtering of guilds where bot is present & user is member — outside this file set), then `POST /api/guilds/user-permissions {userId, guildIds}` decorates each with `canPlay`/`reason`/voice channel.

#### C.4 View vs Control rules (bot is the source of truth)
- **canView** (`bot/src/functions/guildSettings.ts:76-98` `canUserViewBot`): guild in bot cache AND user in `guild.members.cache` → true `'Guild member'`; else `'Guild not found'` / `'Not a member of this server'`.
- **canControl** (`guildSettings.ts:107-166` `canUserControlBot`), evaluated in order:
  1. guild missing → false 'Guild not found'; not a cached member → false 'Not a member of this server'.
  2. `guild.ownerId === userId` → true **'Server owner'**.
  3. guild settings `ownerId === userId` (who invited/configured the bot) → true **'Bot owner in this guild'**.
  4. no active player: user in any voice channel → true 'No active player - can start playback'; else false 'Join a voice channel to start playback'.
  5. player exists: user not in voice → false 'You must be in a voice channel to control the bot'; same channel as `player.voiceChannel` → true 'In same voice channel'; else false 'You must be in the same voice channel as the bot'.
  - Voice channel read from `guild.members.cache.get(userId).voice.channelId` (cache only).
- Bot `POST /api/guild/:g/can-control` (`bot/src/api/routes/guild.routes.ts:241-271`): 400 if no `user.discordId`; if !canView → `{canView:false, canControl:false, reason}`; else `{canView:true, canControl, reason}`. (A duplicate handler also exists at `bot/src/api/server.ts:2182`.)
- **`/api/guilds/user-permissions` `canPlay`** (looser): server owner ('Server Owner') or bot owner ('Bot Owner') or in any voice channel (`In {channelName}`) else 'Join voice channel to play'. Guild not cached → all false 'Guild not found'.
- **Bot enforcement middleware** (`bot/src/api/middleware/auth.ts` `createControlPermissionMiddleware`) on player-control endpoints: reads `req.body.user.discordId`; **absent → `next()` (skip check, "backwards compatibility")**; denied → `403 {error:'Permission denied', reason}`; **internal error → `next()` (fail-open)**. ⇒ anyone can control any guild by omitting `user`, or impersonate any user by sending their discordId. **Rebuild MUST derive the user from a verified token server-side and fail closed.**
- **Client enforcement** (`hooks/useControlPermission.ts`): `POST /api/guild/{g}/can-control {user:{username, discordId}}` on mount/guild change and **every 60 s** (comment: reduced from 30 s since SSE is realtime); realtime overrides from guild SSE (`useSSE(guildId)`): `type:'permissionUpdate'` with `data.userId === me` (legacy) and `type:'permissionBatchUpdate'` with `data.users[]` (find mine) → `{canView:true, canControl, reason}`. Initial `{canView:false, canControl:false, reason:'Checking...', loading:true}`; other reasons 'No guild selected' / 'Not logged in' / 'Bot appears to be offline' / 'Failed to check permission'. TypeError (network) errors are not logged.
- `useControlPermission` opens its **own** `useSSE(guildId)` → duplicate EventSource per guild when the page also uses `useSSE` (one per hook instance).

#### C.5 Admin / developer roles
- Firestore `adminWhitelist/{discordId}` `{discordId, username, role:'admin'|'developer', addedAt, addedBy}`.
- Resolved client-side after login via unauthenticated `GET /api/admin/whitelist?discordId=` → `isAdmin = role ∈ {admin, developer}`, `isDeveloper = role === 'developer'`.
- Gating: `/admin/*` needs isAdmin||isDeveloper (client redirect only). Developer-only: Settings nav item (dead link), whitelist mutations (UI only).
- **No server-side role check exists anywhere** (Next routes, or bot `/api/admin/*` as called without credentials). `DISCORD_OAUTH_SETUP.md:65-79` suggests Firebase custom claims `{admin:true, role:'admin'}` — **unused by code**.
- How the first developer gets created is undocumented (presumably manual Firestore insert, or the open POST route).

#### C.6 Legacy / doc-only auth notes
- `FIREBASE_AUTH_SETUP.md`: Google sign-in (testing), Firebase OIDC Discord provider (Discord redirect `https://{project}.firebaseapp.com/__/auth/handler`, issuer `https://discord.com`), Email/Password (dev). `app/login/email-login.tsx.example` = unused example.
- `DISCORD_OAUTH_SETUP.md`: redirect URIs dev `http://localhost:3000/api/auth/discord/callback`, prod `https://your-domain.com/api/auth/discord/callback`; scopes identify, email, guilds.

---

### B. Next.js API route handlers (`app/api/**`)

#### B.0 Cross-cutting facts
- **No `middleware.ts`**, no `Cache-Control` headers, no `export const dynamic/revalidate/runtime` anywhere in `app/api` → all handlers are default Node runtime with Next defaults. **No route sets caching headers.**
- **Only two routes verify the caller**: `/api/user/me` and `/api/auth/discord/user/guilds` (Firebase ID token in `Authorization: Bearer <idToken>`, verified with `adminAuth.verifyIdToken`). **Every other route is unauthenticated**; identity for bot calls is a client-supplied `user: { username, discordId, avatar? }` JSON body that the bot trusts blindly (spoofable).
- Bot base URL env is inconsistent: some routes use `process.env.NEXT_PUBLIC_BOT_API_URL` (can-control, channels, member, settings, voice-channels, player/[guildId], player search, server-history, user-history, queue), others `process.env.BOT_API_URL` (album, artist, guilds/user-permissions, join, status, /api/search, youtube/channel) — **`BOT_API_URL` is not in `.env.example`**, so those fall back to `http://localhost:3001` unless set. Rebuild: one server-side bot URL.
- Common `callBotAPI(endpoint, method, body)` helper (copy-pasted into can-control, channels, member, settings, player/[guildId], queue; simplified in player search): builds `${BOT}/api${endpoint}`, JSON headers, logs `[requestId] [API Request] ...` with requestId `ISO-random9`; **offline detection: non-JSON content-type → `{ error:'Bot appears to be offline', status:503, offline:true }`**; network exception → same; non-2xx → `{ error: data.error||'Bot API error', status }` (player route also spreads the full bot body, e.g. `requiresVoiceChannel`, `canSelectChannel`; can-control adds `reason`).
- Timeouts: album 15 s (`AbortSignal.timeout`), artist / `/api/search` / youtube-channel 10 s, user-history & server-history 5 s (AbortController); others none. Timeout → 504 `{error:'Request timeout'|'Search timeout'}`.

#### B.1 Route table

| Method | Path | File | Auth | Backend | Request | Response / notes |
|---|---|---|---|---|---|---|
| GET | `/api/admin/users?limit=100` | `app/api/admin/users/route.ts` | **none** | Firestore Admin: `users` orderBy `createdAt` desc limit N | `limit` (default 100) | `{ users:[{id, discordId, username, avatar\|null, createdAt ISO\|null, lastActive ISO\|null, playCount: data.totalPlayCount\|\|0}], total }`. **Not called by any UI** (admin users page uses bot cache). Leaks all users to anonymous callers. |
| GET | `/api/admin/whitelist?discordId=` | `app/api/admin/whitelist/route.ts:10-48` | **none** | Firestore Admin `adminWhitelist/{discordId}` | `discordId` | `{ isAdmin: role∈{admin,developer}, isDeveloper: role==='developer', role\|null }` |
| GET | `/api/admin/whitelist` | same | **none** | `adminWhitelist` full scan | – | `{ entries:[{discordId: doc.id, ...data, addedAt: Date}] }` |
| POST | `/api/admin/whitelist` | same `:51-73` | **none** | `.doc(discordId).set({discordId, username, role, addedAt:new Date(), addedBy\|\|'unknown'})` | `{discordId, username, role, addedBy}` (400 if any of first 3 missing) | `{success:true}`. **Anyone can grant themselves `developer`** (no auth, no role enum validation). `getServerSession` from `next-auth` imported but unused (`:3`). |
| DELETE | `/api/admin/whitelist?discordId=` | same `:76-92` | **none** | `.doc(id).delete()` | – | `{success:true}` |
| PATCH | `/api/admin/whitelist` | same `:95-111` | **none** | `.doc(id).update({role})` | `{discordId, role}` | `{success:true}` |
| GET | `/api/album/[id]` | `album/[id]/route.ts` | none | `GET {BOT}/api/album/{id}` (15 s) | – | pass-through JSON |
| GET | `/api/artist/[id]` | `artist/[id]/route.ts` | none | `GET {BOT}/api/artist/{id}` (10 s) | – | pass-through |
| GET | `/api/auth/discord/callback?code&state` | `auth/discord/callback/route.ts` | Discord OAuth code | Discord token exchange + `users/@me` + `users/@me/guilds`; Firestore Admin `users/discord_{id}` set-merge; `adminAuth.createCustomToken` | `code` (400 JSON if missing); `state` read but **never validated** (no CSRF state) | redirect (`NextResponse.redirect` default 307) → `{base}/login/callback?token={customToken}`; on error redirect → `{base}/login?discord_error={msg}`. `base` = `NEXT_PUBLIC_DISCORD_REDIRECT_URI` minus `/api/auth/discord/callback`, else request origin. See C.2. |
| GET | `/api/auth/discord/user/guilds` | `auth/discord/user/guilds/route.ts` | **Firebase ID token** Bearer | Firestore `users/{uid}.guilds` (snapshot taken at login) | – | `[{id,name,icon\|null,owner}]`; 401 missing/invalid token, 404 no user doc. **Not called by UI.** |
| POST | `/api/guild/[guildId]/can-control` | `guild/[guildId]/can-control/route.ts` | none (body `user.discordId` trusted) | `POST {BOT}/api/guild/{g}/can-control` `{user}` | `{ user:{username, discordId} }` (400 `{canView:false,canControl:false,reason:'User not authenticated'}` if no discordId) | `{canView, canControl, reason}`; bot error → same shape false + reason, status from bot (default 403). Used by `useControlPermission`. |
| GET | `/api/guild/[guildId]/channels` | `guild/[guildId]/channels/route.ts` | none | `GET {BOT}/api/guild/{g}/channels` | – | text channels for music-channel selector (`components/GuildSettingsSection.tsx:76`) |
| GET | `/api/guild/[guildId]/member/[userId]` | `guild/[guildId]/member/[userId]/route.ts` | none | `GET {BOT}/api/guild/{g}/member/{u}` | – | member info (GuildSettingsSection `:99` shows bot owner) |
| GET | `/api/guild/[guildId]/settings` | `guild/[guildId]/settings/route.ts:59-75` | none | `GET {BOT}/api/guild/{g}/settings` | – | settings doc (default 404 on error) |
| POST | `/api/guild/[guildId]/settings` | same `:81-103` | none (bot may check `user`) | `POST {BOT}/api/guild/{g}/settings` `{musicChannelId, user}` | `{musicChannelId, user}` | bot response; default 400 on error |
| GET | `/api/guild/[guildId]/voice-channels` | `guild/[guildId]/voice-channels/route.ts` | none | `GET {BOT}/api/guild/{g}/voice-channels` | – | `{channels:[...]}` (VoiceChannelSelectorModal:64). No offline content-type check → HTML response throws → 500. |
| POST | `/api/guilds/user-permissions` | `guilds/user-permissions/route.ts` | none | `POST {BOT}/api/guilds/user-permissions` | `{userId, guildIds[]}` (400s) | `{ permissions: { [guildId]: { isOwner, isBotOwner, isInVoice, voiceChannelId, voiceChannelName, canPlay, reason } } }` — bot logic `bot/src/api/server.ts:531-614` (see C.4). Used by guild-picker on search/album/artist/playlist/session/channel pages. |
| GET | `/api/player/[guildId]` | `player/[guildId]/route.ts:66-77` | none | `GET {BOT}/api/current-track/{g}` | – | current track / player state. **Always HTTP 200 even when callBotAPI returned `{error,status}`.** |
| POST | `/api/player/[guildId]` | same `:83-163` | none (body `user`) | action switch → bot POST: `pause`→`/guild/{g}/pause`; `resume`→`/resume`; `skip`→`/skip`; `previous`→`/previous`; `volume`→`/volume` `{volume:value}`; `seek`→`/seek` `{position:value}`; `play`→`/play` `{query:value, defaultVolume: Number(NEXT_PUBLIC_VOLUMEDEFAULT)\|\|15, targetVoiceChannelId?}`; `loop`→`/loop` `{mode:value}` (mode optional → bot cycles); `shuffle`→`/queue/shuffle`; `skipto`→`/skipto` `{index}`; `playnow`→`/playnow` `{index}`. Bodies add `user:{username, discordId, avatar}` when provided. | `{action, value?, index?, targetVoiceChannelId?, user?}`; 400 'Action is required' / 'Invalid action' | bot JSON; if `status>=400` → returned with that status (body includes bot fields like `requiresVoiceChannel`, `canSelectChannel`). |
| POST | `/api/player/[guildId]/join` | `player/[guildId]/join/route.ts` | none | `POST {BOT}/api/guild/{g}/join` `{channelId, user}` | `{channelId, user}` (400 if no channelId) | pass-through |
| GET | `/api/player/[guildId]/search?q=&userId=` | `player/[guildId]/search/route.ts` | none | `GET {BOT}/api/guild/{g}/search?q=&userId=` | `q` or `query` (400 if blank), optional `userId` | pass-through; no offline check |
| GET | `/api/player/[guildId]/server-history` | `player/[guildId]/server-history/route.ts` | none | `GET {BOT}/api/guild/{g}/history` (5 s) | – | `{tracks:[...]}`; errors `{error, tracks:[]}` (NowPlayingSection:1048) |
| GET | `/api/player/[guildId]/status` | `player/[guildId]/status/route.ts` | none | `GET {BOT}/api/guild/{g}/player/status` | – | pass-through; bot 404 or exception → `{hasPlayer:false}` (200). Not referenced by current UI. |
| GET | `/api/player/[guildId]/top-played?userId=` | `player/[guildId]/top-played/route.ts` | none | **Firestore Admin direct**: `playHistory/{guildId}/userHistory/{userId}/tracks` orderBy `playCount` desc limit 30; **YouTube Data API v3** `videos?part=snippet,topicDetails&id=…&key=YOUTUBE_API_KEY` for YouTube tracks lacking `isMusic` | `userId` required | `{tracks:[{id, title, artist, duration, url, thumbnail, playCount, totalPlayTime, lastPlayedAt ISO\|null, source, isMusic, isVideo, isAudioOnly(=isMusic)}]}`. isMusic: Spotify→true; YouTube: categoryId `'10'` OR topicCategories contain 'music' OR channelTitle contains `'- Topic'` OR description contains `'Provided to YouTube by'`; fallback `url.includes('music.youtube.com')`; other sources false. **Writes back** `{isMusic,isVideo}` fire-and-forget (`:141`). Not referenced by current UI (comment only, `app/dashboard/page.tsx:32`). |
| GET | `/api/player/user-history?userId=` | `player/user-history/route.ts` | none | `GET {BOT}/api/user/{userId}/history` (5 s) | `userId` | pass-through; errors `{error, tracks:[]}` |
| GET | `/api/playlists?userId=` | `playlists/route.ts:7-40` | **none** (userId from query) | Firestore Admin `playlists` where `userId==` | `userId` required | `{playlists:[{id, ...data, createdAt ISO, updatedAt ISO}]}` sorted createdAt desc in memory (avoids composite index) |
| POST | `/api/playlists` | same `:43-85` | **none** | `playlists.doc()` auto-id `.set` | `{userId, name, description?, thumbnail?, tracks?, sourcePlatform?, sourceUrl?}` (400 if no userId/name) | `{success, playlist:{id, userId, name, description:'', thumbnail: thumbnail\|\|tracks[0].thumbnail\|\|'', trackCount, tracks, sourcePlatform\|null, sourceUrl\|null, createdAt, updatedAt}}` |
| GET | `/api/playlists/[id]` | `playlists/[id]/route.ts:11-34` | **none** | `playlists/{id}` | – | `{playlist}` / 404 |
| DELETE | `/api/playlists/[id]` | same `:37-56` | **none – no ownership check** | delete doc | – | `{success:true}` / 404 |
| PUT | `/api/playlists/[id]` | same `:59-91` | **none – no ownership check** | `.update({updatedAt, name?, description?, thumbnail?, tracks?+trackCount})` | partial | `{success:true}` / 404 |
| GET | `/api/queue/[guildId]` | `queue/[guildId]/route.ts:54-65` | none | `GET {BOT}/api/queue/{g}` | – | queue JSON (errors returned with **200** as `{error, offline?}`) |
| POST | `/api/queue/[guildId]` | same `:71-105` | none (body `user`) | `clear`→`POST /guild/{g}/queue/clear`; `remove`→`DELETE /guild/{g}/queue/{trackId}`; `move`→`POST /guild/{g}/queue/move` `{from,to}`; `shuffle`→`POST /guild/{g}/queue/shuffle` | `{action, trackId?, from?, to?, user?}` | bot JSON, **always 200** even on error |
| DELETE | `/api/queue/[guildId]` | same `:111-122` | none | `DELETE /guild/{g}/queue/{trackId}` | – | **BUG: `trackId` is not a route param of `[guildId]`** → calls `/queue/undefined`. Dead path (UI uses POST action=remove). |
| GET | `/api/search?q=&source=` | `search/route.ts` | none | `GET {BOT}/api/search?q=&source=` (10 s) | `q` required; `source` default `'spotify'` | pass-through |
| GET | `/api/user/me` | `user/me/route.ts` | **Firebase ID token** Bearer | Firestore Admin `users/{uid}` | – | `{exists:true, data: <entire user doc>}` / 404 `{exists:false}` / 401. **SECURITY: returns Discord `accessToken`, `refreshToken`, `email` to the browser.** |
| GET | `/api/youtube/channel/[id]` | `youtube/channel/[id]/route.ts` | none | `GET {BOT}/api/youtube/channel/{id}` (10 s) | – | pass-through |

#### B.2 Bot endpoints the browser calls directly (bypassing Next routes)
From grep of `fetch(\`${BOT_API_URL}/api...` / `EventSource` across `app/`, `components/`, `hooks/`:
- `GET /api/status` (useBotStatus), `GET /api/guilds?userId=` (dashboard/search/album/artist/playlist/session/channel pages), `GET /api/guilds` (dashboard/settings page:157), `GET /api/queue/{g}` (QueueSection:642 direct), `GET /api/user/{discordId}/sessions?limit=50` (history page:232), `GET /api/guild/{g}/sessions?limit=50`, `POST {apiUrl}/api/playlist/fetch` (library import:62).
- SSE: `/api/guild/{guildId}/events` (useSSE), `/api/user/{discordId}/events` (useUserSSE) — see D.
- Admin (all unauthenticated): `/api/admin/stats`, `/api/admin/guilds`, `/api/admin/guild/{g}/info|text-channels|messages/{c}`, `/api/guild/{g}/voice-channels|sessions|history`, `/api/admin/session/{id}`, `/api/admin/users/cached`, `/api/admin/user/{id}/history|sessions`, SSE `/api/admin/logs/events`, `/api/admin/presence/events`, `/api/admin/users/cached/events` — see A.

---


---

## 7. Dashboard pages (user-facing and admin)


### 7.U User-facing pages and components


Source root: `D:\Github\narzev5.0.2\dashboard` (all paths below relative to it). Scope: user-facing pages (`/`, `/login*`, `/dashboard/**`) and their components. Admin pages / API routes / hooks / services are covered by another note; hooks are only described here by how pages consume them.

Conventions noted across the app:
- UI language: mixed Thai + English (html `lang="th"`). Most toasts/errors are Thai. Rebuild should keep both strings or i18n them.
- Two backends are called from the browser: (1) the Next.js API routes `/api/...` (same origin) and (2) the bot's HTTP API directly at `process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001'` (e.g. `/api/guilds`, `/api/presence/connect`, SSE). Rebuild: NestJS should own both.
- Selected guild is shared across pages via **`sessionStorage['selectedGuildId']`** (not localStorage). Several pages read it.
- Cross-component communication uses **globals on `window`**: `__nowPlayingHasTrack()`, `__queueHasTracks()`, `__nowPlayingSetCurrent(track)` (and more, see NowPlayingSection/QueueSection). Rebuild should replace with a store (zustand is already a dependency) but preserve the optimistic behaviours.
- Design surfaces: `card-surface`, `card-section`, `pill-button` utility classes from `app/globals.css`.

---

#### 0. Stack / config

##### `package.json`
- name `bot-dashboard` 0.1.0; scripts dev/build/start/lint (next).
- deps: next 15.1.0, react 19, firebase ^11 (client), firebase-admin ^13.6 (server routes), @radix-ui/react-slider, @radix-ui/react-slot, class-variance-authority, clsx, tailwind-merge, tailwindcss-animate, date-fns ^4, **fast-average-color** (dominant colour extraction from album art), **framer-motion** ^12, lucide-react icons, **ogl** (WebGL lib used by Prism background), zustand ^5 (**unused** — no import anywhere in the dashboard source; dead dependency).
- dev: tailwind 3.4, typescript 5, eslint 9 + eslint-config-next.

##### `next.config.js`
- Only `images.remotePatterns` (https): `i.ytimg.com`, `yt3.googleusercontent.com`, `img.youtube.com`, `yt3.ggpht.com`, `i.scdn.co`, `mosaic.scdn.co`, `*.scdn.co`, `image-cdn-ak.spotifycdn.com`, `cdn.discordapp.com`, `media.discordapp.net`, `via.placeholder.com`, `lh3.googleusercontent.com`. MUST-PRESERVE: these image hosts (YouTube thumbs, Spotify covers incl. mosaic/daily-mix, Discord avatars/guild icons). Note most pages use plain `<img>` not `next/image`, so this list matters only where `next/image` is used.

##### `README.md`
- Claims features: real-time bot status, live queue, Discord OAuth, role-based access (User/Owner), shadcn/ui, responsive. Documents NEXT_PUBLIC_FIREBASE_* env vars (API key, auth domain, project id, storage bucket, sender id, app id) and example Firestore rules for `bots/{botId}` (read: authed; write: users/{uid}.role=='owner') and `users/{userId}`. README project structure (`(auth)/`, `(dashboard)/` route groups, `types/bot.ts`) is **stale** vs actual tree.

##### `app/layout.tsx` (root)
- Font: `Space_Grotesk` (next/font/google, latin, var `--font-sans`). `<html lang="th">`, body `antialiased`.
- Metadata: title "Bot Dashboard", description "Discord Music Bot Dashboard".
- Wraps everything in `<AuthProvider>` from `@/hooks/useAuth` (exposes `user`, `loading`, `isAdmin`, `isDeveloper`, `adminRole`; `user` has `discordId`, `id`, `username`, `avatar`).

---

#### 1. `/` — `app/page.tsx`
- Client component; on mount `router.push('/dashboard')`; renders `null`. No auth check here (dashboard layout does it).

---

#### 2. `/login` — `app/login/page.tsx`
- Auth gating: none (public). Does NOT redirect an already-logged-in user away.
- Wrapped in `<Suspense>` (because of `useSearchParams`); fallback = Prism background + purple spinner.
- Background: full-screen `<Prism animationType="rotate" timeScale=0.5 height=3.5 baseWidth=5.5 scale=3.6 hueShift=0 colorFrequency=1 noise=0 glow=1>` + `bg-black/60` overlay.
- Card: `card-surface` with gradient-border effect (purple→blue→transparent), big "narze" wordmark.
- Reads `?discord_error=` query param → shows decoded error in red box.
- **Login flow (popup OAuth)**:
  1. Button "Continue with Discord" (Discord blurple `#5865F2`, Discord SVG logo). On click: `getDiscordAuthorizationUrl()` from `@/lib/discord-auth` (builds Discord OAuth URL).
  2. Opens centered popup `window.open(authUrl, 'Discord Login', width=500,height=700, centered on current window)`.
  3. Popup blocked → error "ไม่สามารถเปิด popup ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้".
  4. Listens to `window.message`: `{type:'DISCORD_LOGIN_SUCCESS'}` → `window.location.href='/'` (full reload so auth state re-reads); `{type:'DISCORD_LOGIN_ERROR', error}` → show error.
  5. Polls `popup.closed` every 500 ms → if closed, stop loading (removes listener).
  - Loading state: spinner + "กำลังเข้าสู่ระบบ...", button disabled.
- Footer: "By continuing, you agree to our terms of service and privacy policy" — both links are `href="#"` (placeholders).
- Quirk: `router` imported but unused. Message listener does not check `event.origin` (security: any window can post DISCORD_LOGIN_SUCCESS — harmless-ish since it only reloads).

#### 3. `/login/callback` — `app/login/callback/page.tsx`
- Expects `?token=<firebase custom token>` (minted server-side by the Discord OAuth callback API route — covered elsewhere).
- No token → status error "Token not found"; if `window.opener` → `postMessage({type:'DISCORD_LOGIN_ERROR', error}, '*')`.
- `signInWithCustomToken(auth, token)`:
  - success → status success; if opener: post `DISCORD_LOGIN_SUCCESS` and `window.close()` after 1000 ms; else `router.push('/')` after 1500 ms.
  - failure → status error with `err.message`, posts error to opener.
- UI states (same Prism bg + card):
  - loading: Loader2 spinner, "กำลังเข้าสู่ระบบ...", "กำลังเชื่อมต่อกับ Firebase", 3 bouncing dots (0/150/300 ms delays).
  - success: green CheckCircle2, "เข้าสู่ระบบสำเร็จ!", "ยินดีต้อนรับกลับมา", "กำลังนำคุณไปยัง Dashboard...", progress bar animating 0→100% over 1.5s (styled-jsx keyframes `progress`).
  - error: red XCircle, "เกิดข้อผิดพลาด", "ไม่สามารถเข้าสู่ระบบได้", error text box, button "กลับไปหน้า Login" → `/login`.
- `postMessage(..., '*')` uses wildcard target origin (should be restricted in rebuild).
- Rebuild note (Supabase): equivalent = Supabase Discord OAuth (or custom JWT) with popup + postMessage handshake; preserve the popup UX and both fallbacks (opener vs no-opener).

#### 4. `app/login/email-login.tsx.example` (dead/example code, not routed)
- Email/password login + sign-up toggle using `signInWithEmailAndPassword` / `createUserWithEmailAndPassword`, shadcn Card/Input/Button, alerts in Thai ("สร้างบัญชีสำเร็จ!", "เข้าสู่ระบบไม่สำเร็จ: ..."). Not active — Discord-only auth in production. Optional to port.

---

#### 5. Dashboard shell — `app/dashboard/layout.tsx` (applies to every `/dashboard/**` route)

##### Auth gating
- `useAuth()`; while `loading` → full-screen spinner "กำลังโหลด...". When `!loading && !user` → `router.push('/login')`; renders `null` without user.
- No per-route role gating here (admin link only shown conditionally).

##### Selected guild sync
- Reads `sessionStorage['selectedGuildId']` on mount and **polls it every 500 ms** (because `storage` events don't fire same-window) → `selectedGuildId` state. (Effect depends on `selectedGuildId`, so interval is re-created on each change.)

##### SSE (guild player events) for background colour
- `useSSE(selectedGuildId)` (hook) → `sseData` events. On `init`/`trackStart`: thumbnail = `data.track || data.current` `.thumbnail`. On `trackEnd`/`playerDestroy`: clear.
- **Dynamic dominant colour**: loads thumbnail into `<img crossOrigin="anonymous">`, uses `FastAverageColor.getColor(img,{algorithm:'dominant'})`; converts to HSL; if L>80 or S<15 tries `sqrt` algorithm and keeps it if more saturated or darker; then if L>70 → L=max(40,L-30), S×1.3; else if S<25 && L>30 → S=min(S×2.5,60), L=min(L,50). Sets CSS var `--bg-dominant-color` on `<html>`; cleared on error/no track.

##### Presence tracking
- When `user.discordId` present: opens `EventSource(`${BOT_API_URL}/api/presence/connect?discordId=&username=&avatarURL=`)`. No handlers besides empty onerror (browser auto-reconnects). Closed on unmount/user change. (Purpose: bot/admin can see who is online on the dashboard — admin "online users" view.) MUST-PRESERVE.

##### Background
- **Prism toggle** persisted in **`localStorage['prismEnabled']`** (default true). ON → Prism WebGL bg (same params as login but `noise=0.5`) + `bg-black/80` overlay. OFF → solid `var(--bg-dominant-color, #0d0d0d)` with 1s transition + dark 135° gradient overlay (0.85→0.92→0.98 alpha).
- Toggle button in sidebar: "Prism ON/OFF" with Sparkles icon, tooltip Thai ("คลิกเพื่อปิด Prism Effect (ประหยัดทรัพยากร)" / "คลิกเพื่อเปิด Prism Effect").

##### Layout
- Grid `h-[calc(100vh-32px)]`, `lg:grid-cols-[240px,1fr]`. Below `lg` the sidebar stacks ABOVE content (no hamburger/mobile drawer — sidebar is full card at top on mobile).
- **Sidebar** (`aside.card-surface`, sticky): brand block (gradient purple→blue square with Music icon; "Rythm" small caps label; "Narze" title); user card (avatar img or first-letter fallback; username; role label `Developer` / `Admin` / `User` from `isDeveloper`/`isAdmin`); nav links: Home `/dashboard` (Music icon), History `/dashboard/history` (History), Library `/dashboard/library` (Library), Settings `/dashboard/settings` (Settings). Active = pathname match (`/dashboard` exact = home; `startsWith` for others; search routes fall back to "home"); active styling with left gradient bar. **Admin Panel** link → `/admin` shown only if `isAdmin || isDeveloper`, with badge showing `adminRole`.
- Bottom: Prism toggle, **Sign Out** button.
  - BUG: `handleSignOut` only does `router.push('/login')` with comment "ยังทำไม่เสร็จ - จะเพิ่มในภายหลัง" (not finished) — does NOT call Firebase `signOut`. (layout.tsx:212-219). Rebuild must implement real sign-out.
- **Header** (sticky, blurred): global search input (name `q`, placeholder "Search songs, artists, albums...", Search icon turns purple on focus). Default value read from `window.location.search` `q` once (uncontrolled). On change: **1000 ms debounce** → `router.push('/dashboard/search?q=<enc>')`; if emptied while on `/dashboard/search` → push `/dashboard/search`. **Enter** → cancels debounce and navigates immediately (if non-empty). Right side: active section name (hidden < sm).
- Content area `#main-scroll-container` (scrollable; id used by other pages for scroll handling).
- Unused imports: `IconSearch` used; `searchTimeoutRef` cleanup on unmount.

---

#### 6. `/dashboard` — Home / control center — `app/dashboard/page.tsx`

##### State & data sources
- `selectedGuildId` initialised from `sessionStorage['selectedGuildId']`; written back to sessionStorage whenever non-empty.
- `useBotStatus()` → `botStatus {state:'online'|..., guilds, uptime(ms)}`.
- `useAuth()` → `user`.
- `useControlPermission(selectedGuildId)` → `{canControl, canView, reason}` (canView unused here).
- `useUserSSE(user.discordId)` → `{guilds, connected, loading}` real-time server list.
- **Guild list fallback polling**: if user SSE NOT connected → `GET ${BOT_API_URL}/api/guilds?userId=<discordId>` immediately and **every 10 s**. Response `{guilds:[...]}`. Shallow compare (guildId + isPlaying per index) to avoid re-render. Network errors (TypeError/fetch) silently ignored and guilds cleared (bot offline). Loading shown only on first load.
- When SSE connected and has guilds → replaces `guilds`, auto-selects first guild if none selected. Also auto-select first guild on polling result.
- Guild object fields used: `guildId`, `guildName`, `guildIcon`, `isPlaying`, `isOwner`, `queueLength`, (ServerListSection uses more).

##### Header card
- "Control center" eyebrow, H1 "Music Dashboard" + `<BotStatusBadge status={botStatus.state}>`; subtitle "Pick a server, queue songs, and manage playback from a clean card-driven layout inspired by the Rythm interface."
- External link pill "Xeno Developer" → `https://resume-web-steel.vercel.app/` (new tab).
- **GuildSelector** (memo, custom dropdown): label "Current Server"; trigger shows `guildName` + 🎵 if playing, else "Select a server"; chevron rotates. Dropdown rendered via **portal to body**, `position:fixed`, positioned under button (rect.bottom+8), z 9999, max-h-60 scroll, glass bg. Items: "— Select a server" (selects `''`), then each guild (icon img or first-letter circle, name, 🎵 if playing; selected highlighted purple). Empty list → "No servers available". Closes on outside mousedown; on page scroll (capture) repositions (doesn't close despite comment). Next to it: "No active players" text when no guilds and not loading.
- Button **"Search songs"** (gradient pill) opens search modal; disabled + greyed when no guild selected.

##### Main grid (lg: 3 cols)
- Left (2 cols): `<NowPlayingSection guildId onPlayTrack={handleAddTrack} botStatus={botStatus.state}>` then `<QueueSection key={selectedGuildId} guildId onOptimisticAdd={noop} onQueueLengthChange={handleQueueLengthChange} canControl={canControl}>` (key forces remount per guild).
- Right (sticky on lg): `<ServerListSection guilds loading onSelectGuild selectedGuildId>` and **BotInfoSection** (memo): Status 🟢 Online / 🔴 Offline (`botStatus.state==='online'`), Total Servers (`botStatus.guilds`), Active Players (count guilds with `isPlaying`), Uptime (formatUptime: `Xd Yh` / `Xh Ym` / `Xm` / `Xs`; memo recalculated only per minute; 'N/A' if absent).
- `handleQueueLengthChange(length)` patches `queueLength` of the selected guild in local `guilds` for live server-list counts.

##### Search modal (quick add) — opened from "Search songs"
- Overlay `fixed inset-0 z-50`, backdrop `bg-black/60 backdrop-blur` (click → close), panel `max-w-5xl`, open animation `animate-modalSlideUp`/`animate-backdropFadeIn`, close animation 200 ms (opacity/scale/translate) then resets query/results/error/topPlayed.
- Header "Search music" + X close (aria-label "Close search"). No Escape-key handler.
- Input autoFocus, placeholder "Search songs, artists, or paste a link" (or "Select a server to search" disabled when no guild).
- **Search**: debounced **250 ms**: `GET /api/player/{guildId}/search?q=<q>&userId=<discordId>` → `{tracks:[], playlistInfo?:{name,trackCount,thumbnail,url}}`. Errors → `data.error || 'Search failed'`; network → 'Network error'. Empty query or no guild clears results.
- States: "Searching..." spinner; "No results"; results dim to 30% opacity while reloading.
- **Results layout** (md: `340px | 1fr`):
  - Left sticky "Top Result" card = `searchResults[0]` (or **playlist mode** when `playlistInfo` present → shows playlist thumbnail/name/"N tracks", "Playlist" badge, eyebrow "Playlist"). Source badge (see getSourceInfo). "VIDEO" chip if `isVideo`. Button "Play Top Result" / "Play Playlist" → `handleAddTrack(top)` or, in playlist mode, `handleAddTrack({...top, uri:playlistInfo.url, url:playlistInfo.url, title:playlistInfo.name, isPlaylist:true})`. Shows "✓ Added" (green) while `addingTrackId` matches.
  - Right list: other results (`slice(1)`; or ALL tracks in playlist mode). Row: 48px thumb with source colour corner badge, title (2-line clamp), VIDEO chip, author, **Add** button (→ "✓ Added", green, scale-95). In playlist mode the per-row "Added" state is suppressed.
- **Top played (empty query)**: `GET /api/player/user-history?userId=<discordId||id>` on modal open → `json.tracks` first **6**. Heading "เพลงที่คุณฟังบ่อย" (songs you play often), spinner while loading; empty "ยังไม่มีประวัติการฟังเพลง". Same card layout: big "Top Played" card with "Play Top Result" + list rows showing `author/artist • N plays` and Add button.
- `getSourceInfo(track)` (also used elsewhere): spotify (source or url contains 'spotify') → Disc3, "Spotify", green-600; `music.youtube.com` in url or (source youtube && isAudioOnly) → "YT Music" red-600; youtube/youtu.be → Video icon "YouTube" red-500; else "Audio" slate-600.

##### Add / play flow (`handleAddTrack` → `playTrackWithChannel`)
1. Guard: no guild → "Please select a server first"; no user → "Please sign in to control the bot".
2. Allowed if `canControl || selectedGuild.isOwner`; otherwise error = `controlReason || 'You must be in the same voice channel as the bot to add songs'`.
3. `addingTrackId` = for playlists the playlist url, else `identifier||uri||url||title`.
4. Build `value`: from `uri||url` (extract first http URL via regex), else from `identifier+source` (spotify → `https://open.spotify.com/track/{id}`; youtube/'youtube music' → `https://www.youtube.com/watch?v={id}`), else `"{title} {artist}"` truncated to 100 chars.
5. `POST /api/player/{guildId}` body `{action:'play', value, user:{username, discordId, avatar}, targetVoiceChannelId?}`.
6. Response not ok and `data.requiresVoiceChannel && data.canSelectChannel` → store `pendingTrack`, open **VoiceChannelSelectorModal** (owner not in voice; must pick a channel). On select → retry with `targetVoiceChannelId`; on close → clear pending/adding.
7. Other error → `data.error || 'Failed to add track'`.
8. Success → **optimistic now-playing**: if `!window.__nowPlayingHasTrack()` and `!window.__queueHasTracks()` → `window.__nowPlayingSetCurrent({title, author, duration, thumbnail})`. Queue updates are left to SSE `queueUpdate` (avoid duplicates). "✓ Added" cleared after 800 ms.
- `NowPlayingSection.onPlayTrack` also routes through `handleAddTrack` (used e.g. for recommendations/"play again" inside NowPlaying).

##### Quirks
- `onOptimisticAdd` passed as empty function (dead prop).
- Comment "Close dropdown on scroll" but code repositions instead.
- canView from useControlPermission unused on this page — view-only users still see full UI; control gating happens inside sections via `canControl`.

---

#### 7. `components/NowPlayingSection.tsx` (1641 lines) — player card + idle recommendations

Props: `guildId?`, `onPlayTrack?(track)` (dashboard passes `handleAddTrack`), `botStatus?` ('online'|'offline'|'starting'|'idle'|'playing'|'paused'|'unknown').

##### Data sources
- `useSSE(guildId)` → `{data: sseData, connected}` — per-guild player event stream (from bot).
- `useAuth()` user; `useControlPermission(guildId)` → `{canControl, canView, reason, loading}`.
- **Polling fallback when SSE NOT connected**: `GET /api/player/{guildId}` immediately + **every 5 s**. Ignores non-JSON responses (bot offline → hasTrack=false). Response fields: `track{title,author,duration,thumbnail}`, `position`, `playing`, `volume`, `twentyFourSeven`. **Stale-track detection**: if `!playing && duration>0 && position >= duration-1000` → treat as no track (happens when queue ends in 24/7 mode). Uses functional setState compare to avoid re-renders.
- Idle recommendations (only fetched when `!hasTrack`):
  - **User history (global, all servers)**: `GET /api/player/user-history?userId=<discordId||id>` → `tracks` first **4**. Non-JSON → empty. Errors swallowed (historyError always set null — the Refresh/retry button therefore never shows).
  - **Server history**: `GET /api/player/{guildId}/server-history` → `tracks` first **4**.
  - **Billboard Top Charts**: `fetchBillboardChart()` (lib/top-charts.ts) → `GET ${BOT_API_URL}/api/charts/billboard` → `{tracks, lastUpdated, date, chart}` (comment: Billboard Radio Songs chart, cached, updates every 3 days). Converted by `billboardToChartTracks` → `{id:'billboard-<rank>', title, artist, thumbnail: track.thumbnail||track.image, duration:0, url: spotify url or '', position: rank, source: track.source||'billboard'}`. Shows **top 10**. Loaded once (`chartsInitialized`) — global, not reset on guild change.
  - When `botStatus` transitions from offline/unknown → any working state ('online','starting','idle','playing','paused'), `*Initialized` flags reset to trigger refetch (`historyInitialized` is never read → dead state).
  - On guild change: reset server-history initialized/loading flags (do NOT reset hasTrack — avoids flash; SSE cached init sets it).

##### SSE event handling (MUST-PRESERVE event contract)
| event | handling |
|---|---|
| `init` / `trackStart` | track = `data.track || data.current`. For `init` with boolean `data.twentyFourSeven`: apply unless user toggled 24/7 within last **5 s** (timestamp in ref and `sessionStorage['247_toggle_<guildId>']`). With track → set title, author (fallback 'Unknown Artist'), duration, thumbnail, `requesterAvatar`, `requesterName`, position (`data.position`), lastSyncTime=now, playing (`data.playing ?? true`), volume if number, hasTrack=true. Without track → hasTrack=false, isPlaying=false. |
| `trackEnd` | If `window.__jumpToTrackInProgress` set within 2 s → suppress (clear flag and call `window.__queueClearSuppressFlag()`), to avoid empty flash after "skip to". Else if `window.__queueHasTracks()` && `window.__queueGetFirstTrack()` → **optimistically show next queue track** (title, `artist`, duration, pos 0, playing; thumbnail kept) and call `window.__queueOptimisticSkip()` (queue removes first row with animation). Else → 300 ms transition (opacity 50%) then clear track. |
| `queueEnd` | 300 ms transition then clear track. |
| `volumeChange` | set volume `data.volume`. |
| `playerPause` / `playerResume` | set isPlaying false/true; resync position if `data.position` number. (`data.by` = actor, only logged.) |
| `playerSeek` | set position + lastSyncTime + lastSeekTime (bypass stall logic). |
| `twentyFourSevenChange` | set 24/7 = `data.enabled`. |
| `userHistoryUpdate` | replace userHistory with `data.tracks` (note: NOT sliced to 4). |
| `serverHistoryUpdate` | replace serverHistory with `data.tracks`; make section visible if non-empty. |
(Heavy `console.log` on every SSE event — remove in rebuild.)

##### Window globals exposed (cross-component bridge)
- `window.__nowPlayingSetCurrent({title, author, duration, thumbnail})` → optimistic set current track (pos 0, playing, hasTrack).
- `window.__nowPlayingHasTrack()` → boolean.
- Consumed from QueueSection: `__queueHasTracks`, `__queueGetFirstTrack`, `__queueOptimisticSkip`, `__queueClearSuppressFlag`, flag `__jumpToTrackInProgress` (timestamp).

##### Playing view (hasTrack)
- `card-surface` with dynamic gradient from album-art dominant colour (`linear-gradient(135deg, <hex>40 0%, <hex>20 30%, transparent 70%)`, 1 s transition) + subtle white/black gradient + top hairline. Also writes `--bg-dominant-color` CSS var (same FastAverageColor algorithm as layout — duplicated code; both write the same var).
- Card opacity 50% during `isTransitioning`.
- **AlbumArt**: 192px square, `next/image` fill priority; fallback purple gradient + Music icon. **Card-flip animation** (`animate-cardFlip`, 600 ms, `perspective-1000`, `transform-style-3d`, `backface-hidden`) whenever thumbnail changes. Hover play overlay (decorative only, no click handler). **Requester badge** bottom-left: avatar (or grey circle) that expands on hover to reveal requester name (max 100px).
- **TrackInfo**: title (2xl bold), artist.
- **ProgressBarWithTimer** (memo, own requestAnimationFrame loop):
  - Local interpolation: `displayTime = min(initialTime + (now - lastSyncTime), duration)` each frame while playing.
  - **Anti-jitter stall**: if new computed time < previous by < 5 s and no seek in last 2 s → keep previous (stall rather than jump back).
  - When paused: keep displayed time unless server time differs > 5 s or recent seek (< 2 s).
  - **Click-to-seek only** (no drag/scrub): clickX/width × duration → `onSeek(ms)`. Bar grows h-2→h-3 on hover, white dot on hover. `onSeek` only passed when `canControl` (no visual disabled state otherwise).
  - Time labels `m:ss` current / total.
- **PlayerControls**: Previous (title "Previous / Restart"), Play/Pause (big purple circle), Skip. All disabled when `!canControl` (tooltip = controlReason) or individually while loading (icon pulses). Lock icon + amber reason text under controls when user cannot control.
- **VolumeControl**: native `<input type=range 0..100>` + Volume2 icon + `N%`. Local value; **300 ms debounce** of API call on change; mouse/touch down → dragging (SSE prop updates ignored while dragging); mouseup/mouseleave/touchend → send final value immediately (note: mouseleave fires even when not dragging → extra volume POST). Disabled (50% opacity) without control. Default volume = `NEXT_PUBLIC_VOLUMEDEFAULT` env or **15**.
- **24/7 toggle** button (Moon icon, "24/7", "ON" suffix when enabled, purple when on), title "Enable 24/7 mode - Bot stays in voice channel" / "Disable 24/7 mode". Rendered both in playing view and idle view. Disabled without control.
- No loop/shuffle/clear controls here (see QueueSection).

##### Control actions (all `POST /api/player/{guildId}` JSON `{action, value?, user:{username, discordId}}`)
- **play/pause**: optimistic toggle; when pausing freezes position = current + elapsed; action `pause` / `resume`; revert isPlaying on non-ok/exception.
- **skip**: action `skip`. If queue empty (via `__queueHasTracks`) → optimistic clear with 300 ms transition. If queue has tracks → NO optimistic skip (wait for SSE trackEnd to avoid double skip).
- **previous**: action `previous`; optimistic reset position to 0; revert on failure.
- **seek**: action `seek`, `value` = ms; only on ok set position/lastSync/lastSeek.
- **volume**: action `volume`, `value` 0-100; local state set immediately, no revert.
- **24/7**: **direct to bot** `POST ${BOT_API_URL}/api/guild/{guildId}/247` body `{enabled, user}` via **XMLHttpRequest** (comment: XHR can get through when fetch is queued — symptom of the browser's ~6 connections/host limit with multiple SSE streams open to the bot origin). 10 s timeout. Optimistic; on 2xx sets `data.enabled`; on XHR error/timeout only stops loading (BUG: optimistic state not reverted). Stores toggle timestamp in `sessionStorage['247_toggle_<guildId>']` so SSE `init` cannot overwrite for 5 s.
- **play recommendation** (`handlePlayRecommendation`): requires `canControl`. If parent passed `onPlayTrack` (dashboard does) → delegate (central voice-channel-selection logic). Otherwise query: spotify+url → url; other with url → `"(artist) title url"`; no url → `"(artist) title"`; action `play`; optimistic set track on ok.

##### Idle view (no track)
- Container `smooth-layout-container`.
- **Permission warning** banner (amber, Lock icon) with expand/collapse height animation (`animate-expandHeight` / `animate-collapseHeight`, exit 300 ms). Shown when `!canControl && !permissionLoading && reason !== 'No active player - can start playback'` (that exact reason string is a contract with useControlPermission/API — MUST-PRESERVE or replace with a code). Fallback text "Join a voice channel to control the bot". Duplicate comment line at :1495-1496.
- 24/7 toggle centered.
- **RecommendationGrid** sections (cards: square art via next/image, hover lift + purple border, source badge Spotify(green)/Video(red)/Music(red), hover white play circle, title/artist 1-line clamp, "N plays"; loading = `columns` pulse skeleton cards; empty message box; optional "Refresh" and error text):
  1. "เพลงที่คุณฟังบ่อย" / "เพลงที่เล่นบ่อยที่สุดของคุณในทุก Server" — user history, 4 cols, rendered only when has data.
  2. "🏠 เพลงฮิตใน Server" / "เพลงยอดนิยมใน Server นี้" — server history, 4 cols; skeleton delayed **500 ms** (prevent layout shift); smooth expand (`animate-smoothExpand`, 400 ms) / collapse (`animate-smoothCollapse`, 300 ms, keeps old data until collapsed); hidden entirely when empty.
  3. "🔥 Top Charts" / "เพลงฮิตจาก Billboard" — 5 cols, top 10, empty msg "ไม่สามารถโหลด Billboard Charts ได้"; shown while loading or when initialized with data.
  - Card click → play (only when `canControl`; else `onPlay` undefined → buttons disabled).
- Dead code: `getTrackSourceInfo()` (NowPlayingSection.tsx:31-48) unused; `loadingRecommendation` set but never rendered; `canView` unused; `historyInitialized` never read.
- `next/image` used for thumbnails → hosts must be in next.config remotePatterns or rendering errors (MUST-PRESERVE host list or use unoptimized `<img>`).

---

#### 8. `components/QueueSection.tsx` (1080 lines) — live queue with DnD reorder

Props: `guildId?`, `tracks?` (initial, unused by dashboard), `onOptimisticAdd?` (unused), `onQueueLengthChange?(n)`, `canControl` (default false). Dashboard mounts it with `key={selectedGuildId}` (remount per guild) AND it also resets state during render when `guildId` prop changes (clear tracks, loading=true).

Track model (client): `{id: String(index), title, artist (=author||'Unknown Artist'), duration ms, thumbnail?, requesterAvatar?, requesterName?, addedBy?}`. **IDs are positional indexes** (`"0","1",...`) and re-indexed after every mutation — the server-side remove uses this id (see below). Rebuild should use stable per-entry IDs.

##### Data sources
- `useSSE(guildId)` (same stream as NowPlaying).
  - `queueUpdate` → `data.queue[]` mapped to tracks. Diff by **title**: new titles (not in previous and not pending optimistic) get slide-in animation (400 ms); titles no longer present get removal animation (`animate-jumpOutToPlay`, apply new list after 350 ms). Pending-optimistic titles are cleared on confirm.
  - `init` with `data.queue` → replace tracks (page refresh path; includes thumbnails/requester).
  - `jumpToTrack` `{fromIndex}` (another client used "play now") → set suppress-next-skip flag; if not animating and index valid → animate that row out (400 ms) then splice it out and re-index.
  - All SSE messages ignored while `isAnimatingRef` is true (prevents flicker).
- **Polling fallback**: `GET ${BOT_API_URL}/api/queue/{guildId}` (direct to bot) once on mount/guild change, then **every 5 s only when SSE is not connected**. 404 → empty queue. Non-JSON → empty. Compare by titles to avoid re-render. Errors → empty. Loading skeleton only on first load.
- `useQueueRecheck(guildId)` → `scheduleRecheck()` = `QueueRecheckManager.getInstance().triggerRecheck(guildId, 1000)` (services/QueueRecheckManager.ts — covered by other note) — called after every optimistic mutation; the manager hard-syncs by calling `window.__queueRecheckSync(serverSongs)` which **replaces tracks with only `{id, title, artist, duration, addedBy}` (drops thumbnail/requester → thumbnails vanish after a recheck sync — bug/quirk)**. Also triggers an initial recheck (delay 0) on mount.

##### Window globals exposed
- `__queueRecheckSync(tracks)` (see above).
- `__queueOptimisticAdd(track)` — appends with id = current length, slide-in anim, pending-title guard for 2 s, schedules recheck. **Nobody calls it** in current code (dashboard comment says queue updates come from SSE) → dead.
- `__queueHasTracks()`, `__queueGetFirstTrack()` → used by NowPlaying & dashboard.
- `__queueOptimisticSkip()` → called by NowPlaying on trackEnd: if suppress flag set (after a jump) consume flag and return; else set animating, animate first row out (`animate-slideOutAndFade`, others `animate-slideUp`), after 500 ms remove first and re-index, release animating after +100 ms, schedule recheck.
- NowPlaying calls `__queueClearSuppressFlag()` but **it is never defined** (dead call; suppress flag may linger and swallow a later legit skip animation — latent bug).
- Also detects first-track removal from server updates (first id/title changed AND length changed) → brief slide-out animation (100 ms).

##### UI
- Loading: card "Queue" + 3 pulsing bars (staggered 100 ms).
- Empty: component returns **null** (queue card disappears entirely); when transitioning to empty, header renders once with `animate-fadeOut` for 300 ms.
- Header: "Queue (N)" + hint "Drag to reorder" (shown even for view-only users); **Clear** button (red, Trash2) only when `canControl && N>0`; shows "Clearing..." while in flight.
- List: `max-h-96` scroll, dividers. Row: drag handle (GripVertical; invisible when !canControl), **position number with flip animation** (`AnimatedNumber`: `animate-numberFlip`, swaps digit at 120 ms of 300 ms), 40px thumbnail (or Music icon) with **requester avatar badge** bottom-left (img or first-letter circle, tooltip name), title/artist truncated, duration `m:ss`, **remove** (Trash2) visible on hover only when canControl (stopPropagation).
- Row click (when canControl and not a drag) → **Play now / jump to track**.
- Row animations via `TrackItemWrapper`: removing → `animate-jumpOutToPlay`; first track playing → `animate-slideOutAndFade`; others slide up; new → `animate-slideInFromLeft`; jumping → `animate-jumpOutToPlay`.

##### Actions
- **Remove**: guard canControl; mark removing → wait 400 ms (animation) → optimistic filter → schedule recheck → `POST /api/queue/{guildId}` body `{action:'remove', trackId, user:{username, discordId}}` (trackId = positional index string). Revert to previous list on non-ok/exception.
- **Clear**: opens **custom confirm modal** (backdrop blur, click-outside cancels): title "Clear Queue?", subtitle "This action cannot be undone", body "Are you sure you want to remove all **N** tracks from the queue?", buttons "Cancel" / "Clear Queue" (red). Confirm → optimistic empty → `POST /api/queue/{guildId}` `{action:'clear', user}`; revert on failure. No Escape-key handling.
- **Play now (jump)**: guard canControl; set animating; set `window.__jumpToTrackInProgress = Date.now()` (NowPlaying suppresses next trackEnd within 2 s); animate row (400 ms); optimistic splice out + re-index; set suppress-next-skip; schedule recheck; `POST /api/player/{guildId}` `{action:'playnow', index, user}`; release animating after 200 ms. No revert on failure. (Bot SSE then emits `jumpToTrack` + `trackStart` to all clients.)
- **Drag-and-drop reorder**: **native HTML5 DnD** (no library). `draggable={canControl}`; dragstart sets `effectAllowed='move'`, data `text/plain` = index; dragover sets `dragOverIndex`; **DropIndicator** (purple line with end dots + pill "Move to #N" where N = `from<to ? to : to+1`) rendered above the hovered row; an extra 32px **drop zone at the end** of the list for "move to last". Dragged row: opacity 30%, purple tint, scale 95. Drop → optimistic splice(from) + splice(to) + re-index → schedule recheck → `POST /api/queue/{guildId}` `{action:'move', from, to, user}`. **No rollback** on failure (relies on next recheck/SSE). `isDraggingRef` suppresses first-track animation detection during drag. A click after drag is suppressed via `isDraggingRef` in the row.
  - Quirk: DropIndicator label math vs actual splice semantics: moving down to index `to` places item at `to` (0-based) i.e. "#to+1"; label says "#to" when from<to → off-by-one label. Also no touch support (HTML5 DnD doesn't work on mobile) → mobile users cannot reorder.
- `onQueueLengthChange(tracks.length)` fired on every length change (dashboard updates server list queue counts).
- `handleRemoveCallback` useCallback deps omit `tracks`/`user` → stale closure risk (previousTracks may be stale for revert).

---

#### 9. `components/ServerListSection.tsx` — "Your Servers" sidebar card
- Props: `guilds`, `loading`, `onSelectGuild`, `selectedGuildId`. Purely presentational (data from dashboard page: user SSE or polling `/api/guilds?userId=`).
- Guild fields: `guildId, guildName, guildIcon?, memberCount?, hasPlayer?, isPlaying?, queueLength?, isOwner?, isInVoiceWithBot?, canControl?, userVoiceChannelId?`. MUST-PRESERVE this per-user guild DTO (permission flags are computed server-side per user).
- Loading: card "Active Players" + 3 pulse bars. Empty: Server icon, "No Servers", "You're not a member of any servers with this bot".
- List header "Your Servers (N)". Row button (click → select guild; selected = purple ring): icon (`next/image`) or gradient first-letter avatar; name; **permission badge** (mutually exclusive-ish):
  - `isOwner` → yellow Crown "Owner".
  - else `isInVoiceWithBot` → green Mic "In Voice".
  - else `canControl && !hasPlayer` → blue Music "Can Play".
  - `!canControl && !isOwner` → grey Eye "View Only".
  - Second line: green "Playing" if `isPlaying`; "N in queue" if queueLength>0; Users icon + memberCount.
  - Chevron right.

#### 10. `components/BotStatusBadge.tsx`
- Uses `ui/badge` (outline). States → label/icon/colour: online (Circle, green), offline (CircleOff, red), starting (Loader2 spinning, yellow), playing (Music, blue), paused (Pause, orange), idle (Radio, gray). Unknown → offline style. Type `BotStatus['state']` from `types/bot`.

#### 11. `components/VoiceChannelSelectorModal.tsx` — owner "pick a voice channel" join flow
- Props: `isOpen, guildId, onClose, onSelect(channelId), onBack?` (back arrow shown only if onBack; dashboard doesn't pass it — "return to guild selector" variant used elsewhere?).
- Data: on open → `GET /api/guild/{guildId}/voice-channels` → `{channels:[{id,name,type,memberCount,members:[{id,username,displayName,avatar,isBot?}]}]}`. Non-JSON → "Bot appears to be offline". Live updates via `useSSE(guildId)` event **`voiceChannelsUpdate`** `{channels}`.
- UI (Thai): header Mic2 icon, "เลือก Voice Channel" / "เลือกห้องที่ต้องการให้บอทเข้าไปเล่นเพลง", X close (aria "ปิด"). Loading "กำลังโหลดรายการห้อง..."; error text + "ลองใหม่" button (does **full `window.location.reload()`** — crude); empty "ไม่พบ Voice Channel ใน Server นี้". Channel card: Volume2 + name + member count pill; stacked member avatars (max 5, `+N`), names of first 3 + " และอีก N คน"; "ไม่มีใครในห้องขณะนี้" if empty. Footer "บอทจะเข้าร่วมห้องที่คุณเลือกและเริ่มเล่นเพลง".
- Select → mark selected (spinner), call `onSelect(id)` and close with 200 ms animation (doesn't wait for play result). Backdrop click closes. No Escape key.
- Flow (dashboard): play request returns `{requiresVoiceChannel:true, canSelectChannel:true}` when requester is owner/admin not in voice → modal → retry POST with `targetVoiceChannelId`.

#### 12. `/dashboard/settings` — `app/dashboard/settings/page.tsx` + `loading.tsx`
- Header: Settings icon, "ตั้งค่า Server" / "จัดการการตั้งค่าบอทสำหรับแต่ละ server", BotStatusBadge (`useBotStatus`).
- **Guild list**: `GET ${BOT_API_URL}/api/guilds` **without `userId`** → BUG/SECURITY: lists every guild the bot is in, not just the user's (dashboard home passes `?userId=`). Polls **every 30 s** (interval recreated whenever selection changes). Auto-selects first guild. Does **not** read/write `sessionStorage.selectedGuildId` (independent selection).
- GuildSelector (same portal dropdown pattern as home, Thai labels "เลือก Server:", "เลือก server", "ไม่มี server", "ไม่มี active players").
- Body: `<GuildSettingsSection guildId>`.
- `loading.tsx`: static header (real title/subtitle) + pulse skeletons: status badge pill, guild selector (label + 208px box), and a settings card with header + **3 generic setting rows** (label/description + control) — does not match the real single-field GuildSettingsSection layout (cosmetic mismatch).

#### 13. `components/GuildSettingsSection.tsx` — per-guild settings
- Data (parallel on guild change): `GET /api/guild/{guildId}/settings` → `{guildId, guildName?, ownerId, musicChannelId?}` (404 → null settings); `GET /api/guild/{guildId}/channels` → `{channels:[{id,name,type}]}` (text channels). Then `GET /api/guild/{guildId}/member/{ownerId}` → `{username|displayName}` to display owner name. Live: `useSSE(guildId)` event **`settingsUpdate`** (payload = settings object).
- `isOwner` = `user.discordId === settings.ownerId` (only ever set true, never reset to false on guild change — BUG: owner badge can leak to another guild until reload).
- States: no guild → "เลือก server เพื่อดูการตั้งค่า"; loading → detailed pulse skeleton.
- Header "ตั้งค่า Server" + yellow "Owner" crown chip if owner.
- **Bot Owner** row: shows owner username (or ID); click copies `ownerId` to clipboard; check icon + "คัดลอกแล้ว!" for 2 s; tooltip "คลิกเพื่อคัดลอก ID: <id>". ("ownerId" = the guild's bot owner — person who invited the bot / server owner as stored by the bot.)
- **Music Text Channel** (Hash icon), help "เลือก channel ที่บอทจะส่งข้อความเมื่อมีเพลงเล่น" (channel where the bot posts now-playing messages). **Searchable combobox**: click → turns into search input "ค้นหา channel..." (autofocus); portal dropdown (fixed, z 9999, repositions on scroll); option "— ไม่ระบุ (ใช้ channel ที่สั่งเพลง)" (= null → use the channel where the command was issued); channel list `#name`; no-match "ไม่พบ channel ที่ตรงกับ "<q>"". Clear (X) button resets to none. Click outside closes + clears search.
- **Save** button (label lowercase "save"; "กำลังบันทึก..." spinner) disabled when unchanged. `POST /api/guild/{guildId}/settings` `{musicChannelId: id|null, user:{username, discordId}}` → `{settings}`. Success "บันทึกการตั้งค่าสำเร็จ!" (auto-hide 3 s); error `data.error || 'Failed to save settings'`; non-JSON → "Bot appears to be offline". **No client-side owner gating** — any user can attempt; server must authorize (MUST-PRESERVE server-side check).
- **Permission info box** (copy to keep, explains the permission model):
  - ดูสถานะ — all server members can view what's playing.
  - Owner/Admin — server owner or the person who invited the bot can control from anywhere.
  - เริ่มเล่นเพลง — if the bot isn't playing, anyone can add songs from any voice channel.
  - ควบคุมบอท — must be in the same voice channel as the bot to control.
  → This is the authoritative statement of the permission model (MUST-PRESERVE).

---

#### 14. `/dashboard/history` — Listening-session history — `app/dashboard/history/page.tsx`

Note: the user-facing "History" page is **session-based** (listening sessions: a continuous period of the bot playing in a voice channel with participants). Per-user top-played and per-server top-played are shown on the Home idle view (§7) and the search modal (§6), not here. There is no per-track flat history list page.

Data model (`types/session.ts`) — MUST-PRESERVE:
- `ListeningSession {sessionId, guildId, guildName?, channelId, startTime ms, endTime? ms, tracks: SessionTrack[], participants: SessionParticipant[], isActive, trackCount, participantCount}`
- `SessionTrack {title, author, uri, thumbnail, duration ms, playedAt ms, requesterAvatar?, requesterName?}`
- `SessionParticipant {userId, username, avatarURL, joinedAt ms}`

##### Data
- **localStorage SWR cache** key **`session_history_<discordId>`** = `{sessions, guilds, timestamp}`; used if < **1 hour** old (shown instantly), then refreshed.
- Fetch: `GET ${BOT_API_URL}/api/user/{discordId}/sessions?limit=50` (direct to bot) → `{sessions:[...], guilds:[{guildId,name,icon}]}`. Guild icon URL built client-side `https://cdn.discordapp.com/icons/{guildId}/{icon}.png`. Merge: refresh existing by sessionId + add new; dedupe; sort by startTime desc; write cache. Non-ok → "Failed to load history". Network error → (only if no cached sessions) "Bot appears to be offline. Showing cached data if available." (the `sessions.length` check uses a stale closure).
- **Realtime**: opens **one raw `EventSource` per guild** → `${BOT_API_URL}/api/guild/{guildId}/events?userId=<discordId>`; handles `sessionUpdate` / `sessionEnd` (payload = ListeningSession) only if the user is in `participants` (client-side filter; server also filters by userId per comment); upsert + resort. Closed on unmount. ⚠ N simultaneous SSE connections (browser per-host limit ~6 on HTTP/1.1 → can starve other requests; same root cause as the 24/7 XHR hack). Rebuild: single multiplexed user stream.
- `useSSE` imported but unused.

##### UI
- Auth-loading skeleton: search bar pill + 8 skeleton cards.
- Search input (client-side filter) "Search sessions, songs, or servers" → matches `guildName` or any track title/author.
- Header "Session History (N)".
- Error banner (red).
- Loading with no data → 8 skeleton cards. Empty → card with History icon, "No Listening Sessions Yet", "Once you start listening to music with friends, your sessions will appear here."
- Grid 2/3/4 cols of **SessionCard**: square thumbnail = first track thumbnail (or purple→blue gradient + Music icon), hover zoom; hover purple play-circle overlay (decorative); **"Live"** green pulsing badge if `isActive`; participant avatars (max 4 + "+N") bottom-left; track-count badge bottom-right; title = formatted start date (`Today, 03:15 PM` / `Yesterday, …` / weekday if < 7 days / `Mon D, hh:mm`; en-US); guild icon + `guildName || guild.name || 'Unknown Server'`; stats: participants count, duration (`Xh Ym` / `N min`; live sessions use now−start).
- Click → `/dashboard/history/session/{sessionId}?guildId={guildId}`.

#### 15. `/dashboard/history/session/[sessionId]?guildId=` — Session detail — `.../session/[sessionId]/page.tsx` + `loading.tsx`
- Params via React 19 `use(params)`. Requires `guildId` query param, else error "Missing guildId or sessionId".
- **Fetch session**: `GET ${BOT_API_URL}/api/guild/{guildId}/sessions?limit=50` then `find(sessionId)` client-side (no single-session endpoint! sessions older than the latest 50 → "Session not found"). Error → "Bot appears to be offline. Please try again later."
- **Guilds for playback**: `GET ${BOT_API_URL}/api/guilds?userId=<discordId>` → pick selected guild: URL guildId if user has it, else **`localStorage['selectedGuildId']`** (NOTE: other pages use **sessionStorage** — inconsistency), else first. Writes selection back to localStorage.
- **Permissions**: `POST /api/guilds/user-permissions` body `{userId, guildIds:[...]}` → `{permissions: {[guildId]: {isOwner, isBotOwner, isInVoice, voiceChannelId, voiceChannelName, canPlay, reason}}}` (MUST-PRESERVE: batch permission endpoint; `reason` is a human-readable label shown as a chip).
- **Realtime**: `useSSE(selectedGuildId)` → `sessionUpdate`/`sessionEnd` for the same sessionId replace the session (live session grows).
- Skeleton shown only if loading > **200 ms** (avoid flash); `loading.tsx` route skeleton mirrors layout (thumb, title lines, 4 avatar circles, stats, 6 track rows).
- Error view: Music icon, error text, "← Back to History" (`router.back()`).

##### Layout
- Background gradient header (h-96, 40% opacity) from dominant colour of first track thumbnail (FastAverageColor 'dominant', no adjustments) or default purple `rgb(88,28,135)`.
- **Sticky collapsing header** (listens to scroll on `#main-scroll-container`; collapse at >100px, expand at <50px hysteresis): when scrolled, thumbnail shrinks 192→64px, background = dominant colour, back button + eyebrow + server name + participants hidden, title shrinks, stats inline with "•".
- Header content: "Back to History" (router.back), thumbnail (Live badge if active; tiny dot when collapsed), eyebrow "Session History", title = start date in **Thai locale** (`th-TH`, weekday long, full date), server icon + name (from guild list matching URL guildId), stats: `N songs`, `<sum of durations> min`, `N participants`; participant avatars (max 6 + "+N").
- Track table (`card-surface`): desktop header `# | Title | Requested by | ⏱`; mobile hides "Requested by". Rows (staggered fadeIn 50 ms): number (hover → Play icon; spinner while playing request in flight), 40px thumb + requester avatar badge, title (purple while playing)/author, requesterName or 'Unknown', duration `h:mm:ss`/`m:ss`. Hover lift effect. Empty → "No tracks in this session". (No per-track `playedAt` timeline shown despite field existing; `formatTime` helper unused → dead code.)

##### Play-from-history flow (MUST-PRESERVE)
1. Click a track row → requires user (else `alert('Please login first')`) → store pending track → open **"Select Server"** modal ("Choose a server to play music in:").
2. Modal lists user's guilds; each row: icon, name, **chip with `perm.reason`** (yellow if owner/botOwner, green if in voice, red otherwise; "Loading..." until perms arrive); disabled (50%) when `!perm.canPlay`. Cancel button / backdrop closes (200 ms anim) and clears pending.
3. Choose guild: if `(isOwner||isBotOwner) && !isInVoice && !guild.isPlaying` → open **VoiceChannelSelectorModal** → on select: `POST /api/player/{guildId}/join` `{channelId, user}` → wait 500 ms → play.
   Else → `POST /api/player/{guildId}/join` `{channelId: perm.voiceChannelId, user}` → wait 500 ms → play.
4. Play = `POST /api/player/{guildId}` `{action:'play', value: track.uri || "title author", user:{username, discordId}}`; failure → browser `alert("Failed to play: <error>")` / "Failed to play track. Please try again." Spinner on that row for 1 s.
- BUG: guild-row click handler closes over `pendingPlayAction/pendingTrack` from render — fine in practice; `pendingPlayAction` type includes `'all'` but there is **no "Play all" button** (dead branch). `checkingPlayer` state set but never rendered. Uses `alert()` for errors (no toast system anywhere in the user dashboard).

---

#### 16. Library — playlists

##### Storage: NOT Firestore from the browser
`lib/playlist-service.ts` calls the **bot HTTP API directly** (comment: "uses high-performance cache"); the bot persists (Firestore behind it). Endpoints (all `${BOT_API_URL}`):
- `POST /api/playlists` body `PlaylistInput` → `{playlist}`
- `GET /api/playlists/{id}` → `{playlist}` (404 → null)
- `GET /api/playlists?userId=<id>` → `{playlists, source}` (`source` = cache vs db, only logged)
- `PUT /api/playlists/{id}` body `Partial<PlaylistInput>` (exported, **no UI uses it** → no rename/edit in UI)
- `DELETE /api/playlists/{id}`
- `GET /api/playlist-stats` (debug cache stats; unused by pages)
- Errors normalised: non-JSON or fetch TypeError → "Bot appears to be offline" (reads return []/null silently).
- ⚠ SECURITY: no auth header/token on any call — anyone knowing an id can read/update/delete any playlist; `userId` is client-supplied. Rebuild (NestJS + Supabase) must enforce ownership (RLS: `playlists.user_id = auth.uid()` mapping to discord id).

Data model (MUST-PRESERVE):
- `Playlist {id, userId (discordId), name, description?, thumbnail?, trackCount, tracks: PlaylistTrack[], sourcePlatform?: 'spotify'|'youtube'|'custom', sourceUrl?, createdAt, updatedAt}`
- `PlaylistTrack {title, artist, duration? ms, thumbnail?, uri?, album?, addedAt? ISO}` — tracks are embedded in the playlist document.

##### `/dashboard/library` — `app/dashboard/library/page.tsx`
- Loads `getUserPlaylists(user.discordId || user.id)` once; full-height spinner while loading.
- Search input "Search songs or artists" (client filter: playlist name or any track title/artist).
- **Tabs** (pill buttons, active = white bg): All, Songs, Artists, Albums, Playlists. **Only playlists exist** — Songs/Artists/Albums tabs always show empty states (placeholder features): Songs "No liked songs yet / Songs you like will appear here."; Artists "No liked artists yet …"; Albums "No saved albums yet / Albums you save will appear here."; All empty "Your Library is Empty / Follow artists, save albums, like tracks, or create playlists to see them here."; Playlists empty "No playlists yet / Import your playlists from other platforms to get started." + **Import Playlist** button. (Like/follow/save features are NOT implemented anywhere — rebuild may implement or drop; note as aspirational.)
- When All/Playlists and has playlists: header "Your Playlists (N)" + **Import Playlist** button (→ `/dashboard/library/import`); grid 2/3/4 cols: cover (or gradient + ListMusic), hover zoom, decorative play overlay, **delete** (Trash2, top-right on hover; `confirm('Are you sure you want to delete this playlist?')`; spinner; removes from list; errors only console), **source badge** Spotify (#1DB954) / YouTube (#FF0000) (note: 'custom' would render as "YouTube" — bug), name, "N tracks". Card click → `/dashboard/library/playlist/{id}`.
- No "create empty playlist" UI; playlists are only created via import.

##### `/dashboard/library/import` — 3-step import wizard — `app/dashboard/library/import/page.tsx`
- Step indicator: 1 "Select Playlist" → 2 "Configure Import" → 3 "Importing" (check marks when passed).
- **Step 1**: H1 "Import Your Music" / "Bring your playlists from other platforms to Narze". Platform picker cards: **Spotify** (green SVG) and **YouTube** (red). Selecting shows URL input "Paste {Spotify|YouTube} playlist URL here" (Enter submits) + **Continue** ("Fetching playlist..." spinner) + error text + 💡 instructions (open app → three dots → Share → Copy playlist link → paste).
  - Fetch preview: `POST ${BOT_API_URL}/api/playlist/fetch` body `{url}` → `{success, platform ('spotify'|'youtube'|'unknown'), playlist:{name, thumbnail, trackCount, owner}, tracks:[{title, artist, thumbnail?, duration?, uri?, album?, addedAt?}]}`. Fallbacks: name ← first track title ← 'Unknown Playlist'; thumbnail ← first track thumb; owner 'Unknown'. If API reports a platform it overrides the user's choice (so a YouTube URL pasted under Spotify still works). Errors: `error` field or "Failed to fetch playlist. Please check the URL and try again." (Supported: Spotify playlists, YouTube/YT Music playlists — whatever the bot's resolver accepts; album URLs probably also work via bot.)
- **Step 2**: preview (192px cover via next/image — ⚠ crashes/blank if thumbnail is '' ; Spotify badge), name, "N tracks", "by <owner>". **Import Settings** card: "Import To:" fixed "Create new playlist" (no merge-into-existing option); **Playlist Name** (prefilled, editable); **Description (Optional)** textarea "Add a description..."; Back / **Start Import**.
- **Step 3**: Saves via `createPlaylist({userId: discordId||id, name, description, thumbnail, tracks (title, artist, duration, thumbnail, uri, album, addedAt), sourcePlatform, sourceUrl: pasted URL})`. Shows fake "Importing from Spotify/YouTube" animation (platform icon → 6 pulsing dots → Narze icon, "Establishing connection...", static 60% bar). On success: "Import Complete", check icon, **Instantly Imported = N tracks** "Added to your playlist right away"; "Still Syncing" block (always 0 — background sync is not implemented; text "We'll attempt to add the remaining tracks automatically over the next 24 hours."). Buttons **View Playlist** (TODO: goes to `/dashboard/library`, not the new playlist although `playlistId` is known — import/page.tsx:155-158), **Import Another** (reset wizard), **Copy Link** (no onClick — dead button). On error → back to step 2 with error.
- Bugs: `importResult?.stillSyncing && …` renders a literal **"0"** when stillSyncing is 0 (import/page.tsx:466); `t.uri/t.album/t.addedAt` accessed on a type that doesn't declare them (TS looseness); no auth gating beyond layout.

##### `/dashboard/library/playlist/[id]` — playlist detail — `app/dashboard/library/playlist/[id]/page.tsx`
- Loads `getPlaylist(id)`; spinner; error "Playlist not found" / "Failed to load playlist" + "← Back to Library". **No ownership check** — any logged-in user can open any playlist id.
- Loads guilds `GET ${BOT_API_URL}/api/guilds?userId=` and permissions `POST /api/guilds/user-permissions {userId, guildIds}` (same as session page). Preselect guild from **`localStorage['selectedGuildId']`** else first; persists selection to localStorage.
- Background gradient from cover dominant colour darkened ×0.6 (rgba .95) or default purple. **Sticky collapsing header** (rAF-throttled scroll on `#main-scroll-container`, collapse > 180px / expand < 20px): cover 192→64px with platform badge (Spotify / YouTube SVG), eyebrow "Playlist", name, description (hidden when collapsed), stats `N songs • M min` (sum of durations).
- **Actions**: **Play** (all) button ("Playing..." spinner; becomes icon-only when collapsed) and **Delete** (confirm → `deletePlaylist` → `/dashboard/library`). No rename/edit (Edit2 icon imported but unused), no add/remove tracks, no reorder, no "add to queue"/"play next" options.
- **Track table** (Spotify-style): desktop columns `# | Title (thumb, title, artist) | Album | Date Added (en-US short date) | ⏱ (m:ss or --:--)`; mobile `# | Title | ⏱`. Hover: number → Play icon, lift. Row click → play that track.
- **Play flow** (same pattern as session detail, MUST-PRESERVE): click Play/track → store pending ('all'|'track') → **"Select Server"** modal with per-guild permission chip (`perm.reason`; yellow owner/botOwner, green in-voice, red otherwise; disabled if `!canPlay`) → if owner/botOwner && not in voice && guild not playing → **VoiceChannelSelectorModal** (with **Back** arrow returning to server selector) → `POST /api/player/{guildId}/join {channelId, user}` (error → toast) → wait 500 ms → execute; else join with `perm.voiceChannelId` → wait 500 ms → execute.
  - **Play track**: `POST /api/player/{guildId}` `{action:'play', value: uri || "title artist"[:100], user}` → toast "Playing: <title>".
  - **Play all**: if `sourceUrl` → single `play` with the original Spotify/YouTube playlist URL (bot expands it) → toast "Playing playlist: <name>"; else play first track then **sequentially POST `play` for every remaining track** (N requests, no error handling per track) → toast "Playing N tracks from <name>". Rebuild: add a bulk enqueue endpoint.
- **Toasts** (only page with a notification system): stacked bottom-right, green (CheckCircle) / red (AlertCircle), × dismiss, auto-dismiss **3600 ms**; ids from `Date.now()` (collisions possible).
- Dead: `checkingPlayer`, `loadingPermissions`, `thumbnailRef`, `searchParams`, `selectedGuild` computed but unused.

---

#### 17. Search (catalog browsing) — `/dashboard/search*`

Entry: the global header search box in the dashboard layout (1000 ms debounce / Enter → `/dashboard/search?q=`). Separate from the Home "Search songs" quick-add modal (§6), which searches via the bot/Lavalink per guild.

##### Shared "play from anywhere" pattern (search, album, artist, YouTube channel, session detail, playlist detail) — MUST-PRESERVE
Copy-pasted in 6 pages (rebuild: one `<PlayTargetPicker>` component + hook):
1. On mount: `GET ${BOT_API_URL}/api/guilds?userId=<discordId>` → guild list; preselect `localStorage['selectedGuildId']` (if still valid) else first; then `POST /api/guilds/user-permissions {userId, guildIds}` → `permissions[guildId] = {isOwner, isBotOwner, isInVoice, voiceChannelId, voiceChannelName, canPlay, reason}`.
2. Clicking any play control → requires login (`alert('Please login first')`) → stores pending play value → opens **"Select Server"** modal: "Choose a server to play music in:"; rows = guild icon/initial + name + status chip (`perm.reason`; yellow when owner/botOwner, green when in voice, red otherwise; "Loading..." before perms load); rows with `!canPlay` disabled at 50% opacity; selected guild highlighted; "No servers found" if none; **Cancel** and backdrop click close (200 ms animation) and clear pending.
3. On guild choice: save to `localStorage['selectedGuildId']`. If `(isOwner || isBotOwner) && !isInVoice && !guild.isPlaying` → **VoiceChannelSelectorModal**; on channel pick → `POST /api/player/{guildId}/join {channelId, user}` → wait 500 ms → `POST /api/player/{guildId} {action:'play', value, user}`. Otherwise → `POST /api/player/{guildId}/join {channelId: perm.voiceChannelId, user}` → wait 500 ms → play.
4. Errors via `alert("Failed to play: <error>")` (except playlist page which uses toasts). Row shows spinner for ~1 s (`playingTrackId/Uri`).
- No "Add to queue" vs "Play now" vs "Play next" distinction anywhere in search: every action is `play` (bot appends to queue if something is playing). **No "Add to playlist" action exists anywhere in the UI.**

##### `/dashboard/search?q=` — `app/dashboard/search/page.tsx`
- **Source tabs**: **Spotify** (green; default source `'spotify-api'`), **YouTube** (red-600), **YouTube Music** (red-500). Under Spotify, a **sub-toggle "API | Lavalink"** with animated sliding pill (shown in the Songs header) switches between `spotify-api` (Spotify Web API search) and `spotify` (Lavalink spsearch). Source state is not persisted and not in URL.
- Fetch: `GET /api/search?q=<q>&source=<spotify|spotify-api|youtube|youtubemusic>` → `SearchResult {query, topResult?: {type:'track'|'artist'|'album', data, score 0..1}, tracks: [{id,title,artist,artistId?,album?,albumId?,duration?,thumbnail?,uri?,spotifyUrl?}], artists: [{id,name,imageUrl?,followers?,genres?,spotifyUrl?,youtubeUrl?}], albums: [{id,name,artistName,artistId?,imageUrl?,releaseDate?,trackCount?,spotifyUrl?}], fromCache}`. Re-fetches on query or source change; spinner only when no previous results; results replaced only if track id list differs. Error "Failed to search. Please try again."
- States: loading spinner; error; empty (no q) "Search for music / Find songs, artists, and albums"; no results `No results found for "<q>"` / "Try searching for something else".
- **Top Result card** (left of 2-col grid on lg): label "Top Result", **"<score×100>% match"** chip with Sparkles, 160–176px image (round for artist), title, subtitle (artist / album artist / "1.2M followers"), type pill (Artist purple / Album grey / Track green). Artist → Link to `/dashboard/search/artist/{id}` (or `/dashboard/search/youtube/channel/{id}` when source is youtube/youtubemusic); album → `/dashboard/search/album/{id}`; track → not a link, hover green **Play** button (only if `uri`).
- **Songs** list: first **5** tracks; row (staggered `slideUpFadeIn` 80 ms): number (spinner while playing), hover play icon, 40px thumb, title (hover purple; green when playing), artist, duration `m:ss`/`--:--`. Click → play `uri` (rows without uri do nothing).
- **Artists** grid (2→5 cols): round 128px image, name, "Artist"; link to artist or YouTube-channel page depending on source (red vs purple glow).
- **Albums** grid: square cover, name, artistName, year. Link to album page.

##### `/dashboard/search/album/[id]` — `app/dashboard/search/album/[id]/page.tsx`
- `GET /api/album/{id}` → `{id, name, artist, artistId?, releaseDate?, images:[{url}], tracks:[{id,title,artist,duration,uri?}]}`; error → "Album not found" + message + "Back to Search" link.
- UI: Back (router.back), 208/256px cover, eyebrow "Album", huge title, artist (Link to `/dashboard/search/artist/{artistId}` if present), release **year**, "N songs, M min S sec". Big green **Play** → plays `https://open.spotify.com/album/{id}` (assumes Spotify album id). Track table `# | Title | ⏱` with hover play/green highlight; row click → play `uri` unless empty or contains `'mock'` (then search query `"title artist"`). Comment "Could add Like / Download / Share buttons here" (not implemented). `MoreVertical`, `pendingPlayTrackId` unused.

##### `/dashboard/search/artist/[id]` — `app/dashboard/search/artist/[id]/page.tsx`
- `GET /api/artist/{id}` → `{artist:{id,name,imageUrl?,followers?,genres?}, topTracks: SpotifyTrack[] (name, artists[], album{name,images}, duration_ms, external_urls.spotify, popularity?, uri), albums: [{id,name,images,release_date,total_tracks,external_urls}]}`. Track uri fallback `external_urls.spotify`.
- UI: full-bleed hero (h-72/80/96) with artist image as CSS background + gradient to #121212; round back button; **"Verified Artist"** badge if followers ≥ 10 000 (fake verification heuristic); giant name; "<N> followers" (1.2M/34K formatting).
- Actions: green **Play** → plays `spotify:artist:{id}` URI; **Shuffle** and **More (…)** buttons have **no handlers** (dead UI).
- **Popular**: top 5 (toggle "See more"/"Show less" for all); row: number/spinner, album thumb, name, album name, optional "plays" column = `popularity × 100000` formatted (**fabricated play count**), duration. Click → play uri (or `"name artists"` search if uri missing/'mock').
- **Albums**: up to 10, plain `<a href>` (full page reload, not Link) to album page; "YYYY • N songs".
- **Genres**: chips (cursor-pointer but no action).

##### `/dashboard/search/youtube/channel/[id]` — `app/dashboard/search/youtube/channel/[id]/page.tsx`
- `GET /api/youtube/channel/{id}` → `{artist: {id,name,imageUrl?,followers?(subscribers),genres?,youtubeUrl?,source?}, topTracks:[{id,name,artists[],album{images},duration_ms,category?:'music'|'video',external_urls.youtube?}]}`; uri = `external_urls.youtube || https://www.youtube.com/watch?v={id}`.
- UI: hero like artist page with red "YouTube Channel" badge, name, "<N> subscribers". Actions: red **Play** (plays `channel.youtubeUrl` if present else first video), **Shuffle** (no handler), **Open in YouTube** external link (if youtubeUrl), **More** (no handler).
- **Popular Videos**: top 5 / See more; row: number/spinner, thumb, title, artists joined, **category chip** "🎵 Music" (green) / "🎬 Video" (blue), duration. Click → play. Empty "No videos available". Error "Failed to load channel. Please try again." + "Back to Search".

---

#### 18. Design system / misc components

##### `app/globals.css`
- Dark-only look; body `#0d0d0d` bg, text `#e2e8f0`; shadcn HSL tokens (`--background`, `--primary`, … `--radius: 0.5rem`, `--chart-1..5`, `.dark` variants) exist but are mostly unused — real palette is hard-coded Tailwind: purple-600/500/400 primary accent, blue-500 secondary, slate greys, white/5–20 glass layers, green (Spotify/#1DB954, success), red (YouTube/#FF0000, errors), amber/yellow (warnings/owner).
- Component classes: **`.card-surface`** (rounded-2xl, white/10 border, glass gradient 0.08→0.02, shadow-2xl black/40, backdrop-blur-xl), **`.card-section`** (rounded-xl lighter variant), `.glass-card`, `.glass-card-hover` (purple glow + lift), `.glass-button`, **`.pill-button`** (rounded-full glass pill, purple hover glow, disabled 50%).
- Custom scrollbars (thin, gradient thumb, Firefox + WebKit).
- Animation utilities (keyframes + `.animate-*`): fadeIn, fadeOut (300 ms), slideInFromRight/Left, slideOutToRight, slideOutAndFade, slideUp, slideUpFadeIn, modalSlideUp, backdropFadeIn, listItemSlideIn, **cardFlip** (600 ms album art), expandHeight/collapseHeight (permission banner), smoothExpand/smoothCollapse + `.smooth-layout-container`, **jumpOutToPlay** (queue jump/remove), **numberFlip** (queue position numbers). 3D helpers `.perspective-1000`, `.transform-style-3d`, `.backface-hidden`. No `prefers-reduced-motion` handling.
- Runtime CSS var `--bg-dominant-color` set from JS (layout + NowPlaying).
- Font: Space Grotesk.

##### `components/Prism.tsx` (459 lines)
- Animated WebGL background (React Bits "Prism" effect) built on **ogl** (`Renderer, Triangle, Program, Mesh`): a glowing rotating prism shader. Props: `height, baseWidth, animationType ('rotate'|'hover'|'3drotate'), glow, offset, noise, transparent, scale, hueShift, colorFrequency, hoverStrength, inertia, bloom, suspendWhenOffscreen (IntersectionObserver), timeScale`. Used on login, callback and dashboard layout (toggleable, persisted). Heavy on GPU → user toggle "Prism ON/OFF" exists for that reason.

##### `components/ui/*` (shadcn/ui copies)
- `badge.tsx` (used by BotStatusBadge), `button.tsx`, `card.tsx`, `input.tsx` (used by example email login), `slider.tsx` (Radix slider — **unused**; volume uses native range), `table.tsx` (likely admin only). `components/admin/AdminSidebar.tsx` out of scope.

---

#### 19. Cross-cutting inventory

##### Route map (user-facing)
| URL | Auth | Notes |
|---|---|---|
| `/` | none | client redirect → `/dashboard` |
| `/login` | public | Discord OAuth popup; `?discord_error=` |
| `/login/callback?token=` | public | Firebase custom-token sign-in; postMessage to opener |
| `/dashboard` | layout: login required | control center |
| `/dashboard/history` | login | session list |
| `/dashboard/history/session/[sessionId]?guildId=` | login | session detail + replay |
| `/dashboard/library` | login | playlists (+placeholder tabs) |
| `/dashboard/library/import` | login | import wizard |
| `/dashboard/library/playlist/[id]` | login (no ownership check) | playlist detail/play/delete |
| `/dashboard/search?q=` | login | catalog search (Spotify API / Lavalink / YouTube / YT Music) |
| `/dashboard/search/album/[id]` | login | album |
| `/dashboard/search/artist/[id]` | login | Spotify artist |
| `/dashboard/search/youtube/channel/[id]` | login | YouTube channel |
| `/dashboard/settings` | login | per-guild settings |
| `/admin` | link shown only for admin/developer | (other note) |
- Auth is **client-side only** (layout redirect) — no middleware/SSR protection; all data APIs must enforce auth themselves.

##### Endpoints called by user pages
Same-origin Next API (`/api/...`): `player/{guildId}` (GET state; POST actions `play|pause|resume|skip|previous|seek|volume|playnow`), `player/{guildId}/search`, `player/{guildId}/server-history`, `player/{guildId}/join`, `player/user-history`, `queue/{guildId}` (POST `remove|clear|move`), `guild/{guildId}/voice-channels`, `guild/{guildId}/settings` (GET/POST), `guild/{guildId}/channels`, `guild/{guildId}/member/{userId}`, `guilds/user-permissions` (POST), `search`, `album/{id}`, `artist/{id}`, `youtube/channel/{id}`.
Bot direct (`NEXT_PUBLIC_BOT_API_URL`): `api/guilds[?userId=]`, `api/presence/connect` (SSE), `api/guild/{id}/247` (POST), `api/guild/{id}/events?userId=` (SSE; history page opens it raw — that useSSE uses the same URL is inferred, see hooks note), `api/queue/{guildId}` (GET), `api/charts/billboard`, `api/user/{discordId}/sessions?limit=50`, `api/guild/{id}/sessions?limit=50`, `api/playlists*`, `api/playlist/fetch`, `api/playlist-stats`.
Hooks consumed: `useAuth`, `useSSE(guildId)`, `useUserSSE(discordId)`, `useBotStatus`, `useControlPermission(guildId)`, `useQueueRecheck(guildId)`.

##### SSE event types consumed by user pages (MUST-PRESERVE contract)
`init`, `trackStart`, `trackEnd`, `queueEnd`, `queueUpdate`, `jumpToTrack`, `volumeChange`, `playerPause`, `playerResume`, `playerSeek`, `twentyFourSevenChange`, `playerDestroy`, `userHistoryUpdate`, `serverHistoryUpdate`, `voiceChannelsUpdate`, `settingsUpdate`, `sessionUpdate`, `sessionEnd` (+ user-level stream from `useUserSSE` for guild list).

##### Polling intervals (fallbacks)
- Guild list (home): 10 s when user-SSE disconnected. Settings guild list: 30 s always.
- Player state: 5 s when guild SSE disconnected. Queue: 5 s when SSE disconnected.
- Layout sessionStorage poll: 500 ms. Login popup-closed poll: 500 ms.
- Queue recheck: 1 s after each optimistic mutation (QueueRecheckManager).

##### Browser storage keys
- `sessionStorage['selectedGuildId']` — home + layout (shared guild selection).
- `localStorage['selectedGuildId']` — search/album/artist/channel/session/playlist pages (separate! two sources of truth).
- `localStorage['prismEnabled']` — Prism background toggle (default true).
- `sessionStorage['247_toggle_<guildId>']` — last 24/7 toggle timestamp (5 s SSE-ignore window).
- `localStorage['session_history_<discordId>']` — session-history SWR cache (1 h TTL).
- Window globals (not storage): `__nowPlayingSetCurrent`, `__nowPlayingHasTrack`, `__queueHasTracks`, `__queueGetFirstTrack`, `__queueOptimisticSkip`, `__queueOptimisticAdd`, `__queueRecheckSync`, `__jumpToTrackInProgress`, (`__queueClearSuppressFlag` referenced, never defined).

##### Permission UI states (summary)
- Per-guild flags from server: `isOwner`, `isBotOwner`, `isInVoiceWithBot`/`isInVoice`, `canControl`, `canPlay`, `hasPlayer`, `reason` string.
- Home: `useControlPermission(guildId)` → `canControl` gates prev/play/pause/skip/seek/volume/24-7/recommendation clicks/queue drag/remove/clear/jump; disabled buttons show tooltip = reason; amber Lock + reason under controls; idle amber banner (except reason `'No active player - can start playback'`). Adding songs from the search modal allowed if `canControl || isOwner`; otherwise error = reason.
- Server list badges: Owner / In Voice / Can Play / View Only.
- "Select Server" modal: disabled rows when `!canPlay`, chip = `reason`.
- Owner not in voice → VoiceChannelSelectorModal (`requiresVoiceChannel && canSelectChannel` response from play API, or client rule `isOwner && !isInVoice && !isPlaying`).
- Settings: no client gating (Owner chip only).

##### Toasts / notifications
- No global toast system. Patterns: inline red/green boxes (search modal, settings, import), `alert()` (search/album/artist/channel/session/library delete uses `confirm()`), stacked auto-dismiss toasts only on playlist detail (3.6 s).

##### Controls that do NOT exist (explicit absence)
- No loop/repeat control anywhere in the user dashboard. No queue shuffle control (Shuffle buttons on artist/channel pages have no handlers). No "Play next" / "Add to queue" distinction — every browse/search action is a plain `play` (bot decides start vs append). No "Add to playlist", no playlist create-empty/rename/add-track/remove-track UI, no like/follow/save. No stop/disconnect button. No lyrics, no filters/EQ.

##### Keyboard shortcuts
- None global. Only: Enter in header search (immediate navigate), Enter in import URL input. No Escape-to-close on any modal, no space-to-play, no media keys.

##### Responsive / mobile
- Layout: sidebar stacks above content below `lg` (no drawer; sidebar consumes a full card on phones). Header title hidden < sm.
- Home grid 1 col < lg; search modal results 1 col < md.
- Tables hide "Requested by" / "Album" / "Date Added" columns on mobile.
- Queue DnD uses HTML5 drag events → **does not work on touch devices**.
- Volume slider has touch start/end handlers.

---


### 7.A Admin pages

#### A. Admin panel (`/admin/*`)

##### A.0 Shared conventions (apply to every admin page)
- All admin pages are `'use client'` and call the **bot HTTP API directly from the browser** at `BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001'` (defined per-file, e.g. `app/admin/page.tsx:19`).
- **No auth header / token is attached to any admin fetch or EventSource** (`fetch(\`${BOT_API_URL}/api/admin/stats\`)` etc.). Admin gating is purely client-side (layout redirect). The bot's `/api/admin/*` endpoints are therefore reachable by anyone who knows the URL: the bot registers them in `bot/src/api/server.ts` (e.g. `:228` stats, `:334` logs SSE, `:465` presence SSE, `:486`/`:505` user cache, `:1193`/`:1225`/`:1269` guild info/text-channels/messages) behind only `app.use(cors())` (all origins, `:129`) — no API key, no token, no role check (see X.1). **SECURITY ISSUE → rebuild must enforce admin role server-side on every admin endpoint and SSE stream.**
- "Bot offline" detection pattern: check `content-type` includes `application/json`; otherwise treat as offline (Cloudflare tunnel returns HTML when bot is down) — `app/admin/page.tsx:53-60`, `guilds/page.tsx:39-45`, `performance/page.tsx:31-37`, `users/page.tsx:49-55`. Errors are `console.warn` and surface "Bot appears to be offline".
- Dates formatted in `th-TH` locale on guild/session pages; Thai UI strings in thread preview (`'เธรดนี้ถูกเก็บถาวรแล้ว'` archived / `'คลิกเพื่อดูเธรด'` click to view, `ข้อความ` messages).
- Visual: dark `#0a0a0f` bg, purple/pink gradient overlay, `card-surface` cards, lucide icons.

##### A.1 Layout & gating — `app/admin/layout.tsx`
- Uses `useAuth()` → `{ user, loading, isAdmin, isDeveloper }`.
- `loading` → spinner "Loading admin panel...".
- Not logged in → `router.replace('/login')` (`:17-19`).
- Logged in but `!isAdmin && !isDeveloper` → `router.replace('/dashboard')` (`:23-25`) and renders "Access Denied".
- Else renders `<AdminSidebar/>` + `<main className="ml-64 ...">` (note: main margin is fixed `ml-64` even when sidebar collapsed to `w-16` → layout quirk).
- Role semantics: `isAdmin` and `isDeveloper` both come from the Firestore `adminWhitelist` lookup (via `/api/admin/whitelist`) (see C). Both roles can enter the admin panel. **Developer-only capabilities:** sidebar "Settings" link (`devOnly`), whitelist Add/Edit/Delete buttons. Everything else (dashboard, terminal, guilds, guild detail incl. reading Discord messages, users, user detail, performance, sessions) is visible to **both** admin and developer.

##### A.2 Sidebar — `components/admin/AdminSidebar.tsx`
- Nav items (`:29-37`): `/admin` Dashboard, `/admin/terminal` Terminal, `/admin/whitelist` Whitelist, `/admin/guilds` Guilds, `/admin/users` Users, `/admin/performance` Performance, `/admin/settings` Settings (**devOnly**; hidden when `!isDeveloper`, `:72`). **`/admin/settings` page does not exist** (no `app/admin/settings/page.tsx`) → 404 link (bug/unfinished).
- Active match: exact for `/admin`, `startsWith` for others (`:74-75`).
- Header shows "Admin Panel" + `adminRole || 'Guest'` (capitalized).
- Bottom: link "User Dashboard" → `/dashboard`; user avatar (`user.avatar`), `user.username`, `user.discordId`; "Sign Out" → `signOut()` from useAuth.
- Collapse toggle (local state only, not persisted): `w-64` ↔ `w-16`, labels hidden when collapsed.

##### A.3 Admin Dashboard — `app/admin/page.tsx`
- Source: `GET {BOT}/api/admin/stats` on mount + **every 30 s** (`:75-80`) + manual Refresh button.
- Expected response `BotStats` (`:21-39`): `{ online: boolean, ping: number(ms), uptime: number(ms), guilds: number, users: number, activePlayers: number, cpu: number(%), memory: { used: bytes, total: bytes, percentage: number }, cache: { name, size(bytes), items }[] }`.
- Widgets: header "Welcome back, {username}" + role pill (purple if developer, blue else); 4 status cards — Bot Status (Online/Offline + `{ping}ms ping` / "No connection"), Uptime (`formatUptime` → `Xd Xh Xm` / `Xh Xm` / `Xm Xs` / `Xs`, "Since last restart"), Servers (`guilds`), Active Players (`activePlayers`); CPU Usage card (`cpu.toFixed(1)%` + bar), Memory Usage card (`percentage.toFixed(1)%`, bar, `used / total` via `formatBytes` B/KB/MB/GB 1024-base); Cache Status grid (per cache: name, `{items} items`, `formatBytes(size)`) shown only if `cache.length > 0`; footer "Last updated: {time}". `users` field is returned but **not displayed**.
- Error banner: "Failed to load stats: … Make sure the bot is running and the admin API is enabled."

##### A.4 Guilds list — `app/admin/guilds/page.tsx`
- Source: `GET {BOT}/api/admin/guilds` once on mount + Refresh button (no polling). Response `{ guilds: Guild[] }`, `Guild = { id, name, icon: string|null (full URL), memberCount, ownerId, hasPlayer: boolean, joinedAt: string(ISO) }` (`:17-25`).
- Stats cards: Total Servers (`guilds.length`), Total Members (sum memberCount, `toLocaleString`), Currently Playing (count `hasPlayer`).
- Filter: text search on `name` (case-insensitive) OR substring of `id`. Sort select: `name` (localeCompare asc, default) | `members` (desc) | `joined` (joinedAt desc). Shows `{n} guilds`.
- Grid cards (skeleton ×6 while loading): icon or first letter, name, mono id, member count, "Playing" badge if hasPlayer. Card links to `/admin/guild/{id}`; an inner ExternalLink span opens `/dashboard?guild={id}` in a new tab (`:210-214`, preventDefault on the Link).
- `ownerId` unused in UI.

##### A.5 Guild detail — `app/admin/guild/[guildId]/page.tsx` (1458 lines)
**URL state:** `?tab=overview|channels|sessions|history` (default overview, omitted from URL) and `?channel={channelId}`; kept in sync with `router.replace(..., {scroll:false})` (`:444-451`).

**Data fetched on mount (sequential, all unauthenticated, `:454-499`):**
| # | Endpoint | Used as |
|---|---|---|
|1| `GET {BOT}/api/admin/guild/{guildId}/info` | `GuildInfo { id, name, icon, banner, memberCount, ownerId, createdAt(ms), description, features[], channels:{text,voice,category} }` |
|2| `GET {BOT}/api/guild/{guildId}/voice-channels` → `.channels` | `VoiceChannel { id, name, type, memberCount, members:{id,username,displayName,avatar,isBot?}[] }` |
|3| `GET {BOT}/api/admin/guild/{guildId}/text-channels` → `.channels` | `TextChannel { id, name, type, isThread, parentId, parentName, position }` |
|4| `GET {BOT}/api/guild/{guildId}/sessions?limit=50` → `.sessions` | `Session { sessionId, guildId, startTime(ms), endTime?, isActive?, tracks:any[], participants:any[] }` |
|5| `GET {BOT}/api/guild/{guildId}/history` → `.tracks` | `HistoryTrack { id, title, artist, playCount, thumbnail? }` (top-played list) |
- On channel select: `GET {BOT}/api/admin/guild/{guildId}/messages/{channelId}?limit=50` → `.messages: Message[]` (`:501-521`). No pagination / "load more"; no live updates; auto-scroll to bottom after load (`behavior:'instant'`).
- If `guildInfo` null → "Guild not found" + Back.

**Message model (`:66-150`)** — rebuild must return exactly this from the bot "read messages" endpoint:
- `Message { id, content, author{id,username,avatar,bot}, timestamp(ms), mentions: Mention{id,username,avatar}[], mentionedRoles: RoleMention{id,name,color(hex)}[], attachments: Attachment[], embeds: Embed[], reactions: {emoji,count}[], replyTo: Reply|null, thread: ThreadInfo|null }`
- `Attachment { id, name, url, proxyURL, size, contentType|null, fileType:'image'|'video'|'audio'|'document'|'file', width|null, height|null, spoiler }`
- `Embed { type, title|null, description|null, url|null, color:number|null, provider{name,url|null}|null, author{name,iconURL|null}|null, thumbnail|null, image|null, video|null }`
- `Reply { messageId, author{username,avatar}|null, content, mentions{id,username}[] }`
- `ThreadInfo { id, name, messageCount, lastActivityAt, archived }`

**Header:** back button (`router.back()`), icon/initial, name, `{memberCount} members`, `{channels.text} text`, `{channels.voice} voice`. (banner, description, features, createdAt, ownerId fetched but unused.)

**Tabs:**
1. **Overview** (2-col grid):
   - Voice Channels: each with name, `{memberCount} connected`, up to 5 member avatars + `+N`.
   - Text Channels: clickable list (name + parentName category on right) → selects channel and switches to Channels tab.
   - Recent Sessions: first 5 sessions → link `/admin/session/{sessionId}`; thumbnail = `tracks[0].thumbnail`; date, `{tracks.length} tracks`, up to 4 participant avatars (`p.avatarURL`, title=username) + `+N` (tooltip lists rest), "Live" pill if `isActive`.
   - Top Tracks: first 5 of history: rank, thumbnail, title, artist, `{playCount} plays`.
2. **Channels** (3-col): left list renders non-thread channels, with threads nested under their `parentId` (indented, MessageCircle icon). Right: messages pane (max-h 500, scroll).
   - Message render: Discord-style reply reference (curved connector, reply author avatar, `@username`, reply content with mention parsing); author avatar 40px; username (purple if bot) + `BOT` tag; `th-TH` date+time.
   - Content hidden when it's only a URL and there's a "pure media" embed; hidden when empty.
   - Content parsed by `parseDiscordMarkdown` (`:194-396`): supports blockquote lines `>`, list items `- `/`* ` with indent, masked links `[text](url)` (with `**bold**`/`*italic*`/`__underline__` link text), `**bold**` (with auto-linked URLs inside), `` `code` ``, role mention `<@&id>` (colored by role color; `#000000` → `#99aab5`), user mention `<@id>`/`<@!id>` (→ `@username` or `@user`), bare URLs → links. No italics/strikethrough/spoiler/code-block/custom emoji/channel-mention support.
   - Attachments: image (thumbnail max-h 200, click → preview modal, download button), video (`<video controls>`, dblclick → preview), audio (`<audio controls>` card), document/file (download card with `formatFileSize`).
   - Embeds: "pure media" (no title/desc/author and gifv/image) → bare img or autoplay-loop-muted video for gifv, wrapped in link; rich embed → left border color from `embed.color` (hex, default `#5865f2`), provider name, author (icon+name), title (link if url), description (markdown-parsed), right thumbnail (if not video/gifv/image/article and no image), then YouTube iframe for `type==='video'` (url rewritten `watch?v=`→`embed/`, `youtu.be/`→`youtube.com/embed/`), gifv video, or large image (non-rich).
   - Reactions: pills `{emoji} {count}`.
   - Thread preview button: name, `{messageCount} ข้อความ >`, archived/click hint → `handleThreadClick` adds thread to channel list if missing (type 11, position 999) and selects it (`:531-551`).
   - **Media preview modal**: full-screen black overlay; buttons Download (`<a download>`), Copy link (clipboard), Open in new tab, Close; supports image/video/gif.
3. **Sessions** (grid 2/3/4 cols): all sessions as square cards → `/admin/session/{id}`: thumbnail, hover play overlay, "Live" badge, participant avatars (4 + N), date, `{tracks} tracks • {participants} participants`.
4. **History**: table `#`, Track (thumb+title), Artist (md+), Plays.

**Admin capabilities here are READ-ONLY** — no player controls, no queue view, no message sending, no moderation. (Player state and queue are NOT shown on this page.)

##### A.6 Session detail — `app/admin/session/[sessionId]/page.tsx`
- Source: `GET {BOT}/api/admin/session/{sessionId}` → `{ session }` (admin endpoint searches across all guilds, `:92-93`).
- `Session { sessionId, guildId, guildName?, guildIcon?, startTime, endTime?, isActive?, tracks: SessionTrack[], participants: SessionParticipant[] }`; `SessionTrack { title, author, uri, thumbnail?, duration(ms), requesterName?, requesterAvatar? }`; `SessionParticipant { userId, username, avatarURL? }`.
- Dominant-color hero: `fast-average-color` (`algorithm:'dominant'`) on `tracks[0].thumbnail` with `crossOrigin='anonymous'` → gradient background; fallback `rgb(88,28,135)`.
- Header: Back, big thumbnail, "Live" badge, "Session History", date (`th-TH` weekday long), guild icon+name, `{n} songs`, `{totalMinutes} min` (sum of track durations), `{participants} participants`, up to 6 participant avatars + N.
- Track table: `#`, Title (thumb + requester avatar badge overlay + title + author), "Requested by" (requesterName or "Unknown", hidden on mobile), Duration (`h:mm:ss`/`m:ss`).
- `sessionDuration` computed but unused (`:170-172`).

##### A.7 Terminal — `app/admin/terminal/page.tsx`
- **It is a read-only live log viewer, NOT a command console.** There is no input to send commands, no command list. (Brief assumption "list of commands it exposes" → none exist.)
- Source: `new EventSource(\`${BOT}/api/admin/logs/events\`)` (`:39`). Message protocol (default `message` event, JSON):
  - `{ type: 'history', logs: LogEntry[] }` → replaces log list (initial backlog).
  - otherwise the payload *is* a `LogEntry { timestamp: Date|string, level: 'info'|'warn'|'error', message: string }` → appended, list capped at **1000** (`prev.slice(-999)`).
- Connection badge Connected/Disconnected from `onopen`/`onerror` (browser auto-reconnects; no custom backoff).
- Controls: Download (`bot-logs-YYYY-MM-DD.txt`, lines `[ISO] [LEVEL] message`, raw ANSI kept), Clear (local only), Pause/Resume (buffer while paused, flush on resume, cap 1000), Auto-scroll toggle.
- Filters: level buttons all/info/warn/error; text search (case-insensitive substring of message). Counter `{filtered} / {total} logs`.
- Rendering: monospace; per-line local time, `[LEVEL]` coloured (error red, warn yellow), row bg tint for error/warn; **ANSI SGR parser** (`:136-220`) supports codes 0 reset, 1 bold, 2 dim(opacity .7), 3 italic, 4 underline, fg 30-37/90-97, bg 40-47 → mapped CSS colours.
- **BUG** `:57`: `paused` is read inside `onmessage` of an effect with `[]` deps → always the initial `false`; pausing never buffers (logs keep appending while "paused"); the "N buffered" badge reads a ref and never re-renders. `isDeveloper` is destructured but unused (terminal visible to admins too).

##### A.8 Performance — `app/admin/performance/page.tsx`
- Source: polls `GET {BOT}/api/admin/stats` **every 5 s** (`:67-71`) + manual refresh; keeps last **60** samples client-side (5 minutes) — history is **not persisted**, starts empty on each visit.
- Cards: CPU % (bar), Memory % (`memory.percentage`, bar), Active Players.
- Canvas chart 800×300 (`:74-147`): grid lines at 100/75/50/25/0 %, CPU line `#f97316`, Memory line `#06b6d4`, legend top-right; needs ≥2 points ("Collecting data...").
- Footer: "Data updates every 5 seconds • Showing last {n} data points".

##### A.9 Users list — `app/admin/users/page.tsx`
- Initial source: `GET {BOT}/api/admin/users/cached` (bot in-memory user cache) → `{ users: [...] }` mapped to `UserData { id, discordId, username('Unknown' default), avatar (if not http → `https://cdn.discordapp.com/avatars/{discordId}/{hash}.png`), lastActive: Date?, playCount, tracksCount }` (`:60-72`).
- Realtime #1: `EventSource {BOT}/api/admin/presence/events` — event `{ type:'dashboardPresence', users:[{discordId,...}] }` → set of discordIds currently **on the website dashboard** (`:89-112`).
- Realtime #2: `EventSource {BOT}/api/admin/users/cached/events` — `{ type:'userCacheUpdate', users:[...] }` → full replace of the users list (`:115-149`).
- Stats: Total Users, Active Today (lastActive ≥ local midnight).
- Search: username (ci) or discordId substring. Count label.
- Table columns: User (avatar + green/grey presence dot, tooltip "On Dashboard"/"Offline"), Discord ID (mono), Plays (`playCount`), Tracks (`tracksCount`), Last Active ("Now" in green if present on dashboard, else `toLocaleString` or "Never"), Actions → "View Details" link `/admin/users/{discordId}`.

##### A.10 User detail — `app/admin/users/[id]/page.tsx` (`id` = Discord ID)
- Profile source order: (1) **client-side Firestore** `getDoc(doc(db,'users',\`discord_${id}\`))` (`:84`) → `{ discordId, username, avatar(hash → CDN url), createdAt: Timestamp, lastActive: Timestamp, playCount }`; (2) fallback `GET {BOT}/api/admin/users/cached` and find by discordId.
  - ⇒ Firestore rules must allow an admin to read **another** user's `users/discord_{id}` doc (or this read fails silently).
- History: `GET {BOT}/api/admin/user/{id}/history?limit=500&sortBy=lastPlayedAt` → `.history: { id, title, artist, playedAt, duration(ms), source, thumbnail? }[]`. Overrides `playCount = history.length` ("unique tracks") and `lastActive = history[0].playedAt` (`:141-148`).
- Sessions: `GET {BOT}/api/admin/user/{id}/sessions?limit=500` → `.sessions: { sessionId, guildId, guildName, startTime, endTime?, trackCount, tracks:{title,artist,thumbnail?}[], participants[], isActive? }[]`.
- Presence: own `EventSource {BOT}/api/admin/presence/events` → `isOnline` if this discordId in `dashboardPresence.users`.
- UI: Back to Users; header avatar 80px, username, id, "Joined {createdAt date}", `{playCount} plays`, "Online now" (pulsing dot) or "Last active {date}" (only rendered if `lastActive` exists — so an online user with no lastActive shows nothing). Tabs: "Play History ({n})" table [Track (thumb/title/artist), Duration `m:ss`, Played `toLocaleString`]; "Sessions ({n})" cards → `/admin/session/{id}` (thumbnail, play overlay, Live badge, participant avatars, track-count badge, relative date "Today, hh:mm" / "Yesterday, …" / weekday if <7d / "Mon D, hh:mm", guild name, participants count, duration `Xh Ym` / `X min`).
- No admin actions (ban, reset, role change) on users.

##### A.11 Whitelist — `app/admin/whitelist/page.tsx` + `services/adminWhitelist.ts`
- Data path: page → `services/adminWhitelist.ts` (client) → **Next route `/api/admin/whitelist`** (`app/api/admin/whitelist/route.ts`, Firebase Admin SDK, bypasses rules) → Firestore collection **`adminWhitelist`** (doc id = Discord ID). This collection is absent from `FIRESTORE_SCHEMA.md` (see F.1).
- Service functions: `checkAdminRole(discordId)` → `GET /api/admin/whitelist?discordId=` → `{isAdmin,isDeveloper,role}` (errors → all false); `getWhitelist()` → `GET /api/admin/whitelist` → `entries` with `addedAt` → Date; `addToWhitelist(discordId, username, role, addedBy)` → `POST` JSON; `removeFromWhitelist(discordId)` → `DELETE ?discordId=`; `updateWhitelistRole(discordId, role)` → `PATCH` JSON `{discordId, role}`. All return boolean `res.ok`.
- Stats: Total Users, Developers (count role=developer), Admins (count role=admin).
- Table: User (username), Discord ID (mono), Role pill (developer → purple + Code icon; admin → blue + Crown icon), Added (`addedAt` date), Actions column (developer only): Edit (inline `<select>` admin/developer + Save/Cancel), Delete (confirm "Are you sure you want to remove this user?").
- "Add User" button (developer only) → modal with Discord ID, Username, Role (admin|developer, default admin); validation `alert('Please fill in all fields')`; `addedBy = user.discordId || 'unknown'`; success → close + reset + refetch; failure → `alert('Failed to add to whitelist')`.
- Admins (non-developers) see the list read-only. **This restriction is UI-only** — the API route has no auth at all (see B.1, X.1).
- No username lookup from Discord ID (username is free text typed by the developer).

---


---

## 8. Realtime / sync behaviours on the dashboard

What each SSE event mutates in the UI is in §7.U (part §19 cross-cutting inventory, and the NowPlaying/Queue sections). The server-side event catalogue is in §3 (part §5).

### D. Realtime / sync layer

#### D.0 Which pieces are live vs dead
| Module | Used by | Status |
|---|---|---|
| `hooks/useSSE.ts` | dashboard layout (`app/dashboard/layout.tsx:37`), `NowPlayingSection:563`, `QueueSection:325`, `GuildSettingsSection:28`, `VoiceChannelSelectorModal:39`, history session page `:187`, `useControlPermission:24` | **LIVE – core** |
| `hooks/useUserSSE.ts` | `app/dashboard/page.tsx:266` (server list) | **LIVE** |
| `hooks/useBotStatus.ts` | `app/dashboard/page.tsx:261`, `app/dashboard/settings/page.tsx:148` | **LIVE** |
| `hooks/useControlPermission.ts` | player/queue components | **LIVE** |
| `hooks/useQueueRecheck.ts` + `services/QueueRecheckManager.ts` + `QueueMutex.ts` + `RetryLimiter.ts` | `QueueSection:338` (`scheduleRecheck`) | wired but **functionally a no-op** (see D.6) |
| `hooks/useQueue.ts` (3 s poll) | nobody | **DEAD** |
| `hooks/useCurrentTrack.ts` (2 s poll) | nobody | **DEAD** |
| `hooks/useMultiTabSync.ts` (BroadcastChannel) | nobody | **DEAD** |
| `lib/playlist-service.ts` | library pages | LIVE (talks to bot directly) |
| `lib/top-charts.ts` | NowPlayingSection (billboard) | LIVE |

#### D.1 Guild SSE — `hooks/useSSE.ts`
- **URL:** `GET {NEXT_PUBLIC_BOT_API_URL}/api/guild/{guildId}/events` (native `EventSource`, no auth, no `withCredentials`) (`:102-107`).
- **Singleton per guild:** module-level `globalConnections: Map<guildId, {eventSource, subscribers:Set<fn>, lastSequence, reconnectTimeout, reconnectAttempts}>` — ONE EventSource per guildId shared across all hook instances in the tab (prevents hitting the browser's 6-connection HTTP/1.1 limit).
- **Joining an existing open connection:** adds subscriber, calls `onConnect()` immediately, and fetches a **synthetic `init`** via `GET {BOT}/api/queue/{guildId}` → `{ type:'init', guildId, data:{ track: current, current, playing ?? false, position||0, volume||15, twentyFourSeven||false, queue||[] }, timestamp }` delivered only to the new subscriber (`:28-53`, `:68-80`).
- **Message handling (`onmessage`, default event, JSON `SSEMessage {type, guildId, data, timestamp, sequence?}`):** skip `type==='heartbeat'`; **sequence dedupe**: if `message.sequence` present and `<= lastSequence` → drop, else update `lastSequence`; fan out to all subscribers (each wrapped in try/catch).
- **Reconnect (`handleError`, `:158-191`):** calls the *creator's* `onDisconnect`; if `reconnectAttempts >= 5` → close & delete connection (gives up; "bot may be offline"); if `readyState === CLOSED` → manual reconnect after `min(1000·2^attempts, 30000)` ms (1s,2s,4s,8s,16s), new EventSource reusing handlers, `attempts++`, **`lastSequence` reset to 0**. If readyState is CONNECTING the browser's native auto-retry is used (attempt counter not incremented). `onopen` resets attempts to 0.
- **Unsubscribe:** remove subscriber; when 0 subscribers, close after **1000 ms grace** (avoids churn on re-render/navigation).
- **Per-hook delivery queue (`useSSE`, `:225-310`):** messages for the current guild (or `type==='init'`) get a local `eventId`, are pushed to a queue and delivered **one at a time with `flushSync(setData)` spaced 16 ms apart** so React doesn't batch/drop consecutive events (consumers watch a single `data` state). Guild change → clears data & queue. Returns `{ data, connected, error }` (`error` is never set).
- **No client heartbeat timeout** — liveness relies on EventSource error events; server sends `heartbeat` messages (every 30 s per useUserSSE comment).
- **Event types consumed (by components) and state mutated:**
  | type | consumer | effect |
  |---|---|---|
  | `init` | NowPlayingSection:650, QueueSection:577, dashboard layout:46 | set track (title, author→artist, duration, thumbnail, requesterAvatar, requesterName), `position`→currentTime + `lastSyncTime=now`, `playing` (default true), `volume`; 24/7 flag from `data.twentyFourSeven` **unless the user toggled 24/7 within 5 s** (ref + `sessionStorage['247_toggle_{guildId}']`); no track → hasTrack=false. Queue: replace list from `data.queue` (title, author, duration, thumbnail, requesterAvatar, requesterName). Layout: thumbnail for background colour extraction. |
  | `trackStart` | NowPlaying, layout | same as init (track part) |
  | `trackEnd` | NowPlaying:698, layout | if `window.__jumpToTrackInProgress` < 2 s ago → suppress (clear flag, call `__queueClearSuppressFlag`); else if queue has tracks (`window.__queueHasTracks()`/`__queueGetFirstTrack()`) → **optimistically show next track** (time 0, playing) and call `window.__queueOptimisticSkip()` to animate removal; else 300 ms transition then clear player. Layout clears thumbnail. |
  | `queueEnd` | NowPlaying:748 | 300 ms transition → clear player |
  | `playerDestroy` | layout:53 | clear thumbnail |
  | `volumeChange` | NowPlaying:762 | `data.volume` |
  | `playerPause` / `playerResume` | NowPlaying:765/773 | isPlaying false/true; if `data.position` number → resync time |
  | `playerSeek` | NowPlaying:781 | set time from `data.position`, `lastSyncTime`, `lastSeekTime` |
  | `twentyFourSevenChange` | NowPlaying:789 | `data.enabled` |
  | `userHistoryUpdate` | NowPlaying:793 | `data.tracks[]` → user history list |
  | `serverHistoryUpdate` | NowPlaying:799 | `data.tracks[]` → server history (unhide section if non-empty) |
  | `queueUpdate` | QueueSection:506 | diff by **title**: removed titles animate out (350 ms) then replace; new titles (not pending optimistic adds) animate in (400 ms); confirmed optimistic adds cleared from `pendingOptimisticAddsRef` |
  | `jumpToTrack` | QueueSection:592 | `data.fromIndex` → animate & splice that index (400 ms), set `suppressNextSkipRef` |
  | `permissionUpdate` / `permissionBatchUpdate` | useControlPermission | see C.4 |
  | `settingsUpdate` | GuildSettingsSection:52 | refresh settings |
  | `voiceChannelsUpdate` | VoiceChannelSelectorModal:48 | refresh voice channel list |
  | `sessionUpdate` / `sessionEnd` | history session page:363 | refresh session |
- **Fallback polling when SSE disconnected:** NowPlayingSection polls `GET /api/player/{g}` every **5 s** only while `!sseConnected` (`:893`); QueueSection polls `GET {BOT}/api/queue/{g}` every **5 s** only while `!sseConnected` (`:716`).
- **Cross-component coordination via `window` globals** (no store): `__queueRecheckSync`, `__queueHasTracks`, `__queueGetFirstTrack`, `__queueOptimisticSkip`, `__queueClearSuppressFlag`, `__jumpToTrackInProgress`, `__nowPlayingHasTrack`. Rebuild should replace with a shared store (Zustand/Context) but keep the behaviours.

#### D.2 Per-user SSE — `hooks/useUserSSE.ts`
- **URL:** `GET {BOT}/api/user/{discordId}/events` (no auth; any discordId can be subscribed to → leaks which guilds a user is in).
- Messages `{type, userId, data, timestamp}`:
  - `heartbeat` (every 30 s) → ignored.
  - `userInit` → `guilds = data.guilds` (`Guild { guildId, guildName, guildIcon?, memberCount?, hasPlayer?, isPlaying?, queueLength?, isOwner?, isInVoiceWithBot?, canControl?, userVoiceChannelId? }`), `loading=false`.
  - `guildUpdate` → patch matching guild `queueLength`, `isPlaying`, `hasPlayer` (nullish-coalesced).
  - `userPermissionUpdate` → patch `isInVoiceWithBot = data.isInVoice`, `canControl`.
- Reconnect: on error, if `readyState===CLOSED` → `min(1000·2^attempts, 30000)` then `connect()`. **BUG (`:73-74` vs `:153-156`): `connect()` resets `reconnectAttempts.current = 0`, so the counter never reaches 5 → infinite reconnect every 1 s, "Max reconnection attempts" never shown.**
- Returns `{guilds, connected, error, loading}`. Dashboard page additionally polls `GET {BOT}/api/guilds?userId=` every 10 s (`app/dashboard/page.tsx:361`).

#### D.3 Bot status polling — `hooks/useBotStatus.ts`
- `GET {BOT}/api/status` immediately then **every 10 s**. Response fields used: `botOnline`, `guildCount`, `uptime`, `timestamp`.
- State `BotStatus {state:'online'|'offline', uptime, guilds, lastUpdated: Date(data.timestamp), version:'1.0.0'}`; **skips state update** when state & guilds equal and uptime differs < 15 s (avoid re-renders). Error / non-JSON → `{state:'offline', uptime:0, guilds:0, version:'0.0.0'}` (set once). Network TypeErrors not logged.

#### D.4 Progress interpolation (live implementation is in `components/NowPlayingSection.tsx:51-122`, not `useCurrentTrack`)
- State: `trackCurrentTime` (ms at last sync), `lastSyncTime` (Date.now() at sync), `lastSeekTime`, `isPlaying`, `duration`.
- `ProgressBarWithTimer`: while playing, `requestAnimationFrame` loop computes `min(initialTime + (now - lastSyncTime), duration)`. **Anti-jitter rule:** if the new value is *behind* the displayed value by < 5 s and no seek in last 2 s → **stall** (keep displayed value) instead of jumping back. While paused: only snap to server value if it differs > 5 s or a seek happened in last 2 s.
- Pause action computes `currentPosition = trackCurrentTime + (now - lastSyncTime)` (`:1208`).
- Dead `useCurrentTrack` (2 s poll of `GET {BOT}/api/current-track/{g}`): track identity key `title|author|duration`; only updates position if it changed by > 500 ms; 404 → clears. Kept here only as reference.

#### D.5 Multi-tab sync
- `hooks/useMultiTabSync(channelName, onMessage)` → `BroadcastChannel(channelName)`, `broadcast(type, payload)` posts `{type, payload, timestamp}`. **Not used anywhere**; no leader election; no localStorage keys.
- Actual cross-tab consistency comes from every tab holding its own SSE connection (server fan-out). Storage keys actually used: `sessionStorage['selectedGuildId']` (dashboard page writes; layout polls it every 500 ms because `storage` events don't fire same-window), `sessionStorage['247_toggle_{guildId}']` (5 s 24/7 toggle guard), `localStorage['prismEnabled']` (background effect toggle).

#### D.6 QueueRecheckManager / QueueMutex / RetryLimiter
- **`QueueRecheckManager`** (singleton, `services/QueueRecheckManager.ts`):
  - `triggerRecheck(guildId, delayMs=1000)` — debounced per guild (clears previous timeout).
  - `recheckQueue(guildId)`: acquires per-guild mutex → if no `localStates[guildId]` → log & return → else fetch `GET /api/player/{g}` through `GlobalRetryLimiter.executeWithLimit` → map `serverData.queue[]` (`t.info.identifier/title/author/length`) to `QueueSong` with index ids → if local `revision` changed during fetch → abort & re-trigger in 500 ms → `compareQueues`: length check, then **checksum** = 32-bit string hash (`(h<<5)-h+c`) of `title:duration` joined by `|` (hex) → mismatch → `reconcile`: computes (unused) pending songs `status==='pending' && now-pendingSince<10000`, then **hard-syncs** local state to server and calls `window.__queueRecheckSync(serverSongs)` → QueueSection replaces its list (`QueueSection.tsx:341-357`).
  - Triggers: `useQueueRecheck` mount → `triggerRecheck(g, 0)`; QueueSection optimistic add → `scheduleRecheck()` (1000 ms).
  - **BUG/no-op:** `updateLocalState` is never called by any UI code (only inside `reconcile`), so `localStates` is always empty → `recheckQueue` always returns at "No local state". Also `/api/player/{g}` returns the *current-track* payload, and the `t.info.*` mapping doesn't match the bot's queue shape. ⇒ the reconciliation never runs. The intended design (revisioned client queue + checksum compare + 10 s pending window + hard sync) is documented here for the rebuild; the rebuild should instead use server revision numbers on `queueUpdate`.
- **`QueueMutex`**: promise-chain mutex keyed by guildId; `acquire(key)` awaits the previous tail, returns `release()`. No timeout; map entries never cleaned; `isLocked` = `locks.has(key)` (always true after first use).
- **`GlobalRetryLimiter`** (singleton): limits `MAX_PER_GUILD = 3` concurrent, `MAX_GLOBAL = 20` concurrent (busy-wait with 100–150 ms jitter), token bucket **50 req/s** (capacity 50, continuous refill, 50 ms wait when empty). No retry logic itself despite the name.
- **Optimistic updates & rollback (as implemented in components):** queue add appended immediately with "new" animation and title tracked in `pendingOptimisticAddsRef`; confirmed when a `queueUpdate` contains it; **no explicit rollback on failure** other than the (non-functional) recheck and the next `queueUpdate` replacing the list. Track-end shows next queued track optimistically; jump-to-track sets `__jumpToTrackInProgress` to suppress the following `trackEnd`; 24/7 toggle guarded 5 s against stale `init`.

#### D.7 Helpers
- `lib/playlist-service.ts` — browser → **bot** `/api/playlists` (POST create `{userId,name,description?,thumbnail?,tracks,sourcePlatform?: 'spotify'|'youtube'|'custom', sourceUrl?}` → `data.playlist`; GET `/api/playlists/{id}` (404 → null); GET `/api/playlists?userId=` (→ `data.playlists`, logs `data.source`); PUT `/api/playlists/{id}`; DELETE; `countUserPlaylists`; `GET /api/playlist-stats` debug). Bot comment: "Dashboard → Bot API → Cache (instant) → Firebase (batched)". Offline/non-JSON → throws 'Bot appears to be offline' (reads return null/[]). **The Next `/api/playlists*` routes are therefore unused duplicates.** Types: `PlaylistTrack {title, artist, duration?, thumbnail?, uri?, album?, addedAt? ISO}`, `Playlist {id, userId, name, description?, thumbnail?, trackCount, tracks, sourcePlatform?, sourceUrl?, createdAt, updatedAt}`.
- `lib/top-charts.ts` — `fetchTopCharts(region='thailand'|'global', limit=10)` → `GET {BOT}/api/top-charts/{region}?limit=` → `{tracks, cached, playlistName}`; offline/error → 4 hard-coded Spotify fallback tracks (APT., Die With A Smile, Whiplash, number one girl) with `playlistName:'Top Hits (Offline)'`. `fetchBillboardChart()` → `GET {BOT}/api/charts/billboard` → `{tracks: BillboardTrack[], lastUpdated, date, chart}` (bot caches, "updates every 3 days"); `BillboardTrack {rank, title, artist, image, thumbnail?, artistImage?, url?, source?, weeksAtNo1?, lastWeek, peakPosition, weeksOnChart, detail:'up'|'down'|'same'}`; `billboardToChartTracks` → `{id:'billboard-{rank}', thumbnail: thumbnail||image, duration:0, url||'', position: parseInt(rank), source}`. `getTopCharts()` deprecated.
- `lib/utils.ts` — `cn()` (clsx + tailwind-merge); `formatDuration(seconds)` → `h:mm:ss`/`m:ss` (**seconds**, unlike most of the app which uses ms); `formatUptime(ms)` → `Xd Xh` / `Xh Xm` / `Xm`.

---


---

## 9. Terminal commands (bot console) and admin terminal

### 9.1 Bot console REPL — `src/handlers/terminalInput.ts` and `terminalCommands.ts`

**Startup.** `events/ready.ts:13-14` runs `new TerminalInput(client).start()` before Lavalink is initialised; part 2 §3.1 gives the full startup order.
- The REPL uses `readline` on stdin.
- When it detects Bun (`globalThis.Bun`), it creates the interface with `terminal: process.stdin.isTTY ?? false` and writes the prompt by hand. Under Node it uses `rl.prompt()`.
- The prompt is `Narze Terminal > `.
- If stdin is unavailable or `createInterface` throws, it logs `[TERMINAL] Terminal input disabled - running in non-interactive mode` and carries on.
- At start it prints a welcome banner box titled "Discord Narze Terminal", followed by the command list and tips.

**Words handled directly by the REPL** (these do not go through the command queue):
- An empty line just shows the prompt again.
- `exit` or `quit` prints "Shutting down terminal..." and closes readline. This stops the terminal only, not the bot.
- `clear` or `cls` runs `console.clear()`, then shows the banner and the prompt.
- On SIGINT (Ctrl+C) inside readline it prints `Received SIGINT. Type "exit" to quit.`. It does not exit.

**Command queue** (`TerminalCommandHandler`):
- Each line is split on single spaces. The first token is lowercased and becomes the command; the remaining tokens are the args.
- The line is pushed onto an in-memory FIFO and logged as `Added command: <cmd> with <n> args`.
- A `setInterval` of **1000 ms** processes **one command per tick**. An `isProcessing` guard stops two commands running at once. Errors are logged as `[TERMINAL ERROR]`.
- All output goes to the console with chalk colours. The admin log stream mirrors that output (part 3 §5.6).

| Command | Args | Behaviour |
|---|---|---|
| `play` | `<query> <guildId\|guildName> <voiceId\|voiceName> [textId\|textName]` | **Arguments.** Fewer than 3 args prints the usage text and tips. Multi-word queries are rebuilt with a heuristic: with more than 4 args, if the 3rd- and 2nd-to-last args are all digits, those two become guild and voice, the last becomes text, and everything before them is the query. With exactly 4 args, if the last two are digits they become guild and voice and the rest is the query.<br>**Resolution.** Guild: exact ID, otherwise the first guild whose name contains the argument (case-insensitive). Voice: ID if the channel's type is 2 (GuildVoice), otherwise a name-contains match. Text: ID or a name-contains match among type 0 (GuildText) channels the bot can `SendMessages` in. If no text channel is given, it auto-selects the first type 0 channel with SendMessages and logs `TERMINAL AUTO`.<br>**Playback.** Loads tracks with `loadTracks(query, guild.members.me)`, so the requester is the bot. It runs `playerCreate(guild, text, voice)`. Volume is set to `lavalink_config.volume_default` when the player's volume is 100 and the `isVolumeChangeCommand` flag is not set. It then sets the player flag **`isTerminalCommand=true`** and calls `connect()` if the player is not playing. A `track` or `search` result adds `tracks[0]`; a `playlist` result adds every track. `play()` is called if the player is neither playing nor paused.<br>**Logging.** Title, author and duration (`convertTime`), or the playlist name, track count and total duration. `no_results` and `error` results log "No tracks found". |
| `stop` | `<guildId>` | `player.destroy()`. Logs "No active player" if none exists. ID only, names are not accepted. |
| `skip` | `<guildId>` | If `queue.current` is set, calls `player.stop()` and logs `Skipped: <title>`. |
| `leave` | `<guildId>` | `player.destroy()`. Behaves the same as `stop`. |
| `status` | `[guildId]` | **No arg:** lists every player with current title, queue size, playing and paused. **With an ID:** also shows volume and position/length. |
| `list`, `guilds` | — | `listGuildsAndChannels(client)` in `handlers/guildUtils.ts`: every guild with its voice and text channels and their IDs. |
| `find guild <name>` | — | Matches guild names with name-contains (`guildUtils.findGuildByName`). |
| `find voice <guildId> <name>` | — | `guildUtils.findVoiceChannelByName`. |
| `find text <guildId> <name>` | — | First text channel whose name contains the argument; also prints `Can send messages: ✅/❌`. |
| `help` | — | Prints the command list, a silent-mode note and examples. |
| anything else | — | `Unknown command: <cmd>` plus `Type "help"`. |

**Silent mode** (`docs/terminal-silent-mode.md`, part 2):
- While `isTerminalCommand` is true, `trackStart` sends **no** now-playing embed. It logs `[TERMINAL TRACK] Now playing: …` to the console instead.
- `trackEnd` and `queueEnd` send no Discord messages and only log to the console.
- `playerDisconnect` logs separately and resets the flag.
- `trackEnd` does **not** reset the flag, so it lasts for the whole player session.
- History and listening sessions are still recorded, because they key off `trackStart`. The requester is the bot member.

### 9.2 Admin "terminal" in the dashboard — `dashboard/app/admin/terminal/page.tsx`

The page is **read-only**: it cannot send commands. Part 7 (A.7) describes the page in detail.
- **Source.** `server.ts:178-226` intercepts three console methods and maps them to levels: `console.log` → `info`, `console.warn` → `warn`, `console.error` → `error`. `console.info` and `console.debug` are not captured.
- **Entry shape.** `{timestamp: Date, level, message}`. Object args go through `JSON.stringify`, so chalk ANSI codes stay in the text.
- **Buffer.** Entries go into an in-memory **ring buffer of 1000 lines** (`MAX_LOGS`).
- **When capture starts.** The interceptor is installed when the API server starts, so earlier startup lines are not captured.
- **Stream.** `GET /api/admin/logs/events` (SSE) sends `data: {type:'history', logs: last 100}` on connect. After that it sends each new entry as a raw `data: {timestamp, level, message}` with no `type` field. The endpoint has no heartbeat and no auth, and sets its own `Access-Control-Allow-Origin: *`.
- **UI.** The page shows the stream with level colouring, a level filter, text search, pause/resume (it buffers lines while paused), an auto-scroll toggle, clear, and download.
- **Persistence.** None. Logs are lost on restart.

### 9.3 Requirements for the rebuild

- Keep an operator console in NestJS (a console module or CLI). It must provide `play`, `stop`, `skip`, `leave`, `status`, `list`, `find`, `help`, `clear`, `exit`, accept names or IDs, auto-select a text channel, and support silent mode.
- Parse quoted arguments properly instead of the digit heuristic (see §10).
- If remote command execution is wanted, give the admin terminal real command input behind **developer-only** server-side auth.
- Add the `reconnect` (Lavalink nodes) command that the docs describe.

---

## 10. Known bugs / quirks / TODOs / security issues: fix these, do NOT preserve them

### 10.0 Cross-cutting, terminal and documentation issues (found by the coordinator)

- **Repository is incomplete.** `.gitignore` `cache/` swallowed `bot/src/functions/cache/*.ts`, so 7 modules are missing and the tree cannot build. Fix: never ignore source directories by name. Ignore only runtime output paths, such as `/bot/cache/`.
- **The bot API has no authentication and fails open.**
  - `api/middleware/auth.ts:16-19` calls `next()` when `user.discordId` is missing.
  - `auth.ts:36-40` calls `next()` when the permission check throws.
  - Identity is whatever the client asserts.
  - ADR 0001 (bot verifies admin via Firebase) is marked Accepted but has no code.
- **A hardcoded Spotify client id and secret** sit in `functions/spotify/spotifyClient.ts:10-11`. Rotate them.
- **Docs disagree with the code.** Treat `project_architecture.md`, `paper.md` and `bot/docs/*` as stale.
  - These do not exist at all:
    - `reconnect` terminal command
    - `LAVALINK_RECONNECT_MODE` / `LAVALINK_RECONNECT_TRIES`
    - MongoDB `SavedQueue`
    - Zustand stores
    - WebSocket server (`docs/websocket-implementation.md`)
    - Google login, despite architecture Flow 16. `useAuth.tsx:154` still contains a `GoogleAuthProvider` path, but the login page exposes Discord only.
    - The "Restart/Shutdown via authenticated middleware" flow. The routes exist but have no auth.
  - These exist under different methods or paths. The documented path is on the left, the live one on the right:
    - `POST /api/search` (paper.md §15) → **`GET /api/search`** (`routes/search.routes.ts:37`)
    - `POST /api/player/play` → **`POST /api/guild/:guildId/play`** (`routes/player.routes.ts:17`)
    - `POST /api/queue/:id/remove/:index` → **`DELETE /api/guild/:guildId/queue/:index`** (`routes/queue.routes.ts:45`)
    - `/api/queue/:id/move|clear` → **`POST /api/guild/:guildId/queue/move|clear`**
    - `GET /api/guild/:id/stream` → **`GET /api/guild/:guildId/events`**
  - `docs/api-documentation.md` lists loop mode `"off"`, but the real values are `none|track|queue`.
- **Terminal `play` argument parsing** (`handlers/terminalCommands.ts:107-138`):
  - The line is split on single spaces with no quote handling, so `play "song name" …` searches for the literal `"song`.
  - With exactly 4 args where text channel IDs are given (`q g v t`, all numeric), the `args.length > 3` branch takes the last two IDs as guild/voice, so the guild ID becomes part of the query.
  - Multi-word queries that use guild/channel *names* are never rebuilt; only all-digit IDs trigger the join.
- **Terminal `stop` and `leave` are identical** (`destroy()`). `stop`, `skip` and `leave` accept IDs only; names are not resolved, unlike `play`.
- **The terminal processes one command per second** from a polling `setInterval`. This adds needless latency; process commands on arrival.
- **`isTerminalCommand` stays set on the player** until disconnect. If a Discord user later runs `/play` on the same player, their tracks also get no now-playing embed.
- **The admin log interceptor** captures only log/warn/error, keeps ANSI colour codes, and misses everything logged before the API server starts.
- **Dead code to delete rather than port:**
  - `lib/sinsacord*`
  - `examples/*`
  - `registerRoutesV2`
  - the shadowed inline routes in `server.ts`
  - `dashboard/hooks/useQueue.ts`, `useCurrentTrack.ts`, `useMultiTabSync.ts`
  - the no-op `QueueRecheckManager` local state
  - the dead Next `/api/playlists*` routes
  - `login/email-login.tsx.example`
  - empty files `youtube/artistImage.ts` and `lavalink/thumbnailOptimizer.ts`

### 10.1 Commands

1. `functions/cache/*` (autocompleteCache, queueCache, userCache) missing from repo (`.gitignore cache/`) → `/cache`, `/247`, all autocomplete, `ready.ts` cannot compile as committed. RECONSTRUCT.
2. **Discord 100-char limit on choice `value`**: text-search values are `title.slice(0,100) + uri` and `music.youtube` values `name + query` → routinely >100 chars → `interaction.respond` rejects (error swallowed) → empty autocomplete for long titles. (`play.ts:98,114`, same in playnext/playat/skipplay.)
3. Selected text-search value `"(Author) Title<uri>"` is not a URL (starts with `(`) → resolved as a *search* string `spsearch:(Author) Titlehttps://…` rather than loading the exact URI. Works by accident.
4. Module-level `let mix = false` per command file shared across all guilds/users; set by autocomplete, consumed by next run anywhere (`play.ts:30,146`, etc.) → cross-user race; also once true in autocomplete, all later playlist autocompletes in that file keep the raw query until a run resets it.
5. `/play` etc. call `loadTracks` before `deferReply` → slow resolves (>3 s) make the interaction expire; playlist path defers only after load.
6. `player.play().catch(reply).then(reply)` → on failure replies twice (second throws) (`play.ts:270-281`, playnext:234, playat:349).
7. loadType `error` → no reply at all (interaction fails) in play/playnext/playat.
8. Duplicate unreachable `else if (no_results)` after playlist branch (play.ts:381, playnext:382, playat:476).
9. play: overwrites `track.info.uri` with user's query URL when different (play.ts:250) — e.g. Spotify URL kept as uri.
10. playat: failure message on play() is `ตำแหน่งไม่ถูกต้อง`; playlist range text `a ถึง a+n` off-by-one (playat.ts:470); no SSE broadcast in playat/playqueue/skipplay/loop/pause/seek/volume/skip (dashboard queue may go stale except via events).
11. play `/play` "already playing" check uses position `queue.size` as ลำดับ (correct), but `play()` path when paused-with-empty-queue? fine. `queue.size` vs `[...player.queue]` mixed.
12. `clear`/`247`/`leave`/`skip`/`volume` use `manager.get` (throws) → "no player" branches inside try/catch; `clear`'s `!player` check dead; `clear` error text for no player is `เกิดข้อผิดพลาดในการเข้าถึง player` instead of `ไม่มีบอทในห้อง`.
13. Same-channel checks inconsistent: some compare to `player.voiceChannel`, others to `guild.members.me.voice.channelId` (only if bot currently in a VC).
14. `skip`, `seek`, `volume` require `player.playing` → fail while paused. `skip` empty-queue reply uses fail color with footer mentioning auto-queue (`เพิ่มคิวอัตโนมัติ`) though no autoplay exists in command. `isSkip` set after `stop()`.
15. `join` move = destroy+recreate (queue lost); no same-channel guard (anyone can pull the bot).
16. `/cache clear` has no permission gate.
17. `setchannel`: `setMusicChannel` returning false not checked → success embed on DB failure; uses deprecated `ephemeral: true`; musicChannelId not enforced on commands.
18. interactionCreate: `logGuild.channels` with undefined `logGuild` (missing env / bot not in log guild) throws inside the listener after every command (unhandled rejection); error handler `interaction.reply` without replied/deferred check → throws if command already replied/deferred; promo message is sent for commands that only replied ephemerally too (e.g. errors).
19. Promo list omits playnext/playat/skipplay/playqueue/join.
20. `LoadCommands` is async and not awaited; registration happens on clientReady — theoretically racy.
21. `seek` regex: MM:SS with minutes ≥60 rejected; fallback regex unreachable.
22. `convertHmsToMs` references undefined `a` (convertTime.js:57); `convertTime` hours wrap at 24.
23. `client.interactions.set('play', …)` single global key, never read (dead + overwrites across guilds).
24. Autocomplete for URLs from non-YouTube/Spotify sources (SoundCloud, Twitch) that resolve to single track → empty choice list (user must submit raw text).
25. Cache key not normalized (case/whitespace); doc claims URLs not cached but they are; play/playnext skip caching if first value merely contains substring "error".
26. `default_image` config unused; `config-guide.md` outdated; `SKIPPLAY_README.md` response format (`⏭️ Skip Play Playlist:`) no longer matches code.
27. `Prefix` Prisma model + `messageCommands` collection + MessageContent intent unused (dead legacy).
28. sinsacord vendored lib unused by commands; actual dependency riffy (not installed in checked-out node_modules).

---


### 10.2 Events, lifecycle, sessions


1. `.gitignore` `cache/` excluded `bot/src/functions/cache/**` source — repo unbuildable; queue cache, user cache, history cache write paths lost.
2. `src/events/lavalink/playerMove.ts:18` compares `value.guild?.id === player.guild` (Riffy uses `guildId`) → never matches; L25-26 swap old/new and pass `player` as a channel id. Log-only, broken.
3. `src/events/lavalink/trackStart.ts:22-48` re-resolve happens after playback already started → doesn't actually fix expired audio, just mutates metadata; also `trackStart.ts:198` uses `track.requester` (top-level) while elsewhere `track.info.requester`.
4. `trackStart.ts:246` / `interactionCreate.ts:38,65` — `send` without catch on missing perms → unhandled rejections.
5. `interactionCreate.ts:47-48` crashes if `LOG_GUILD_ID` guild not cached; `:42` error reply fails if interaction already replied/deferred.
6. `playerCreate.ts:7`, `trackEnd.ts:36` dereference `guild` without null check.
7. `queueEnd.ts:34` destroys immediately with 0 grace period; listening session ends only via `playerDisconnect` — if Riffy's destroy doesn't emit playerDisconnect, the session stays "active" (and appears in admin active users) until restart.
8. `ListeningSessionManager.ts:670` deletes pending before `batch.commit()`; on commit failure the data is gone from memory **and** the next `saveSessionsToJson` drops it from disk; `:380-385` unlinks `sessions.json` after restore flush even if the commit failed (errors are caught inside, `.then` always runs).
9. `ListeningSessionManager.ts:606` graceful-shutdown registration skipped if any SIGTERM listener already exists (API server's `process.once('SIGTERM')` at `server.ts:126` likely registers first) → session flush on shutdown likely never registered. No `process.exit` anywhere in these handlers.
10. `saveSessionsToJson` + `saveReadCacheToJson` = 2 synchronous pretty-printed file writes **per trackStart** (blocks event loop at scale).
11. Session tracks: no dedup, requesterId dropped (`:449-458`); participants never get leave time / duration; participants only sampled at track start; `endTime` of crash-restored sessions = restart time.
12. Firestore batch has no 500-op chunking (`:637`).
13. `playHistory.ts:65` trackId = title+author base64 (collisions across sources; long titles → long doc ids, Firestore 1500-byte limit). `:104-108` uniqueTracksCount +1 even for repeats. Header comment path vs reader path mismatch for serverHistory (`:8` vs `:204-208`).
14. `voiceStateEvents.ts:47` debounce drops (not trailing) → dashboard voice list can miss the final state; stage channels excluded; mute/deafen ignored.
15. `ready.ts:72-96` presence numbers computed once; `ready.ts:49-64` sequential DB call per guild at startup; `ready.ts:98` global command registration every boot.
16. `guildEvents.ts:36` re-invite overwrites `ownerId` with new inviter.
17. `guildSettings.ts:5` creates a second PrismaClient instead of `functions/prisma.ts` singleton.
18. Loop flags `currentLoop/queueLoop/offLoop` are a manual mirror of `player.loop` set only by `/loop` command (`loop.ts`); API loop routes (`queue.routes.ts:185-192`) call `setLoop` without updating flags → trackStart embed suppression on track-loop doesn't apply for dashboard-set loops (and stale `currentLoop=true` can suppress embeds after loop is turned off from the dashboard).
19. `manager.ts:43-56` existing player returned with old text/voice channel even if caller is in another channel.
20. `client.interactions.set('play', ...)` (`play.ts:222`) single global key — leaks last interaction, cross-guild; only consumer is the broken playerMove.
21. Event files without `listenerCount` guard double-register under hot reload (`events.ts` deletes require cache).
22. `sinsacord` vendored but unused; `riffy` used instead — don't port sinsacord, port behavior.


### 10.3 Bot HTTP API / SSE

1. **No auth on entire API**; identity is body/query self-assertion; control middleware fail-open when `user` missing or on error (middleware/auth.ts:16-19, 36-40). Anyone reaching port 3001 can control any guild's player.
2. **Unauthenticated restart/shutdown** → remote DoS (admin.routes.ts:45-64).
3. **Unauthenticated Discord message reader** for any channel the bot can see (server.ts:1269).
4. `/api/admin/stats` leaks host IPs (server.ts:292-303).
5. `/api/guilds` live version (admin.routes.ts:26) shadows the permission-aware inline one (server.ts:1915) — likely unintended regression; lists all guilds to anyone.
6. `/api/user/:userId/sessions` live version (history.routes.ts:59) returns sessions the user did not participate in (privacy); inline participant filter is dead (server.ts:3216-3223).
7. Session SSE filter bypass: omit `?userId` on `/events` to receive all sessionUpdate/sessionEnd (sse.ts:113).
8. Playlist PUT/DELETE have no ownership check & PUT allows mass assignment (playlist.routes.ts:171-197).
9. POST settings with no `user` skips the owner check (guild.routes.ts:67-76).
10. POST join has no permission check and uses the voice channel as textChannel (guild.routes.ts:216-219); may double-connect (createConnection already connects, then `connect()` at :225/:229).
11. player.routes `/play`: anyone may pass `targetVoiceChannelId` (no owner gate, cf. dead queue.routes logic) and default volume is `defaultVolume` from client (no 15% default) (player.routes.ts:34-37, 115-117).
12. `/previous` never goes to a previous track (player.routes.ts:379-380).
13. `loop` changes not broadcast (queue.routes.ts:163-201).
14. Duplicate handlers: server.ts queue/clear×2, move×2, shuffle×2 + router copies; `/status` ×2 in admin.routes.ts:14/163; POST play ×2 (player/queue routers); all inline routes listed in §4 are dead.
15. Duplicate CPU sampler intervals (server.ts:89, helpers.ts:85); YouTube search cache init twice (server.ts:110, 3256).
16. `init` SSE requester avatar/name not using toRequesterInfo (server.ts:2986-2987, 3001-3002) → dashboard-requested tracks lose requester info on initial load.
17. Dead SSE clients never pruned on write error for guild/user/admin-log streams (only on `close`) (sse.ts:126-128, server.ts:205-211).
18. Presence map not ref-counted per tab (server.ts:426, 449).
19. `/api/user/:userId/events` does `members.fetch` per guild per connect — rate-limit risk with many guilds (server.ts:3076).
20. `guildQueueStates` never cleaned (sse.ts:29).
21. `[API DEBUG]` dumps of full track objects in /playlist/fetch (server.ts:1523-1633) — noisy, goes to admin log stream.
22. `/charts/billboard?refresh=true` unauthenticated upstream refresh (charts.routes.ts:20-22).
23. canUser* use `members.cache` only — uncached members are "Not a member" until cached (guildSettings.ts:88,120); requires GuildMembers intent/caching.
24. Search `spotify-api` response `query` field is the cache key, not the user query (search.routes.ts:174).
25. Docs stale: websocket-implementation.md (no ws server), api-documentation.md loop `"off"`.
26. Express 5 + no error middleware → thrown errors outside try blocks yield default HTML 500.
27. `server.ts:1911` comment claims play moved to queue.routes but player.routes wins.

---


### 10.4 Music resolution & caches


1. **`bot/.gitignore` `cache/` rule** excluded `bot/src/functions/cache/` (7 modules). The repo cannot build. The rebuild must use a gitignore pattern anchored to the runtime directory (`/cache/`).
2. **Hardcoded Spotify client id/secret:** `bot/src/functions/spotify/spotifyClient.ts:10-11` (REDACTED). Rotate them.
3. Two Spotify auth paths: spotifyClient (hardcoded, cached token) vs `spotify/index.ts:31-82` (reads lavalink yml, **no token cache**, new token on every call).
4. `search.routes.ts:46-61` + `manager.ts:21`: the prefixed query may become `spsearch:ytsearch:…` (verify against the Riffy source). The comment about raw-vs-spsearch is unexplained.
5. `search.routes.ts:174`: `spotify-api` responses return `query: "spotify-api:<q>"`, not the user's query.
6. `search.routes.ts:390-411` + `spotifyClient.ts:422-433`: on an album-cache hit, track `artistId` is null and only one artist is listed.
7. `search.routes.ts:217-247` vs `:301-319`: the artist response differs between cache hit and miss (`album_type`, `album.id`).
8. `search.routes.ts:345`: YouTube channel "top tracks" are a text search for `<name> official`, not the channel's uploads. `youtubeChannelCache` is unused (§10.5).
9. `searchService.ts:21-24`: `getArtistInfo`, `getMissingArtistIds`, `getAlbumInfo` and `getMissingTrackIds` are imported but unused (dead read paths).
10. `spotifyArtistCache.ts:206-214, 259-268` and `spotifyAlbumCache.ts:192-205`: setters don't schedule a save, so data is lost on crash. `AUTO_SAVE_INTERVAL` is unused (`spotifyArtistCache.ts:18`, `spotifyAlbumCache.ts:13`).
11. `server.ts:1554`: `initSpotifyAlbumCache()` is called on every Spotify playlist fetch (reload clobber).
12. `server.ts:110` and `:3256`: `initYouTubeSearchCache()` is called twice.
13. `server.ts:808-817`: per-track `isYouTubeMusicContent` in `Promise.all` (N API calls and N sync file writes). `batchCheckMusicContent` exists but is unused. Its comment says a "24 hours" cache, but the TTL is 7 days.
14. `categoryCheck.ts:231-237` (batch) vs `:117-128` (single): the batch check's topic list is shorter than the single check's.
15. `categoryCheck.ts:6` uses `process.cwd()`, while the other caches use `__dirname/../../../cache`. The admin stats also uses cwd.
16. `youtube/index.ts:63-77` + `playlistThumbnailWebScraping.ts:83-86`: the scrape fallback returns a bogus `vi_webp/{playlistId}/maxresdefault.webp`, which makes the later fallbacks unreachable. `playlistThumbnailSimple.ts:15-27` uses the same bogus pattern.
17. `playlistThumbnail.ts:73-75`: `getPlaylistThumbnailFromAPI` has the literal `key=YOUR_API_KEY` and never calls the API (dead). `youtube/index.ts:85,97`: the maxres upgrade is not validated.
18. `thumbnailValidator.ts:17-21`: images without `content-length` are rejected (e.g. chunked CDNs), which drops valid artwork.
19. Empty files: `youtube/artistImage.ts`, `lavalink/thumbnailOptimizer.ts`, `docs/youtube-artist-image.md`. The README and releasenote advertise "YouTube Artist Image".
20. `play.ts:98,114` (and copies in playnext/playat/skipplay): the autocomplete value can exceed 100 chars, and `respond` failures are swallowed. The selected value is re-searched as text.
21. `play.ts:30,82,146-148`: module-global `mix` flag, a cross-guild race.
22. `commands/cache.ts`: no permission gate on `clear`.
23. `charts.routes.ts:18-23`: an unauthenticated `refresh=true` triggers a paid RapidAPI fetch. The RapidAPI URL contains `SUSPENDED`.
24. `dashboard/lib/top-charts.ts:83`: `/api/top-charts/:region` does not exist in the bot, so the dashboard always gets the fallback list.
25. `dashboard/app/api/player/[guildId]/search/route.ts:3` uses `NEXT_PUBLIC_BOT_API_URL` while the other proxies use `BOT_API_URL`, and it has no timeout.
26. `application_example.yml` is stale versus the test: it lists the ANDROID client and declares `lavalink.plugins` (crash risk), and has a dunctebot block with no jar. LavaSearch is installed but unused.
27. Dead code duplicates in `server.ts`: the inline `/api/charts/billboard*` handlers (`:2868-2935`) are shadowed by the modular router.
28. `spotifyClient.ts:120-128`: `getPlaylist` pagination starts at a hard-coded offset 100. `getAlbumTracks` ignores albums with more than 50 tracks (no paging of `album.tracks.next`).
29. No Spotify 429/Retry-After or YouTube quota-exceeded handling anywhere. `searchSpotify` has no `market` while the others use TH.
30. Mock-data fallbacks in spotifyClient (`:29-31` throw, `:268-280`, and every API fn) can leak "Imagine Dragons (Mock)" into production UI if credentials are invalid.
31. The `bot/package.json` start script `bun bun run …` looks wrong. `youtube-sr`, `ytdl-core` and `fs` are unused dependencies.

---


### 10.5 Dashboard user pages

1. `app/dashboard/layout.tsx:212-219` — Sign Out does not sign out (only `router.push('/login')`; comment "ยังทำไม่เสร็จ"). User remains authenticated.
2. `app/dashboard/settings/page.tsx:157` — `GET /api/guilds` without `userId` → lists all bot guilds to any user. Polling effect depends on `selectedGuildId` (interval recreated).
3. `components/GuildSettingsSection.tsx:56-58,91-94` — `isOwner` only ever set to true; never reset when switching guilds.
4. `lib/playlist-service.ts` (all) — playlist CRUD with no auth; any client can read/update/delete any playlist id; `userId` trusted from client. Playlist detail page has no ownership check.
5. `app/dashboard/library/import/page.tsx:155-158` — TODO: "View Playlist" goes to library, not the new playlist. `:466` renders stray "0" (`stillSyncing && …`). `:489` "Copy Link" has no handler. `:317` next/image with possibly empty `src`. Still-syncing feature not implemented.
6. `components/NowPlayingSection.tsx:1384-1423` — 24/7 XHR: no revert on error/timeout; XHR used as workaround for browser connection-per-host exhaustion caused by many SSE streams (also `history/page.tsx:303-359` opens one EventSource per guild).
7. `components/NowPlayingSection.tsx:706` calls `window.__queueClearSuppressFlag` which is never defined → suppress-next-skip flag can linger.
8. `components/QueueSection.tsx:342-353` — recheck hard-sync drops thumbnail/requester fields. Queue IDs are positional indexes; `remove` sends index-based trackId (race-prone with concurrent edits). `:772-774` stale-closure useCallback deps. `:902-941` move has no rollback. DropIndicator label off-by-one when dragging down (`:120`).
9. `components/QueueSection.tsx:359-395` `__queueOptimisticAdd` and `app/dashboard/page.tsx:708-710` `onOptimisticAdd` — dead.
10. `components/NowPlayingSection.tsx:31-48` `getTrackSourceInfo` dead; `loadingRecommendation`, `historyInitialized`, `canView` unused; historyError never non-null so Refresh never shows; heavy console.log per SSE event.
11. `components/NowPlayingSection.tsx:374-376` — `onMouseLeave` on volume slider triggers a volume POST even without dragging.
12. `app/dashboard/history/session/[sessionId]/page.tsx:331-339` — fetches 50 latest guild sessions and filters client-side; older sessions show "Session not found". `formatTime` unused, `checkingPlayer` unused, `'all'` play branch unreachable. Uses `alert()`.
13. `app/dashboard/history/page.tsx:287` stale `sessions.length` in error branch; `useSSE` import unused.
14. Duplicate dominant-colour extraction code in layout and NowPlayingSection (both write `--bg-dominant-color`).
15. Guild-selection state split between `sessionStorage` (home/layout) and `localStorage` (search/library/history pages).
16. "Select Server" + play flow copy-pasted 6× (search, album, artist, channel, session, playlist).
17. `app/dashboard/search/artist/[id]/page.tsx:349-357` & channel page `:330-350` — Shuffle/More buttons without handlers; `:429` fake play counts (`popularity*100000`); `:314` "Verified Artist" if followers ≥ 10k (fabricated). Albums use `<a>` not `Link` (full reload).
18. `app/dashboard/search/album/[id]/page.tsx:212` — Play album assumes a Spotify album id (`open.spotify.com/album/{id}`).
19. `app/dashboard/library/page.tsx:228-234` — `sourcePlatform: 'custom'` shown as "YouTube". Songs/Artists/Albums tabs are permanent placeholders.
20. `app/dashboard/library/playlist/[id]/page.tsx:425-436` — "play all" without sourceUrl fires N sequential play requests.
21. `app/login/page.tsx:49-59`, `app/login/callback/page.tsx:23,34,49` — postMessage with `'*'` target and no origin check. Terms/Privacy links are `#`.
22. `README.md` project structure & Firestore rules are stale vs. actual (playlists/sessions go through bot API).
23. Hard-coded external link "Xeno Developer" → `https://resume-web-steel.vercel.app/` (`app/dashboard/page.tsx:667`).
24. Many `next/image` usages with remote hosts → any host not in `next.config.js` breaks rendering.
25. No Escape handling on any modal; no focus trap; icon-only buttons often lack aria-labels.


### 10.6 Dashboard admin, API routes, auth, sync


##### X.1 Security (fix in rebuild — do NOT preserve)
1. `app/api/admin/whitelist/route.ts:51-111` — POST/PATCH/DELETE whitelist **with no authentication**: anyone can make themselves `developer`. GET leaks the admin list.
2. `app/api/admin/users/route.ts` — unauthenticated dump of up to N users (ids, usernames, avatars, activity).
3. `app/api/user/me/route.ts:20` — returns the whole user doc incl. Discord `accessToken`, `refreshToken`, `email` to the browser.
4. `app/api/auth/discord/callback/route.ts:72` — Firebase custom token in a URL query string (`/login/callback?token=`); OAuth `state` parameter ignored (`:14`), none generated in `lib/discord-auth.ts:41-46` → login CSRF possible.
5. `app/login/callback/page.tsx:23,34,49` — `postMessage(..., '*')`; `app/login/page.tsx:49-58` handler does not check `event.origin`.
6. All admin pages call bot `/api/admin/*` and admin SSE streams (logs, presence, user cache) **without credentials** (`app/admin/**`); bot logs and every guild's Discord messages (`/api/admin/guild/{g}/messages/{c}`) are readable by anyone who can reach the bot URL — the bot guards these routes with nothing but open `cors()` (`bot/src/api/server.ts:129`, routes at `:228-1269`).
7. `bot/src/api/middleware/auth.ts:16-19` — control permission check **skipped when `user.discordId` is absent**; `:36-40` fail-open on error; identity comes from request body (spoofable). Every Next proxy route forwards a client-chosen `user`.
8. `app/api/playlists/[id]/route.ts` — GET/PUT/DELETE without ownership check (and the bot's `/api/playlists` used by `lib/playlist-service.ts` likewise takes `userId` from the client).
9. `hooks/useUserSSE.ts:46` / `hooks/useSSE.ts:103` — SSE streams keyed only by discordId / guildId, no auth.
10. Discord refresh tokens stored in Firestore but never used or rotated; sign-out doesn't revoke.
11. `lib/firebase.ts:15-24` — logs config presence on every client load (harmless but noisy); many routes log full request/response bodies (`queue/[guildId]/route.ts:22,37`).

##### X.2 Functional bugs / quirks
1. `app/admin/terminal/page.tsx:57` — `paused` captured in a `[]`-deps effect → pause never buffers; "N buffered" badge reads a ref, never re-renders.
2. `components/admin/AdminSidebar.tsx:36` — `/admin/settings` link (dev-only) has no page → 404.
3. `app/admin/layout.tsx:62` — `ml-64` fixed while sidebar can collapse to `w-16` → gap.
4. `app/admin/users/[id]/page.tsx:84` — client Firestore read of another user's doc conflicts with documented rules (`users` read only by self) → silently falls back to bot cache; `playCount` overwritten with "history length" (unique tracks, not plays) `:143`.
5. `app/admin/guild/[guildId]/page.tsx:454-499` — five fetches done sequentially (slow); fetched `banner/description/features/createdAt/ownerId` unused; no message pagination; `formatDuration` unused.
6. `app/admin/session/[sessionId]/page.tsx:170` — `sessionDuration` computed but unused.
7. `app/api/queue/[guildId]/route.ts:111-122` — DELETE handler reads non-existent `trackId` param → `/queue/undefined`.
8. `app/api/player/[guildId]/route.ts:66-77` & `app/api/queue/[guildId]/route.ts:54-105` — errors returned with HTTP 200.
9. Mixed `BOT_API_URL` vs `NEXT_PUBLIC_BOT_API_URL` (see B.0); `BOT_API_URL` missing from `.env.example`.
10. `app/api/guild/[guildId]/voice-channels/route.ts:25`, `player/[guildId]/search/route.ts:19`, `join/route.ts:33`, `guilds/user-permissions/route.ts:27`, `status/route.ts:24` — `response.json()` without content-type check → HTML (bot offline via tunnel) throws → 500.
11. `app/api/admin/whitelist/route.ts:3` — unused `next-auth` import (`getServerSession`) — next-auth isn't the auth system.
12. `hooks/useUserSSE.ts:73-74` + `:153-156` — reconnect counter reset in `connect()` → infinite 1 s reconnect loop.
13. `hooks/useSSE.ts:118-125,158-161` — `onConnect/onDisconnect` of the *first* subscriber only are wired to the EventSource; later subscribers never see disconnect/reconnect (their `connected` stays true) → fallback polling in later components never kicks in. `error` state never set. After 5 failed reconnects connection is dropped permanently until remount.
14. `hooks/useControlPermission.ts:24` — each hook instance subscribes to guild SSE (fine, singleton) but also polls can-control every 60 s per instance.
15. `services/QueueRecheckManager.ts:70-74` — `localStates` never populated (no caller of `updateLocalState`) → recheck is a no-op; mapping `t.info.*` (`:87-96`) doesn't match `/api/player` payload; `TODO: Trigger React state update via callback/store` (`:170`) — uses `window.__queueRecheckSync`.
16. `services/QueueMutex.ts:267-274` — locks never cleaned; `isLocked` always true after first acquire.
17. `types/queue.types.ts:75` — comment says checksum is MD5; it's a 32-bit JS hash (`QueueRecheckManager.ts:176-187`).
18. Dead code: `hooks/useQueue.ts`, `hooks/useCurrentTrack.ts`, `hooks/useMultiTabSync.ts`, Next `/api/playlists*`, `/api/admin/users`, `/api/auth/discord/user/guilds`, `/api/player/{g}/status`, `/api/player/{g}/top-played`, `useAuth.signInWithDiscord/signInWithGoogle`, `types/bot.ts` `BotData/BotLog/Stats`.
19. `app/api/player/[guildId]/top-played/route.ts:85-90` reads `playHistory/{guildId}/userHistory/...` (per-guild) while the user-facing history uses `playHistory/global/userHistory/...` — two parallel histories.
20. `FIRESTORE_SCHEMA.md` is out of date: missing `adminWhitelist`, `playlists`, `sessions`, `serverHistory`, `global`; wrong `guildHistory/topTracks` path; describes unused `guilds/favorites/guildConfig`.
21. `bot/src/functions/history/playHistory.ts:15` imports `../cache/historyCache` which is absent from this checkout.
22. `lib/utils.ts:8` `formatDuration` takes **seconds** while app durations are ms — easy unit bug.
23. Avatars built as `.png` only (no animated `a_` → `.gif` handling) in `useAuth.tsx:67-69`, admin users pages.
24. `hooks/useAuth.tsx:42-45` — 3 s timeout may set `loading=false` before auth resolves on slow networks → admin layout momentarily redirects to `/login`.

##### X.3 TODO / FIXME markers found
- `services/QueueRecheckManager.ts:170` `// TODO: Trigger React state update via callback/store`.
- `services/QueueMutex.ts:269-273` comment: cleanup intentionally skipped ("a more complex implementation would use a linked list or queue").
- `app/api/player/user-history/route.ts:33-35` comment: possible future fallback to direct Firebase if bot is down.
- `app/api/album/[id]/route.ts:20-21` comment mentions "mock data" from bot album endpoint.

---


---

## 11. MUST-PRESERVE capabilities (acceptance checklist)

One line per capability. Each line is tagged with its area, and the section given in brackets holds the details. Items are kept per area, so a few overlap across areas on purpose (the same contract seen from the bot side and from the dashboard side).

1. [Commands, §1] Slash-only command set of exactly 18: cache, ping, setchannel, 247, clear, join, leave, loop, pause, play, playat, playnext, playqueue, queue, seek, skip, skipplay, volume — global registration on ready.
2. [Commands, §1] Autocomplete on play/playnext/playat/skipplay: text search top 7 (configurable) as `(author) title`; URL preview with playlist count `(N เพลง) name`; Deezer/Apple Music rejected; 30-min file cache keyed by platform+query; `/cache stats|clear`.
3. [Commands, §1] YouTube `list=` links normalized to `https://music.youtube.com/playlist?list=…`; YouTube track URIs rewritten to `music.youtube.com`; YouTube "Mix - X" playlists renamed `สถานีวิทยุX`.
4. [Commands, §1] Playlist add: total duration, track count, playlist thumbnail (multi-strategy fetch with first-video fallback), per-track playlist metadata.
5. [Commands, §1] Requester (GuildMember) attached to every resolved track.
6. [Commands, §1] Default volume 15 applied on new player unless user changed volume via /volume; /volume 1–1000, no arg shows current.
7. [Commands, §1] /playnext inserts at queue front; /playat inserts at chosen 1-based position with position autocomplete (`ถัดจากเพลงปัจจุบัน`, `ท้ายคิว`, `ลำดับที่ i`); /skipplay plays immediately keeping queue; /playqueue jumps to a queued song keeping others.
8. [Commands, §1] /queue: now-playing + 10-per-page paginated queue with prev/page/next buttons, invoker-only, 5-min collector, total queue time.
9. [Commands, §1] /loop off|current|queue with toggle semantics; /pause toggles; /seek accepts `ss`, `m:ss`, `h:mm:ss` bounded by track length.
10. [Commands, §1] /skip on empty queue leaves VC unless 24/7; /247 toggle persisted to queue cache.
11. [Commands, §1] /join creates/reconnects/moves (with permission+full-room check: ViewChannel, Connect, Speak, user limit unless ManageChannels).
12. [Commands, §1] /setchannel (ManageGuild) stores GuildSettings.musicChannelId (optional clear); GuildSettings auto-created on ready/guildCreate with ownerId.
13. [Commands, §1] Every command use logged as embed to LOG_GUILD_ID/LOG_CHANNEL_ID + console; 30% dashboard promo after music commands.
14. [Commands, §1] Thai UI strings, `#e4854a` success / `#FF0000` failure embeds, errors ephemeral, successes public; "Go to Page"/"Go to Playlist"/"Go to Current Song" author links with icon per icon_config (bot avatar/user avatar/playlist thumb/Spotify artist image).
15. [Commands, §1] Player flags (isFirstFromCommand, dontShow, isSkipplay, isSkip, loop flags) suppress duplicate now-playing embeds from trackStart.
16. [Commands, §1] SSE `queueUpdate` broadcast + queue revision increment on play/playnext/clear for the dashboard.
17. [Commands, §1] No prefix commands, no cooldowns, DMs ignored.
18. [Lifecycle, §2] Bot joins voice **self-deafened** (`deaf:true, mute:false`); 1 s post-create connect retry.
19. [Lifecycle, §2] Default volume on first `/play` = config `volume_default` (15) unless volume was explicitly changed.
20. [Lifecycle, §2] `raw` gateway packets → Lavalink voice state update (required for voice to work).
21. [Lifecycle, §2] Startup order: terminal REPL → Lavalink init → queue-cache load → session restore (+flush crashed sessions as ended) → user cache → (5 s) queue restore → GuildSettings backfill for every guild → presence rotation every 15 s (Custom status, `idle`) → global slash-command registration; API/SSE server starts on ready.
22. [Lifecycle, §2] guildCreate: bot owner = audit-log BotAdd executor, fallback guild owner; Thai welcome message to system channel; guildDelete keeps settings.
23. [Lifecycle, §2] Now-playing embed: color `#e4854a`, author "Go to Page" (platform icon, link to track or playlist), description `` `▶️`┃**title** ` mm:ss ` `` + playlist line + `> Requested by <@id>`, thumbnail validated; sent to the **player's text channel** (never "last interaction" channel); one message per track, never edited/deleted.
24. [Lifecycle, §2] Suppress now-playing for: first track of `/play` with empty queue, `/skipplay`, `/playnext`/`/playat` immediate play (`dontShow`), track-loop repeats (unless `/skip`), terminal-initiated playback.
25. [Lifecycle, §2] trackEnd resets one-shot flags `isFirstFromCommand, isSkipplay, isSkip, dontShow`.
26. [Lifecycle, §2] Tracks older than 4 h are re-resolved on start (`addedAt` stamp).
27. [Lifecycle, §2] queueEnd: clear queue backup; 24/7 off → leave immediately; 24/7 on → stay as Idle Player with current=null, playing=false, paused=false; SSE `queueEnd {twentyFourSeven}`.
28. [Lifecycle, §2] socketClosed: SSE `voiceDisconnect {code, reason, byRemote, recovering}`; skip if player DESTROYING/DISCONNECTED; recover if code ∈ {4006, 4009, 4014, 4015} **or** `byRemote`: wait 1000 ms → `connect()` → wait 500 ms → if was playing: `seek(prevPosition)` (if >0), unpause, SSE `voiceReconnected {resumed:true, position, track}`; if was paused: SSE `voiceReconnected {resumed:false,...}`; on exception SSE `voiceReconnectFailed {error}`. Other codes: no reconnect.
29. [Lifecycle, §2] voiceStateUpdate → SSE `voiceChannelsUpdate` (1 s debounce/guild), `permissionUpdate` on join/leave of bot's channel, `permissionBatchUpdate` on bot move, `Can Play` to old-channel users when bot leaves; plus user-SSE `userPermissionUpdate`.
30. [Lifecycle, §2] Control permission order: server owner → bot owner (GuildSettings.ownerId) → no player & in voice → same channel as bot (exact reason strings above).
31. [Lifecycle, §2] Listening session: one active per guild, id `${guildId}-${ms}`, starts on first trackStart, appends every started track, participants = non-bot members present at each track start + remote requesters (dedup by userId, first-seen `joinedAt`), ends when bot's voice disconnects; Firestore `playHistory/{guildId}/sessions/{sessionId}` with fields `sessionId, guildId, guildName, channelId, startTime, endTime|null, isActive, trackCount, participantCount, tracks[], participants[], lastUpdated(serverTimestamp)`; write-behind flush ≤5 min after first change; crash-safe local backup; on restart, previously-active sessions are closed with endTime=restart and flushed.
32. [Lifecycle, §2] SSE `sessionUpdate`/`sessionEnd` only delivered to participants; admin `activeUsers` stream on every session change.
33. [Lifecycle, §2] Play history per requester on every trackStart (requester required): per-guild-user, global-user, server-wide aggregates keyed by title+author with `playCount`, `lastPlayedAt`, `source`, `isMusic` (YouTube category check), `isVideo`.
34. [Lifecycle, §2] `/dashboard` promo embed after lavalink commands with 30% chance; every command audited to LOG channel embed.
35. [Lifecycle, §2] 24/7 flag persisted with the queue backup so it survives restarts.
36. [API/SSE, §3] Port 3001 default; single origin of truth for player state is the bot process; dashboard talks HTTP + SSE.
37. [API/SSE, §3] SSE envelope `{type, guildId|userId, data, timestamp}`; `queueUpdate` carries `sequence` (per-message) + `revision` (per-mutation) for client-side ordering/dedup ("recheck system"). (Preserve this server contract. The v5 client never actually consumed `revision`, because QueueRecheckManager is a no-op; see §8.)
38. [API/SSE, §3] Every queue mutation: mutate → `incrementQueueRevision` → broadcast `queueUpdate {queue}`; trackStart also emits a queueUpdate.
39. [API/SSE, §3] `playnow`: emit `jumpToTrack` first, mutate, then queueUpdate after 600 ms (frontend animation contract).
40. [API/SSE, §3] Initial `init` snapshot on guild stream connect; `userInit` on user stream connect; 30 s heartbeats.
41. [API/SSE, §3] Guild events auto-derive `guildUpdate {guildId, queueLength, isPlaying, hasPlayer}` for user streams (server-list live badges), incl. 24/7 keeping `hasPlayer` true after queueEnd.
42. [API/SSE, §3] Session events delivered only to session participants.
43. [API/SSE, §3] Permission ladder: server owner > settings.ownerId ("bot owner") > (no player: in any VC) > (player: same VC as bot); reasons strings shown in UI.
44. [API/SSE, §3] `can-control` returns `{canView, canControl, reason}`; play failure returns `requiresVoiceChannel` / `canSelectChannel` flags so UI can show a channel picker.
45. [API/SSE, §3] Play: musicChannelId as notification text channel with fallbacks; Spotify-URL failure → oEmbed title → text search fallback; connect only if not connected; 300 ms post-play unpause guard.
46. [API/SSE, §3] Move semantics: `to` may equal length (append); drop-before-target index adjust.
47. [API/SSE, §3] Loop cycle none→track→queue→none when mode omitted; 24/7 toggle when `enabled` not boolean.
48. [API/SSE, §3] Search: YouTube music-vs-video classification via YouTube Data API categoryId=10 (24h cache) → `isVideo/isAudioOnly/isMusicContent` + sddefault vs mqdefault thumbnails; playlist detection with playlist thumbnail resolution.
49. [API/SSE, §3] Multi-source search (`spotify` raw Lavalink + multiCategorySearch, `youtube`/`ytmusic` + channel artists, `spotify-api` Web API with cache), artist/channel/album detail pages.
50. [API/SSE, §3] Playlist import preview `/api/playlist/fetch` with Spotify album/addedAt enrichment; user playlists CRUD with cache-first + write-behind persistence.
51. [API/SSE, §3] Admin: stats (cpu/mem/ping/uptime/guilds/users/activePlayers/cache table), live log tail (last 100 + stream, 1000 ring buffer), active listeners, dashboard presence, cached users, guild info/text channels/message viewer (attachments, embeds, mentions, replies, threads, reactions), per-user sessions/history, session lookup, restart/shutdown.
52. [API/SSE, §3] Presence: dashboard opens `/api/presence/connect`, closing updates user lastActive.
53. [API/SSE, §3] Charts: Billboard chart (limit/offset/refresh) + recommendations, refreshed every 3 days.
54. [API/SSE, §3] Rebuild MUST add: real auth (verify Discord session → server-side identity), admin role gating, ownership checks on playlists, rate limiting, ref-counted presence, participant-filtered sessions.
55. [Music, §4] Free-text default search platform is configurable and defaults to **Spotify (`spsearch`)**. Spotify tracks are mirrored to YouTube via LavaSrc providers **ISRC first, then title query**.
56. [Music, §4] Spotify market/country is **TH** (LavaSrc countryCode, top-tracks, albums, track search).
57. [Music, §4] Dashboard search has four source modes: `spotify` (Lavalink tracks + Spotify artists/albums), `spotify-api` (all Spotify Web API; the UI default), `youtube`, `youtubemusic` (Lavalink tracks + YouTube channels as "artists").
58. [Music, §4] Search response = `{query, source, topResult{type,data,score}, tracks, artists, albums, fromCache}`, with the top-result fuzzy rules: exact match = 1.1, type priority track > artist > album, artist min 0.6, others 0.2, fall back to the first track.
59. [Music, §4] Never cache a spotify-mode search that returned 0 tracks.
60. [Music, §4] Artist page = Spotify artist + top tracks (TH) + albums/singles (limit 20). Album page = album meta + full track list. YouTube channel page = channel info + `ytsearch:<name> official` tracks.
61. [Music, §4] `youtubemusic` channel search appends `" official artist"` to the query. Channel descriptions are cut to 200 chars. Hidden subscriber counts → undefined.
62. [Music, §4] YouTube music-vs-video classification = categoryId 10 OR music topic OR `- Topic` channel OR "provided to youtube by"/"auto-generated by youtube". Music → `sddefault.jpg` (square-ish); video → `mqdefault.jpg`. Spotify and `music.youtube.com` are always music. Flags: `isVideo`, `isAudioOnly`, `isMusicContent`.
63. [Music, §4] YouTube thumbnail upgrade: mqdefault → maxresdefault (if HEAD is ok, `image/*` and >1 KB) → hqdefault → original. A non-YouTube image that fails the check → no thumbnail.
64. [Music, §4] Playlist thumbnail: Spotify playlist image (largest) / YouTube page scrape (og:image, upgraded to maxres) → first track's thumbnail.
65. [Music, §4] YouTube `list=` URLs are normalized to `https://music.youtube.com/playlist?list=…`, except "Mix - " radio playlists, which are labelled `สถานีวิทยุ…`.
66. [Music, §4] Playlist tracks carry `playlistName/Url/Thumbnail/isFromPlaylist/playlistIndex (1-based)/playlistTotalTracks`. Display: `จาก: <name> (i/n)`.
67. [Music, §4] Embed author icon modes `botavatar|userimage|playlist_thumbnail|artistImage`. Artist image = Spotify artist search by track author, falling back to user avatar → bot avatar → Discord default avatar.
68. [Music, §4] `author_url_config.use_playlist_url` toggles whether the author link goes to the playlist or the track.
69. [Music, §4] Autocomplete: default platform, up to **7** results, label `(<author>) <title>` cut to 100 chars, playlist URL → one choice `(<n> เพลง) <name>`, Deezer/Apple Music URLs rejected with "ไม่รองรับ Platform นี้", 30-min cache keyed by platform+query (≤1000 entries), `/cache stats|clear` (ephemeral).
70. [Music, §4] Spotify URL that fails to resolve → oEmbed title → text search fallback.
71. [Music, §4] `/api/playlist/fetch` returns `{platform, playlist{name,thumbnail,trackCount,owner}, tracks[{title,artist,duration,thumbnail,uri,album,addedAt}]}`, with album and added-at data from the Spotify API for Spotify playlists.
72. [Music, §4] Billboard chart (RapidAPI), cached and refreshed every 3 days, with Spotify enrichment (thumbnail, artistImage, url). Endpoints `/api/charts/billboard` (limit/offset/refresh) and `/recommendations`. The dashboard top-charts section falls back to a hardcoded list. (The RapidAPI provider URL contains SUSPENDED, so it may be dead. Verify the data source before rebuilding.)
73. [Music, §4] Cache TTLs to carry into Redis: Spotify artist info/detail 7 d; Spotify album detail + track→album 7 d; YouTube channel search 30 min; YouTube channel detail 1 h; YouTube category 7 d; autocomplete 30 min; Billboard 3 d; Spotify token expires_in − 5 min.
74. [Music, §4] Admin stats endpoint lists every cache with size and item count. Graceful shutdown flushes the caches.
75. [Dashboard, §7/§8] Discord-only login via **popup** OAuth with postMessage success/error handshake and non-popup fallback redirect.
76. [Dashboard, §7/§8] Dashboard shell: sidebar (brand, user card with role label, Home/History/Library/Settings, Admin Panel link for admin/developer with role badge), Prism background toggle persisted, dominant-colour background when Prism off, global header search (1 s debounce, Enter immediate).
77. [Dashboard, §7/§8] **Presence**: every logged-in dashboard tab holds an SSE presence connection (discordId, username, avatar).
78. [Dashboard, §7/§8] Guild picker shows only guilds the user shares with the bot, with playing indicator; auto-selects first; selection shared across pages.
79. [Dashboard, §7/§8] Server list with per-user permission badges (Owner / In Voice / Can Play / View Only), playing status, queue length, member count.
80. [Dashboard, §7/§8] Bot info card: online/offline, total servers, active players, uptime (minute granularity); BotStatusBadge 6 states.
81. [Dashboard, §7/§8] Now playing: album art with flip animation and requester badge, title/artist, interpolated progress with anti-jitter stall and click-to-seek, prev/play-pause/skip with optimistic updates and revert, debounced volume (300 ms, drag-safe), 24/7 toggle with 5 s anti-overwrite window.
82. [Dashboard, §7/§8] Real-time sync for all of the above across clients via SSE events listed in §19, with polling fallback when SSE is down.
83. [Dashboard, §7/§8] Optimistic next-track display on trackEnd from queue head; jump-to-track suppression of trackEnd flash.
84. [Dashboard, §7/§8] Idle home: user top-played (global), server top-played, Billboard top-10 charts — each clickable to play.
85. [Dashboard, §7/§8] Quick-add search modal per guild: debounced 250 ms, link paste support, playlist detection (Play Playlist), top result + list, source badges (Spotify / YT Music / YouTube / Audio), VIDEO chip, top-played when empty.
86. [Dashboard, §7/§8] Owner-not-in-voice → choose a voice channel (with live member avatars) → bot joins and plays.
87. [Dashboard, §7/§8] Queue: live list with thumbnails, requester avatars, durations, animated position numbers; click to play now; remove; clear with confirm modal; drag-and-drop reorder with drop indicator "Move to #N"; all optimistic with server recheck.
88. [Dashboard, §7/§8] Session history: grid of listening sessions (Live badge, participants, track count, duration), client search, SWR local cache, realtime updates; session detail with sticky collapsing header, participants, track table with requester, replay any track into a chosen server.
89. [Dashboard, §7/§8] Library: user playlists grid, delete with confirm, import from Spotify/YouTube URL (preview → name/description → save), playlist detail with play-all (source URL) / play-track, delete, toasts.
90. [Dashboard, §7/§8] Catalog search with sources Spotify (API or Lavalink), YouTube, YouTube Music; top result with match %; songs/artists/albums; album/artist/YouTube-channel pages with play actions.
91. [Dashboard, §7/§8] "Select Server" modal with per-guild `canPlay` + `reason` chips (batch permissions endpoint) before any play from browse pages.
92. [Dashboard, §7/§8] Guild settings: music text channel (searchable, "none = use the channel where the command was used"), bot owner display + copy ID, save with success/error, permission-model explainer text; live `settingsUpdate`.
93. [Dashboard, §7/§8] Permission model: everyone views; owner/inviter controls from anywhere; anyone can start playback when the bot is idle; otherwise must share the bot's voice channel to control.
94. [Admin/Auth/Sync, §5–§8] Discord OAuth scopes `identify email guilds`; login opens a **500×700 centered popup**, finishes via `postMessage` to the opener (fallback full-page redirect to `/` when no opener), errors surface via `?discord_error=`.
95. [Admin/Auth/Sync, §5–§8] User identity = Discord ID; internal user id `discord_{discordId}`; user record stores username, discriminator, email, avatar hash, verified, guild snapshot `{id,name,icon,owner}`, createdAt (first login only), updatedAt.
96. [Admin/Auth/Sync, §5–§8] Default avatar: legacy discriminator → `discriminator % 5`; new usernames → `(discordId >> 22) % 6`; CDN `https://cdn.discordapp.com/avatars/{id}/{hash}.png` / `embed/avatars/{i}.png`.
97. [Admin/Auth/Sync, §5–§8] Roles: `admin` and `developer` from a whitelist keyed by Discord ID; both enter `/admin`; only developer can add/remove/change roles and sees "Settings"; non-admins hitting `/admin` → `/dashboard`, logged-out → `/login`.
98. [Admin/Auth/Sync, §5–§8] canView = member of the guild (bot cache); canControl order: server owner → bot owner (GuildSettings.ownerId) → no player & in any voice → player exists & same voice channel; exact reason strings listed in C.4 are shown to users.
99. [Admin/Auth/Sync, §5–§8] "Can play here" for guild pickers: server owner / bot owner / in any voice channel, with voice channel name in reason (`In {name}`).
100. [Admin/Auth/Sync, §5–§8] Permission changes are pushed live (`permissionUpdate`, `permissionBatchUpdate`, `userPermissionUpdate`) with a 60 s polling fallback.
101. [Admin/Auth/Sync, §5–§8] One SSE connection per guild per tab, shared by all components, 1 s close grace, sequence-number dedupe, heartbeat ignored, exponential reconnect 1→16 s (cap 30 s) max 5 attempts, synthetic `init` from `/api/queue/{g}` for late subscribers, events delivered one-by-one (16 ms apart) so none are coalesced.
102. [Admin/Auth/Sync, §5–§8] When the guild SSE is down, NowPlaying and Queue fall back to 5 s polling; dashboard guild list also polls every 10 s; bot status polls every 10 s; admin dashboard stats every 30 s; performance page every 5 s keeping 60 points.
103. [Admin/Auth/Sync, §5–§8] Progress bar is client-interpolated from (position, syncTime) with rAF, never jumps backwards < 5 s unless a seek happened in the last 2 s; paused bar only snaps on > 5 s difference or recent seek.
104. [Admin/Auth/Sync, §5–§8] Optimistic UX: queue adds appear instantly (confirmed by later `queueUpdate`), track-end shows next queued track instantly, jump-to-track suppresses the following `trackEnd`, 24/7 toggle ignores server `init` for 5 s (persisted in `sessionStorage['247_toggle_{guildId}']`).
105. [Admin/Auth/Sync, §5–§8] Selected guild persists per tab in `sessionStorage['selectedGuildId']`; Prism background toggle in `localStorage['prismEnabled']`.
106. [Admin/Auth/Sync, §5–§8] Bot-offline detection: a non-JSON response (tunnel HTML page) or network error is treated as "Bot appears to be offline" (HTTP 503 semantic) everywhere, never as a crash.
107. [Admin/Auth/Sync, §5–§8] Player actions supported: pause, resume, skip, previous, volume, seek, play(query, defaultVolume=15 from env, optional targetVoiceChannelId), loop(mode or cycle), shuffle, skipto(index), playnow(index), join(channelId); queue actions: clear, remove(trackId), move(from,to), shuffle; error bodies may carry `requiresVoiceChannel` / `canSelectChannel` for the voice-channel picker flow.
108. [Admin/Auth/Sync, §5–§8] Every control call carries the acting user (username, discordId, avatar) so the bot can log/attribute actions and requester avatars.
109. [Admin/Auth/Sync, §5–§8] Admin dashboard cards: online/ping, uptime, servers, active players, CPU %, memory % + used/total, per-cache items/bytes.
110. [Admin/Auth/Sync, §5–§8] Admin guilds: search by name/ID, sort name/members/join date, totals (servers, members, playing), open-as-user link `/dashboard?guild={id}`.
111. [Admin/Auth/Sync, §5–§8] Admin guild detail: tabs overview/channels/sessions/history with URL `?tab=&channel=`; read-only Discord channel/thread viewer with Discord-markdown, mentions (user & coloured role), replies, attachments (image/video/audio/file + download + lightbox with copy-link/open), embeds (rich/video iframe/gifv/image), reactions, thread previews that open the thread (last 50 messages).
112. [Admin/Auth/Sync, §5–§8] Admin session detail: dominant-colour hero from first thumbnail, guild name/icon, song count, total minutes, participants, track table with requester name/avatar and duration.
113. [Admin/Auth/Sync, §5–§8] Admin terminal: live log stream with initial history backlog, 1000-line cap, level filter, search, pause/resume buffer, auto-scroll toggle, clear, download `.txt`, ANSI colour rendering.
114. [Admin/Auth/Sync, §5–§8] Admin users: live list from bot user cache (plays, unique tracks, last active) + live "on dashboard" presence dots + "Active Today" count; user detail with up to 500 history items (sorted by last played) and 500 sessions across guilds.
115. [Admin/Auth/Sync, §5–§8] Top-played/"isMusic" classification heuristics (category 10, music topic, "- Topic" channel, "Provided to YouTube by", music.youtube.com URL, Spotify always music) and caching the result on the history doc.
116. [Admin/Auth/Sync, §5–§8] Track/history doc id = base64(`title-author`) with `/+=`→`_` (dedupes plays of the same song across sources); separate per-guild-user, global-user and per-guild server histories; sessions store all tracks and participants embedded.
117. [Admin/Auth/Sync, §5–§8] Top charts: Thailand/global Spotify charts with offline fallback list; Billboard chart with rank movement (`up/down/same`), weeks on chart, peak, last week. (NOT working in v5: the dashboard's /api/top-charts/:region has no bot endpoint, so it always shows 4 hardcoded tracks. Decide whether to build it or drop it.)
118. [Admin/Auth/Sync, §5–§8] Thai-language UI strings and `th-TH` date formatting on admin guild/session pages.
119. [Terminal, §9] Operator console with play (names or IDs, auto text channel, silent mode with no Discord embeds), stop, skip, leave, status [guild], list/guilds, find guild|voice|text, help, clear, exit.
120. [Terminal, §9] Admin live log viewer: console capture into a 1000-line ring buffer, last-100 history on connect, live stream, level filter, search, pause, auto-scroll, clear, download.
121. [Data, §5] Guild settings per guild: musicChannelId (optional notification channel) and ownerId (bot owner = inviter, from audit log, falling back to server owner), auto-created on ready/guildCreate and kept after the bot leaves.
122. [Data, §5] Admin whitelist keyed by Discord ID with role admin|developer, enforced SERVER-SIDE in the rebuild (ADR 0001 intent).
123. [Data, §2/§5] Queue backup survives restart: on each track change, persist queue + current track + 24/7 flag per guild; restore players ~5 s after ready; clear on queueEnd (RECONSTRUCT).
