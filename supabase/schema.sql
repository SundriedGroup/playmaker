-- Playmaker: daily Instagram snapshots.
-- Run this once in Supabase → SQL Editor.

create table if not exists public.account_snapshots (
  day          date primary key,
  followers    integer not null,
  media_count  integer,
  created_at   timestamptz not null default now()
);

create table if not exists public.post_snapshots (
  day         date not null,
  media_id    text not null,
  posted_at   timestamptz,
  kind        text,
  series      text,
  first_line  text,
  reach       integer,
  views       integer,
  shares      integer,
  saves       integer,
  follows     integer,
  comments    integer,
  likes       integer,
  created_at  timestamptz not null default now(),
  primary key (day, media_id)
);

create index if not exists post_snapshots_media_idx on public.post_snapshots (media_id, day);

-- Lock both tables down. With RLS on and no policies, the public (anon) key
-- can't read or write anything. Playmaker uses the service role key on the
-- server only, which bypasses RLS.
alter table public.account_snapshots enable row level security;
alter table public.post_snapshots enable row level security;

-- TikTok: the login (one row) and a daily follower snapshot.
create table if not exists public.tiktok_auth (
  id int primary key check (id = 1),
  open_id text,
  access_token text not null,
  refresh_token text not null,
  scope text,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.tiktok_auth enable row level security;

create table if not exists public.tiktok_snapshots (
  day date primary key,
  followers int,
  likes bigint,
  videos int,
  created_at timestamptz not null default now()
);
alter table public.tiktok_snapshots enable row level security;
