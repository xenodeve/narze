-- #111 (spec #114): the admin user list. Everyone who played through the Bot (Play History, the
-- user-wide rows where guild_id = '') or opened the Dashboard (users), with plays, unique tracks and
-- when they were last active. Names come from the Dashboard's users, else from the latest Listening
-- Session they were in. `p_discord_id` narrows it to one person. Only the Backend (secret key) may
-- call it.
create function public.admin_user_stats(p_discord_id text default null)
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
      and (p_discord_id is null or h.discord_id = p_discord_id)
    group by h.discord_id
  ),
  ids as (
    select s.discord_id from stats s
    union
    select u.discord_id from public.users u where p_discord_id is null or u.discord_id = p_discord_id
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
  -- Only people the Dashboard never saw need a name from their latest session (GIN on participant_ids).
  left join lateral (
    select p->>'name' as name, p->>'avatarUrl' as avatar_url
    from public.listening_sessions ls, jsonb_array_elements(ls.participants) p
    where u.name is null and ls.participant_ids @> array[i.discord_id] and p->>'id' = i.discord_id
    order by ls.start_time desc
    limit 1
  ) pe on true
  order by greatest(s.last_played_at, u.last_seen_at) desc nulls last;
$$;

revoke all on function public.admin_user_stats(text) from public, anon, authenticated;
