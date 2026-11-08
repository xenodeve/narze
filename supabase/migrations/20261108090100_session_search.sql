-- #108 review: search sessions on the server (server name, people and tracks), so the Dashboard
-- does not fetch every session's tracks to search them.
alter table public.listening_sessions
  add column search_text text generated always as (lower(guild_name || ' ' || participants::text || ' ' || tracks::text)) stored;
