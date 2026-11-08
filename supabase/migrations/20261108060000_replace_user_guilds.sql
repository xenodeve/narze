-- #99: replace a user's guild snapshot in one transaction, so a reader never sees it half-written
-- and two concurrent syncs cannot collide on the primary key. Called by the Backend (secret key).

create function public.replace_user_guilds(p_discord_id text, p_guilds jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.user_guilds where discord_id = p_discord_id;
  insert into public.user_guilds (discord_id, guild_id, name, icon_url, is_owner)
  select p_discord_id, g ->> 'id', g ->> 'name', g ->> 'iconUrl', coalesce((g ->> 'isOwner')::boolean, false)
  from jsonb_array_elements(p_guilds) as g;
$$;

revoke all on function public.replace_user_guilds(text, jsonb) from public, anon, authenticated;
