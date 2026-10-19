-- Superlike's shared database. Every statement is idempotent: `npm run db:migrate`
-- can be run again after a change without touching what is already there.
--
-- Only song metadata and subscriber e-mail addresses live here. Spotify tokens
-- and passwords are never stored.

create table if not exists users (
  spotify_id   text primary key,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Hearts. The whole row is kept (not just the id) because 마이페이지 renders the
-- list, and album_id is what lets Editor's Pick open the album of the latest one.
create table if not exists likes (
  user_id     text not null references users (spotify_id) on delete cascade,
  track_id    text not null,
  album_id    text,
  uri         text not null,
  title       text not null,
  artist      text not null,
  artwork     text,
  duration_ms integer not null default 0,
  liked_at    timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists likes_user_recent on likes (user_id, liked_at desc);

-- A play counts once the track has been heard for PLAY_THRESHOLD_MS (lib/plays.ts).
-- One row per user, day and track, so a week is a sum over seven days.
create table if not exists plays_daily (
  user_id  text not null references users (spotify_id) on delete cascade,
  day      date not null,
  track_id text not null,
  title    text not null,
  artist   text not null,
  count    integer not null check (count > 0),
  primary key (user_id, day, track_id)
);
create index if not exists plays_daily_user_day on plays_daily (user_id, day);

-- Not tied to users: a subscriber does not have to be signed in to Spotify.
create table if not exists subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  status       text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  token        text not null unique,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

-- One issue of the weekly magazine. A draft is made from plays_daily and sent
-- only after the developer has looked at it.
create table if not exists issues (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  title      text not null,
  tracks     jsonb not null default '[]',
  status     text not null default 'draft' check (status in ('draft', 'sent')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- The album behind Editor's Pick, saved while the developer is signed in. Spotify
-- only answers with a listener's token (the app has no client secret), so a
-- visitor who is not connected is served this copy instead.
create table if not exists album_cache (
  album_id   text primary key,
  data       jsonb not null,
  fetched_at timestamptz not null default now()
);
