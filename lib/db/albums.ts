import { query } from "./client";

/** How far back "recent" reaches, so one album heard once long ago is not still on the shelf. */
export const ALBUM_DAYS = 90;
/** Albums shown. */
export const ALBUM_LIMIT = 12;

export type RecentAlbum = {
  id: string;
  /** null until it has been filled in from Spotify (plays from before it was kept) */
  name: string | null;
  artwork: string | null;
  artist: string;
  /** when it was last heard, to the second; null for plays that only know their day */
  playedAt: number | null;
  /** the calendar day (Asia/Seoul) of the last play */
  day: string;
};

type Row = {
  album_id: string;
  name: string | null;
  artwork: string | null;
  artist: string;
  played_ms: string | null;
  day: string;
};

const TODAY = "(now() at time zone 'Asia/Seoul')::date";

/**
 * The albums this listener played lately, the one heard last first.
 *
 * Read from `plays_daily` like the rest of "당신의 취향": a track counts there
 * once it has been heard for 20 seconds, so an album only shows up for songs
 * actually listened to, not skipped past. A play with no album id (the SDK did
 * not give one) cannot be placed on an album and is left out.
 */
export async function recentAlbums(userId: string): Promise<RecentAlbum[]> {
  const rows = await query<Row>(
    `select album_id,
            (array_agg(album_name order by day desc, last_played_at desc nulls last)
               filter (where album_name is not null))[1] as name,
            (array_agg(album_artwork order by day desc, last_played_at desc nulls last)
               filter (where album_artwork is not null))[1] as artwork,
            (array_agg(split_part(artist, ', ', 1) order by day desc, last_played_at desc nulls last))[1] as artist,
            (extract(epoch from max(last_played_at)) * 1000)::bigint::text as played_ms,
            to_char(max(day), 'YYYY-MM-DD') as day
       from plays_daily
      where user_id = $1 and album_id is not null and day > ${TODAY} - ${ALBUM_DAYS}
      group by album_id
      order by max(coalesce(last_played_at, day::timestamptz)) desc
      limit ${ALBUM_LIMIT}`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.album_id,
    name: r.name,
    artwork: r.artwork,
    artist: r.artist,
    playedAt: r.played_ms ? Number(r.played_ms) : null,
    day: r.day,
  }));
}

/** Remembers what Spotify said an album is called, on every play of it. */
export async function fillAlbum(
  userId: string,
  albumId: string,
  name: string,
  artwork: string | null,
): Promise<void> {
  await query(
    `update plays_daily
        set album_name = coalesce(album_name, $3), album_artwork = coalesce(album_artwork, $4)
      where user_id = $1 and album_id = $2`,
    [userId, albumId, name, artwork],
  );
}
