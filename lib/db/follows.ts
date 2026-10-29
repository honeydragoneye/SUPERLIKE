import { findAppleArtist, lookupReleases } from "@/lib/apple/artist";
import { albumTitles } from "@/lib/spotify/artist-titles";
import { query } from "./client";

export type FollowedArtist = {
  id: string;
  name: string;
  image: string | null;
  followedAt: string;
  /** the newest release Apple lists for them, YYYY-MM-DD */
  lastRelease: string | null;
};

export type UpdateItem = {
  id: string;
  title: string;
  kind: "album" | "ep" | "single";
  releaseDate: string;
  artwork: string | null;
  artist: string;
  artistId: string;
  /** released since the follow began, and not opened yet */
  unread: boolean;
};

/** At most this many artists are followed per account. */
export const FOLLOW_LIMIT = 100;
/** How long a lookup stands in for a new one. */
const FRESH_HOURS = 20;
/** Lookups made by one refresh, so a long list is caught up over a few visits. */
const PER_REFRESH = 12;
/** How far back 소식 reaches. */
const NEWS_DAYS = 180;
const NEWS_LIMIT = 40;

export class FollowLimitError extends Error {
  constructor() {
    super("follows");
    this.name = "FollowLimitError";
  }
}

export async function listFollows(userId: string): Promise<FollowedArtist[]> {
  return query<FollowedArtist>(
    `select f.artist_id as id, f.name, f.image, f.followed_at as "followedAt",
            (select to_char(max(r.released), 'YYYY-MM-DD') from artist_releases r
              where r.apple_artist_id = f.apple_id and r.released <= (now() at time zone 'Asia/Seoul')::date) as "lastRelease"
       from artist_follows f
      where f.user_id = $1
      order by (select max(r.released) from artist_releases r where r.apple_artist_id = f.apple_id) desc nulls last, f.followed_at desc
      limit ${FOLLOW_LIMIT}`,
    [userId],
  );
}

export async function followArtist(
  userId: string,
  a: { id: string; name: string; image: string | null },
  /** the artist's albums by title, as Spotify has them: how an ambiguous Apple match is settled */
  knownTitles?: () => Promise<string[]>,
): Promise<void> {
  const [{ n }] = await query<{ n: number }>(
    "select count(*)::int as n from artist_follows where user_id = $1 and artist_id <> $2",
    [userId, a.id],
  );
  if (n >= FOLLOW_LIMIT) throw new FollowLimitError();
  // the match with Apple's catalogue is made now, while the listener waits for the button anyway; a miss is tried again at refresh
  const apple = await findAppleArtist(a.name, knownTitles).catch(() => null);
  await query(
    `insert into artist_follows (user_id, artist_id, name, image, apple_id)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, artist_id) do nothing`,
    [userId, a.id, a.name, a.image, apple],
  );
}

export async function unfollowArtist(userId: string, artistId: string): Promise<void> {
  await query("delete from artist_follows where user_id = $1 and artist_id = $2", [userId, artistId]);
}

/** One refresh per account at a time: opening two screens at once must not ask Apple twice. */
const running = new Map<string, Promise<boolean>>();

/**
 * Brings the releases of the followed artists up to date: matches any artist
 * not yet found in Apple's catalogue, then looks up the ones not asked about in
 * the last day. Returns false when something could not be asked; what is kept
 * is still shown.
 */
export function refreshReleases(userId: string): Promise<boolean> {
  const live = running.get(userId);
  if (live) return live;
  const p = refresh(userId).finally(() => running.delete(userId));
  running.set(userId, p);
  return p;
}

async function refresh(userId: string): Promise<boolean> {
  let clean = true;
  const unmatched = await query<{ artist_id: string; name: string }>(
    "select artist_id, name from artist_follows where user_id = $1 and apple_id is null limit 20",
    [userId],
  );
  for (const u of unmatched) {
    try {
      const apple = await findAppleArtist(u.name, () => albumTitles(u.artist_id));
      if (apple) await query("update artist_follows set apple_id = $3 where user_id = $1 and artist_id = $2", [userId, u.artist_id, apple]);
    } catch {
      clean = false;
    }
  }

  const stale = await query<{ apple_id: string }>(
    `select distinct f.apple_id
       from artist_follows f
       left join artist_checks c on c.apple_artist_id = f.apple_id
      where f.user_id = $1 and f.apple_id is not null
        and (c.checked_at is null or c.checked_at < now() - interval '${FRESH_HOURS} hours')
      limit ${PER_REFRESH}`,
    [userId],
  );
  for (const { apple_id } of stale) {
    try {
      const releases = await lookupReleases(apple_id);
      for (const r of releases) {
        await query(
          `insert into artist_releases (apple_artist_id, collection_id, title, kind, released, artwork)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (apple_artist_id, collection_id)
           do update set title = excluded.title, kind = excluded.kind, released = excluded.released, artwork = excluded.artwork`,
          [apple_id, r.id, r.title, r.kind, r.released, r.artwork],
        );
      }
      await query(
        `insert into artist_checks (apple_artist_id) values ($1)
         on conflict (apple_artist_id) do update set checked_at = now()`,
        [apple_id],
      );
    } catch {
      clean = false;
    }
  }
  return clean;
}

/** When the followed artists were last checked: the oldest check among them, or null if one has never been. */
export async function lastChecked(userId: string): Promise<string | null> {
  const [row] = await query<{ at: string | null }>(
    `select case when bool_or(c.checked_at is null) then null else min(c.checked_at)::text end as at
       from artist_follows f
       left join artist_checks c on c.apple_artist_id = f.apple_id
      where f.user_id = $1 and f.apple_id is not null`,
    [userId],
  );
  return row?.at ?? null;
}

/** The releases of the followed artists, newest first. */
export async function listUpdates(userId: string): Promise<UpdateItem[]> {
  const rows = await query<UpdateItem>(
    `select r.collection_id as id, r.title, r.kind, to_char(r.released, 'YYYY-MM-DD') as "releaseDate", r.artwork,
            f.name as artist, f.artist_id as "artistId",
            (r.released >= (f.followed_at at time zone 'Asia/Seoul')::date and rd.collection_id is null) as unread
       from artist_follows f
       join artist_releases r on r.apple_artist_id = f.apple_id
       left join release_reads rd on rd.user_id = f.user_id and rd.collection_id = r.collection_id
      where f.user_id = $1
        and r.released <= (now() at time zone 'Asia/Seoul')::date
        and r.released >= (now() at time zone 'Asia/Seoul')::date - ${NEWS_DAYS}
      order by r.released desc, r.collection_id desc
      limit ${NEWS_LIMIT * 2}`,
    [userId],
  );
  // two followed artists on one record, or one record listed twice (a deluxe and a standard edition on the same day), is one piece of news
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const key = `${r.title.toLowerCase()}|${r.releaseDate}`;
      return !seen.has(key) && seen.add(key);
    })
    .slice(0, NEWS_LIMIT);
}

/** Marks the given releases read, or every one of the followed artists' when none are given. */
export async function markRead(userId: string, ids: string[] | null): Promise<void> {
  if (ids && ids.length === 0) return;
  await query(
    `insert into release_reads (user_id, collection_id)
     select $1, r.collection_id
       from artist_follows f
       join artist_releases r on r.apple_artist_id = f.apple_id
      where f.user_id = $1 and ($2::text[] is null or r.collection_id = any($2::text[]))
     on conflict do nothing`,
    [userId, ids],
  );
}
