-- #106: Guild Settings (spec #121). Kept after the Bot leaves a Guild (#22).
-- The Bot writes the owner on join (it can read the audit log); the Backend writes the Music
-- Channel and the avatar outfit for the Dashboard. Both use the secret key; the browser has no
-- direct access (RLS on, no policies for anon/authenticated).

create table public.guild_settings (
  guild_id text primary key check (guild_id ~ '^[0-9]+$'),
  guild_name text not null,
  -- Bot Owner: the inviter from the audit log, else the Server Owner.
  owner_id text not null check (owner_id ~ '^[0-9]+$'),
  -- Where the Bot's notices go; null = the channel where the command was used.
  music_channel_id text check (music_channel_id ~ '^[0-9]+$'),
  avatar jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guild_settings enable row level security;
revoke all on public.guild_settings from anon, authenticated;
