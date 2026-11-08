-- #107: the Library — a user's playlists and liked tracks.
-- The Backend writes with the secret key and checks ownership itself; RLS also lets a signed-in user
-- read only their own rows, so ownership is enforced twice (AC1).

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.users (discord_id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  description text check (description is null or length(description) <= 300),
  thumbnail text,
  source_platform text check (source_platform in ('spotify', 'youtube')),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playlists_owner on public.playlists (owner_id, updated_at desc);

create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  position int not null check (position >= 0),
  title text not null,
  artist text not null,
  duration_ms bigint not null check (duration_ms >= 0),
  thumbnail text,
  uri text not null check (length(uri) > 0),
  album text,
  added_at timestamptz,
  primary key (playlist_id, position)
);

create table public.likes (
  discord_id text not null references public.users (discord_id) on delete cascade,
  uri text not null check (length(uri) > 0),
  title text not null,
  artist text not null,
  duration_ms bigint not null check (duration_ms >= 0),
  thumbnail text,
  liked_at timestamptz not null default now(),
  primary key (discord_id, uri)
);

-- Replaces a playlist's tracks in one transaction (an edit never leaves half a list).
create function public.replace_playlist_tracks(p_playlist uuid, p_tracks jsonb)
returns void language plpgsql security invoker as $$
begin
  delete from public.playlist_tracks where playlist_id = p_playlist;
  insert into public.playlist_tracks (playlist_id, position, title, artist, duration_ms, thumbnail, uri, album, added_at)
  select p_playlist, (t.ordinality - 1)::int, t.value->>'title', t.value->>'artist',
         coalesce((t.value->>'duration')::bigint, 0), t.value->>'thumbnail', t.value->>'uri',
         t.value->>'album', (t.value->>'addedAt')::timestamptz
  from jsonb_array_elements(p_tracks) with ordinality as t(value, ordinality);
  update public.playlists set updated_at = now() where id = p_playlist;
end;
$$;

alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.likes enable row level security;

create policy "playlists: read own" on public.playlists for select to authenticated using (
  owner_id in (select u.discord_id from public.users u where u.auth_user_id = (select auth.uid()))
);
create policy "playlist_tracks: read own" on public.playlist_tracks for select to authenticated using (
  playlist_id in (
    select p.id from public.playlists p
    join public.users u on u.discord_id = p.owner_id
    where u.auth_user_id = (select auth.uid())
  )
);
create policy "likes: read own" on public.likes for select to authenticated using (
  discord_id in (select u.discord_id from public.users u where u.auth_user_id = (select auth.uid()))
);

revoke all on public.playlists, public.playlist_tracks, public.likes from anon;
revoke insert, update, delete on public.playlists, public.playlist_tracks, public.likes from authenticated;
revoke execute on function public.replace_playlist_tracks(uuid, jsonb) from public, anon, authenticated;
