import { artistTopTags, artistTopTracks } from "@/lib/lastfm/client";
import { paletteFromImage } from "@/lib/palette-server";
import { spotifyGet } from "@/lib/spotify/api";
import type { Resolved } from "@/lib/spotify/tokens";
import type { Palette } from "@/lib/palette";
import { query } from "./client";

/**
 * Artist of the Week: the artist the developer played most this week.
 *
 * A week starts on Monday, in the storefront's calendar (Asia/Seoul), the same
 * boundary the play tally uses. Plays are counted by the first artist Spotify
 * names for a track; ties go to whoever was played last.
 *
 * Like the album behind Editor's Pick, the artist's details are saved while the
 * developer is signed in, because Spotify answers only with a listener's token.
 * Visitors are served the saved row.
 */
const THIS_WEEK = "date_trunc('week', now() at time zone 'Asia/Seoul')::date";

type Top = { artist_id: string | null; name: string; plays: number };

async function topOfWeek(userId: string, weekStart: string): Promise<Top | null> {
  const [row] = await query<Top>(
    `select max(artist_id) as artist_id,
            (array_agg(artist order by day desc))[1] as name,
            sum(count)::int as plays
       from plays_daily
      where user_id = $1 and day >= $2::date and day < $2::date + 7
      group by coalesce(artist_id, artist)
      order by plays desc, max(day) desc
      limit 1`,
    [userId, weekStart],
  );
  return row ?? null;
}

type RawImage = { url: string; width: number | null };
type RawArtist = { id: string; name: string; images?: RawImage[]; genres?: string[] };

function pickImage(images: RawImage[] | undefined, atLeast: number): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= atLeast) ?? sorted[sorted.length - 1]).url;
}

/** Plays stored before artist ids were kept have only a name: ask Spotify who it is, once, and remember. */
async function findArtistId(userId: string, name: string, resolutions: Resolved[]): Promise<string | null> {
  // "A, B" is a track by two: the first one is the artist the play is counted for
  const first = name.split(", ")[0];
  const { data, resolved } = await spotifyGet<{ artists?: { items?: RawArtist[] } }>(
    `/search?q=${encodeURIComponent(first)}&type=artist&limit=5`,
  );
  resolutions.push(resolved);
  const items = data.artists?.items ?? [];
  const hit = items.find((a) => a.name.toLowerCase() === first.toLowerCase()) ?? items[0];
  if (!hit) return null;
  await query(
    `update plays_daily set artist_id = $3
      where user_id = $1 and artist_id is null and (artist = $2 or artist like $2 || ', %')`,
    [userId, first, hit.id],
  );
  return hit.id;
}

/**
 * Keeps this week's row up to date. Cheap when nothing changed: one query
 * for the week's top artist and one for the saved row, and Spotify is only
 * asked when the artist or the count differs from what is saved.
 *
 * Returns the token resolutions it caused so the route can flush a refreshed
 * token onto its response.
 */
export async function keepWeeklyArtist(userId: string): Promise<Resolved[]> {
  const resolutions: Resolved[] = [];
  const [{ week_start }] = await query<{ week_start: string }>(`select ${THIS_WEEK}::text as week_start`);
  const top = await topOfWeek(userId, week_start);
  if (!top) return resolutions;

  const [saved] = await query<{ artist_id: string; plays: number; palette: Palette | null }>(
    "select artist_id, plays, palette from weekly_picks where week_start = $1::date",
    [week_start],
  );
  if (saved && saved.plays === top.plays && saved.palette && (!top.artist_id || saved.artist_id === top.artist_id)) {
    return resolutions;
  }

  const artistId = top.artist_id ?? (await findArtistId(userId, top.name, resolutions));
  if (!artistId) return resolutions;

  const { data: artist, resolved } = await spotifyGet<RawArtist>(`/artists/${artistId}`);
  resolutions.push(resolved);
  const image = pickImage(artist.images, 320);

  // Spotify no longer gives this app genres or top tracks, so Last.fm fills both (same as the artist screen)
  const [tags, tracks, palette] = await Promise.all([
    artist.genres?.length ? Promise.resolve(artist.genres.slice(0, 4)) : artistTopTags(artist.name, 4).catch(() => []),
    artistTopTracks(artist.name, 8).catch(() => []),
    image ? paletteFromImage(image).catch(() => null) : Promise.resolve(null),
  ]);

  await query(
    `insert into weekly_picks (week_start, artist_id, name, image, genres, top_tracks, palette, plays)
     values ($1::date, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
     on conflict (week_start) do update set
       artist_id = excluded.artist_id, name = excluded.name, image = excluded.image,
       genres = excluded.genres, top_tracks = excluded.top_tracks, palette = excluded.palette,
       plays = excluded.plays, computed_at = now()`,
    [
      week_start,
      artist.id,
      artist.name,
      image,
      JSON.stringify(tags),
      JSON.stringify(tracks.map((t) => ({ title: t.name }))),
      palette ? JSON.stringify(palette) : null,
      top.plays,
    ],
  );
  return resolutions;
}

export type WeeklyArtist = {
  artist: { id: string; name: string; image: string | null; genres: string[]; topTracks: { title: string }[]; palette: Palette | null };
  plays: number;
  /** true when this is last week's pick because nothing has been saved for this week yet */
  previous: boolean;
  heard: { title: string; count: number }[];
};

/** The saved pick for this week, or the latest earlier one; null when there never was one. */
export async function weeklyArtist(ownerId: string): Promise<WeeklyArtist | null> {
  const [row] = await query<{
    week_start: string; is_current: boolean; artist_id: string; name: string; image: string | null;
    genres: string[]; top_tracks: { title: string }[]; palette: Palette | null; plays: number;
  }>(
    `select week_start::text, (week_start = ${THIS_WEEK}) as is_current, artist_id, name, image,
            genres, top_tracks, palette, plays
       from weekly_picks order by week_start desc limit 1`,
  );
  if (!row) return null;
  const heard = await query<{ title: string; count: number }>(
    `select title, sum(count)::int as count
       from plays_daily
      where user_id = $1 and day >= $2::date and day < $2::date + 7
        and (artist_id = $3 or artist = $4 or artist like $4 || ', %')
      group by title order by count desc, title limit 10`,
    [ownerId, row.week_start, row.artist_id, row.name],
  );
  return {
    artist: { id: row.artist_id, name: row.name, image: row.image, genres: row.genres, topTracks: row.top_tracks, palette: row.palette },
    plays: row.plays,
    previous: !row.is_current,
    heard,
  };
}
