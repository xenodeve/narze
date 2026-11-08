-- #99: Dashboard users and the guild snapshot taken from Discord at sign-in (ADR-0005).
-- The Backend writes both with the secret key; RLS lets a signed-in user read only their own rows.

create table public.users (
  discord_id text primary key check (discord_id ~ '^[0-9]+$'),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  avatar_url text,
  -- Presence: true while at least one Dashboard tab is open.
  active boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_guilds (
  discord_id text not null references public.users (discord_id) on delete cascade,
  guild_id text not null check (guild_id ~ '^[0-9]+$'),
  name text not null,
  icon_url text,
  is_owner boolean not null default false,
  primary key (discord_id, guild_id)
);

alter table public.users enable row level security;
alter table public.user_guilds enable row level security;

create policy "users: read own row" on public.users
  for select to authenticated using (auth_user_id = (select auth.uid()));

create policy "user_guilds: read own guilds" on public.user_guilds
  for select to authenticated using (
    discord_id in (select u.discord_id from public.users u where u.auth_user_id = (select auth.uid()))
  );

revoke all on public.users, public.user_guilds from anon;
revoke insert, update, delete on public.users, public.user_guilds from authenticated;
