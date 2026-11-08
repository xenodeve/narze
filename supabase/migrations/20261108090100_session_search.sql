-- #108 review: search sessions on the server, so the Dashboard does not fetch every session's tracks
-- to search them. Only words a person would type: the server name, the people's names, and the
-- tracks' titles and artists (not JSON keys, ids or URLs, which matched every session).
alter table public.listening_sessions
  add column search_text text generated always as (lower(
    guild_name || ' ' ||
    jsonb_path_query_array(participants, '$[*].name')::text || ' ' ||
    jsonb_path_query_array(tracks, '$[*].title')::text || ' ' ||
    jsonb_path_query_array(tracks, '$[*].author')::text
  )) stored;
