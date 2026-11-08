-- #111 (spec #114): the admin user list. Everyone who played through the Bot (Play History, the
-- user-wide rows where guild_id = '') or opened the Dashboard (users), with plays, unique tracks and
-- when they were last active. Names come from the Dashboard's users, else from the latest Listening
-- Session they were in. Only the Backend (secret key) may call it.
create function public.admin_user_stats()
returns table (
  discord_id text,
  name text,
  avatar_url text,
  plays bigint,
  unique_tracks bigint,
  last_active_at timestamptz
)
language sql stable security invoker as $$
  with stats as (
    select h.discord_id, sum(h.play_count)::bigint as plays, count(*)::bigint as unique_tracks,
           max(h.last_played_at) as last_played_at
    from public.play_history h
    where h.guild_id = '' and h.discord_id <> ''
    group by h.discord_id
  ),
  ids as (
    select s.discord_id from stats s
    union
    select u.discord_id from public.users u
  ),
  people as (
    select distinct on (p->>'id') p->>'id' as discord_id, p->>'name' as name, p->>'avatarUrl' as avatar_url
    from public.listening_sessions ls, jsonb_array_elements(ls.participants) p
    order by p->>'id', ls.start_time desc
  )
  select i.discord_id,
         coalesce(u.name, pe.name, i.discord_id),
         coalesce(u.avatar_url, pe.avatar_url),
         coalesce(s.plays, 0),
         coalesce(s.unique_tracks, 0),
         greatest(s.last_played_at, u.last_seen_at)
  from ids i
  left join stats s on s.discord_id = i.discord_id
  left join public.users u on u.discord_id = i.discord_id
  left join people pe on pe.discord_id = i.discord_id
  order by greatest(s.last_played_at, u.last_seen_at) desc nulls last;
$$;

revoke all on function public.admin_user_stats() from public, anon, authenticated;
