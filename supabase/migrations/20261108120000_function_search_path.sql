-- #142: pin search_path on the functions that did not set it (replace_user_guilds already does).
-- Every name in their bodies is schema-qualified, and pg_catalog is searched regardless.
-- Defence in depth: all three are security invoker, with EXECUTE revoked from client roles.
alter function public.replace_playlist_tracks(uuid, jsonb) set search_path = '';
alter function public.record_play(text, text, jsonb) set search_path = '';
alter function public.admin_user_stats(text) set search_path = '';
