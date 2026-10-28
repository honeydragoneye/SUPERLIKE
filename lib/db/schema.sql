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

-- Which artist a play was by: the first artist Spotify names for the track.
-- Names alone cannot be counted ("A, B" is one string for a track by two), so the
-- weekly artist is counted by this id. Plays stored before it existed lack it.
alter table plays_daily add column if not exists artist_id text;

-- Artist of the Week, one row per week, saved while the developer is signed in
-- for the same reason as album_cache: Spotify only answers with a listener's token.
create table if not exists weekly_picks (
  week_start  date primary key,
  artist_id   text not null,
  name        text not null,
  image       text,
  genres      jsonb not null default '[]',
  top_tracks  jsonb not null default '[]',
  palette     jsonb,
  plays       integer not null,
  computed_at timestamptz not null default now()
);

-- The day's chart as it was fetched, top 50, one row per place. A week's ranking is
-- worked out from the last seven days of these (see lib/chart.ts), so the "this
-- week" list is a real week's worth rather than one day's snapshot.
create table if not exists chart_daily (
  day     date not null,
  rank    integer not null check (rank > 0),
  title   text not null,
  artist  text not null,
  artwork text,
  url     text,
  primary key (day, rank)
);

-- when the last confirmation mail went out, so the form cannot be used to mail one address over and over
alter table subscribers add column if not exists last_mailed_at timestamptz;

-- what the subscriber asked to be called in the mails
alter table subscribers add column if not exists nickname text;

-- the album an issue is about, and the look it was given (see scripts/issue.mjs)
alter table issues add column if not exists album jsonb;
alter table issues add column if not exists theme text;

-- the album a played track is on, so a mail can open it in the app
alter table plays_daily add column if not exists album_id text;

-- A conversation with the chatbot, kept when the chat is closed or a new one is
-- started. Per user like everything above: every read and write is scoped to the
-- signed-in account, and only the newest 20 per account are kept (lib/db/chats).
-- `messages` holds the texts and the songs the agent named, nothing else.
create table if not exists chats (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references users (spotify_id) on delete cascade,
  title         text not null,
  messages      jsonb not null,
  message_count integer not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists chats_user_recent on chats (user_id, updated_at desc);

-- Playlists made inside Superlike. Per user like everything above: every read and
-- write is scoped to the signed-in account (lib/db/playlists). A track is kept as
-- the row that was on screen when it was added, so a playlist can be drawn and
-- played without asking Spotify for each song again.
create table if not exists playlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references users (spotify_id) on delete cascade,
  name       text not null,
  is_public  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists playlists_user_recent on playlists (user_id, updated_at desc);

create table if not exists playlist_tracks (
  playlist_id uuid not null references playlists (id) on delete cascade,
  track_id    text not null,
  uri         text not null,
  title       text not null,
  artist      text not null,
  artwork     text,
  duration_ms integer not null default 0,
  album_id    text,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);
create index if not exists playlist_tracks_order on playlist_tracks (playlist_id, added_at);

-- the cover colours of a playlist, taken from the album of its first song (lib/palette-server);
-- null while it is empty
alter table playlists add column if not exists palette jsonb;

-- Radio stations a listener hearted in the ON AIR bar. Per user like everything
-- above. Only what is needed to draw the row is kept: the stream address is not,
-- because Radio Browser hands out ones that expire (signed HLS links), so it is
-- asked for again each time a station is played (lib/radio/client).
create table if not exists radio_favorites (
  user_id         text not null references users (spotify_id) on delete cascade,
  station_uuid    text not null,
  name            text not null,
  country         text,
  country_code    text,
  tags            jsonb not null default '[]',
  favicon         text,
  favorited_at    timestamptz not null default now(),
  last_played_at  timestamptz,
  primary key (user_id, station_uuid)
);
create index if not exists radio_favorites_user_recent
  on radio_favorites (user_id, coalesce(last_played_at, favorited_at) desc);

-- the station's own website, so its name in the list can link to it
alter table radio_favorites add column if not exists homepage text;
