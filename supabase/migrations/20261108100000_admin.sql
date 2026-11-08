-- #110: the Admin Whitelist (spec #97, #122). Discord ID -> admin | developer. Only the Backend reads
-- or writes it (secret key); a Developer changes it through the Dashboard. The first Developer comes
-- from NARZE_DEVELOPER_IDS, not from this table.
create table public.admin_whitelist (
  discord_id text primary key check (discord_id ~ '^\d{17,20}$'),
  role text not null check (role in ('admin', 'developer')),
  added_by text,
  added_at timestamptz not null default now()
);

alter table public.admin_whitelist enable row level security;
revoke all on public.admin_whitelist from anon, authenticated;
