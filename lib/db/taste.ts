import { query } from "./client";

/**
 * What a listener has been playing lately, as the database remembers it.
 *
 * Likes are a deliberate, rare act; a play is what actually happens. So the
 * taste is read from `plays_daily`: the last four weeks, each play weighing
 * half as much for every fortnight it is old, and a track repeated within one
 * day counted at most five times so a single song on loop cannot be the whole
 * picture.
 *
 * Days are Asia/Seoul, the calendar the play tally and the weeks already use.
 */
export const TASTE_DAYS = 28;
/** below this many plays the picture is a coincidence, not a taste */
export const MIN_PLAYS = 5;

const TODAY = "(now() at time zone 'Asia/Seoul')::date";
const HALF_LIFE_DAYS = 14;
const REPEAT_CAP = 5;
/** the same decay, written once for both queries */
const SCORE = `sum(least(count, ${REPEAT_CAP}) * power(0.5, (${TODAY} - day) / ${HALF_LIFE_DAYS}.0))`;
const WINDOW = `user_id = $1 and day > ${TODAY} - ${TASTE_DAYS}`;

export type TasteArtist = { name: string; plays: number };
export type TasteTrack = { title: string; artist: string };

export type Taste = {
  totalPlays: number;
  /** most-played artists, heaviest first */
  artists: TasteArtist[];
  /** most-played tracks, heaviest first */
  tracks: TasteTrack[];
  /** `title|artist` of everything played in the window, lower-cased: what a recommendation must not repeat */
  heard: Set<string>;
};

/** "A, B" is a track by two: the first is the artist the play is counted for. */
export function firstArtist(name: string): string {
  return name.split(", ")[0].trim();
}

/** How a track is compared across Spotify's spelling and Last.fm's. */
export function heardKey(title: string, artist: string): string {
  const bare = title.replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s-\s.*$/, "").trim();
  return `${bare}|${firstArtist(artist)}`.toLowerCase();
}

export async function tasteOf(userId: string): Promise<Taste> {
  const [artists, tracks, played, liked] = await Promise.all([
    query<{ name: string; plays: number }>(
      `select (array_agg(split_part(artist, ', ', 1) order by day desc))[1] as name,
              sum(count)::int as plays
         from plays_daily
        where ${WINDOW}
        group by lower(split_part(artist, ', ', 1))
        order by ${SCORE} desc, max(day) desc
        limit 8`,
      [userId],
    ),
    query<{ title: string; artist: string }>(
      `select (array_agg(title order by day desc))[1] as title,
              (array_agg(artist order by day desc))[1] as artist
         from plays_daily
        where ${WINDOW}
        group by track_id
        order by ${SCORE} desc, max(day) desc
        limit 30`,
      [userId],
    ),
    query<{ title: string; artist: string; plays: number }>(
      `select title, artist, sum(count)::int as plays from plays_daily where ${WINDOW} group by title, artist`,
      [userId],
    ),
    // a heart is a track the listener already knows, played or not
    query<{ title: string; artist: string }>("select title, artist from likes where user_id = $1", [userId]),
  ]);

  return {
    totalPlays: played.reduce((n, r) => n + r.plays, 0),
    artists,
    tracks,
    heard: new Set([...played, ...liked].map((r) => heardKey(r.title, r.artist))),
  };
}
