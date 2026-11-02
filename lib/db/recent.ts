import type { RecentTrack } from "@/lib/data";
import { query } from "./client";

/** How many tracks the listening history keeps; the one played longest ago leaves first. */
export const RECENT_LIMIT = 100;

type Row = {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  artwork_large: string | null;
  duration_ms: number;
  played_text: string;
};

/**
 * Saves plays into the queue and trims it to RECENT_LIMIT.
 *
 * Two things write here: the one-time copy of Spotify's own last fifty plays,
 * and every play heard in Superlike from then on (POST /api/me/plays).
 *
 * A track already held keeps its place in the list but moves to the newest end
 * when it is played again (`played_at` only ever moves forward). Past the limit
 * the oldest-played tracks are dropped, so the list is a first-in, first-out
 * window over what was listened to rather than a week or a day.
 */
export async function rememberRecent(userId: string, tracks: RecentTrack[]): Promise<void> {
  const fresh = tracks.filter((t) => t.uri);
  if (fresh.length === 0) return;
  await query(
    `insert into recent_tracks (user_id, uri, title, artist, artwork, artwork_large, duration_ms, played_at)
     select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::timestamptz[])
     on conflict (user_id, uri) do update set
       title = excluded.title,
       artist = excluded.artist,
       artwork = coalesce(excluded.artwork, recent_tracks.artwork),
       artwork_large = coalesce(excluded.artwork_large, recent_tracks.artwork_large),
       duration_ms = excluded.duration_ms,
       played_at = greatest(recent_tracks.played_at, excluded.played_at)`,
    [
      userId,
      fresh.map((t) => t.uri),
      fresh.map((t) => t.title),
      fresh.map((t) => t.artist),
      fresh.map((t) => t.artwork),
      fresh.map((t) => t.artworkLarge),
      fresh.map((t) => t.durationMs),
      fresh.map((t) => t.playedAt),
    ],
  );
  await query(
    `delete from recent_tracks where user_id = $1 and uri not in
       (select uri from recent_tracks where user_id = $1 order by played_at desc limit ${RECENT_LIMIT})`,
    [userId],
  );
}

/** The saved history, newest first, numbered as the screen shows it. */
export async function listRecent(userId: string): Promise<RecentTrack[]> {
  const rows = await query<Row>(
    `select uri, title, artist, artwork, artwork_large, duration_ms, to_char(played_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as played_text
       from recent_tracks where user_id = $1 order by played_at desc limit ${RECENT_LIMIT}`,
    [userId],
  );
  return rows.map((r, i) => ({
    index: String(i + 1).padStart(2, "0"),
    title: r.title,
    artist: r.artist,
    artwork: r.artwork,
    artworkLarge: r.artwork_large ?? r.artwork,
    playedAt: r.played_text,
    durationMs: r.duration_ms,
    uri: r.uri,
  }));
}

/** Whether this user's Spotify history has already been copied in. */
export async function wasImported(userId: string): Promise<boolean> {
  const rows = await query<{ done: boolean }>("select recent_imported_at is not null as done from users where spotify_id = $1", [userId]);
  return rows[0]?.done === true;
}

export async function markImported(userId: string): Promise<void> {
  await query("update users set recent_imported_at = now() where spotify_id = $1", [userId]);
}
