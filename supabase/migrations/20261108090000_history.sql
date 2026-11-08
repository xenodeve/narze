-- #108: Listening Sessions and Play History. The Bot writes both with the secret key; the Backend
-- reads them and decides who may see what (participants only for sessions). No client role reads
-- these tables directly.

-- One row per session (spec #31). Tracks and participants are embedded like v5's document; every
-- track keeps its requester. participant_ids is what "sessions I was in" filters on.
create table public.listening_sessions (
  id text primary key,
  guild_id text not null,
  guild_name text not null,
  channel_id text,
  start_time bigint not null,
  end_time bigint,
  is_active boolean not null default true,
  tracks jsonb not null default '[]'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  participant_ids text[] not null default '{}',
  track_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create index listening_sessions_participant_ids on public.listening_sessions using gin (participant_ids);
create index listening_sessions_guild_start on public.listening_sessions (guild_id, start_time desc);
create index listening_sessions_active on public.listening_sessions (is_active) where is_active;

-- Play History (spec #33, #116): one row per (guild, user, track). An empty guild_id is the user's
-- history across every Guild; an empty discord_id is the Guild's history across every user.
create table public.play_history (
  guild_id text not null default '',
  discord_id text not null default '',
  track_id text not null,
  title text not null,
  artist text not null,
  uri text not null,
  thumbnail text,
  duration_ms bigint not null default 0,
  source text not null,
  is_music boolean not null default false,
  is_video boolean not null default false,
  play_count integer not null default 0,
  last_played_at timestamptz not null default now(),
  primary key (guild_id, discord_id, track_id)
);
create index play_history_top on public.play_history (guild_id, discord_id, play_count desc);

-- One track start: bumps the guild-user, user and guild rows together.
create function public.record_play(p_guild text, p_user text, p_track jsonb)
returns void language plpgsql security invoker as $$
begin
  insert into public.play_history
    (guild_id, discord_id, track_id, title, artist, uri, thumbnail, duration_ms, source, is_music, is_video, play_count, last_played_at)
  select scope.guild_id, scope.discord_id, p_track->>'trackId', p_track->>'title', p_track->>'artist',
         p_track->>'uri', p_track->>'thumbnail', coalesce((p_track->>'durationMs')::bigint, 0),
         p_track->>'source', coalesce((p_track->>'isMusic')::boolean, false),
         coalesce((p_track->>'isVideo')::boolean, false), 1, now()
  from (values (p_guild, p_user), ('', p_user), (p_guild, '')) as scope(guild_id, discord_id)
  on conflict (guild_id, discord_id, track_id) do update set
    play_count = public.play_history.play_count + 1,
    last_played_at = now(),
    title = excluded.title,
    artist = excluded.artist,
    uri = excluded.uri,
    thumbnail = coalesce(excluded.thumbnail, public.play_history.thumbnail),
    duration_ms = excluded.duration_ms,
    source = excluded.source,
    is_music = excluded.is_music,
    is_video = excluded.is_video;
end;
$$;

alter table public.listening_sessions enable row level security;
alter table public.play_history enable row level security;
revoke all on public.listening_sessions from anon, authenticated;
revoke all on public.play_history from anon, authenticated;
revoke execute on function public.record_play(text, text, jsonb) from public, anon, authenticated;
