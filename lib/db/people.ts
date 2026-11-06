import { query } from "./client";
import { firstArtist } from "./taste";

/**
 * People following people.
 *
 * Everyone who has signed in to Superlike is in `users`; with Spotify's
 * development mode that is at most five accounts, so the whole list is small
 * and is handed over at once. What a follower may see of someone is that
 * person's choice (`share_activity`, off until they turn it on), and is only
 * ever read through `profileOf`, which checks it on the server.
 */

export type Person = {
  id: string;
  name: string;
  /** the signed-in listener follows them */
  following: boolean;
  /** they follow the signed-in listener */
  followsMe: boolean;
  /** they let their followers see what they listen to */
  shared: boolean;
  /** the album they played last: only when they share and the listener follows them */
  recent: string | null;
};

export class PersonError extends Error {
  constructor(readonly code: "not_found" | "self") {
    super(code);
    this.name = "PersonError";
  }
}

/** Spotify account ids: letters, digits and a few marks, never anything a query could mistake. */
export const isUserId = (v: unknown): v is string => typeof v === "string" && /^[\w.\-~%+:]{1,128}$/.test(v);

/** Everyone else who has signed in, the ones the listener follows first. */
export async function listPeople(me: string): Promise<Person[]> {
  return query<Person>(
    `select u.spotify_id as id, u.display_name as name,
            (f1.target_id is not null) as following,
            (f2.follower_id is not null) as "followsMe",
            u.share_activity as shared,
            case when u.share_activity and f1.target_id is not null
                 then (select d.album_name from plays_daily d
                        where d.user_id = u.spotify_id and d.album_id is not null and d.album_name is not null
                        order by coalesce(d.last_played_at, d.day::timestamptz) desc limit 1)
            end as recent
       from users u
       left join user_follows f1 on f1.follower_id = $1 and f1.target_id = u.spotify_id
       left join user_follows f2 on f2.follower_id = u.spotify_id and f2.target_id = $1
      where u.spotify_id <> $1
      order by (f1.target_id is not null) desc, (f2.follower_id is not null) desc, u.display_name`,
    [me],
  );
}

export async function followPerson(me: string, target: string): Promise<void> {
  if (me === target) throw new PersonError("self");
  const found = await query("select 1 from users where spotify_id = $1", [target]);
  if (found.length === 0) throw new PersonError("not_found");
  await query(
    "insert into user_follows (follower_id, target_id) values ($1, $2) on conflict do nothing",
    [me, target],
  );
}

export async function unfollowPerson(me: string, target: string): Promise<void> {
  await query("delete from user_follows where follower_id = $1 and target_id = $2", [me, target]);
}

export async function getShare(me: string): Promise<boolean> {
  const [row] = await query<{ on: boolean }>("select share_activity as on from users where spotify_id = $1", [me]);
  return row?.on === true;
}

export async function setShare(me: string, on: boolean): Promise<void> {
  await query("update users set share_activity = $2 where spotify_id = $1", [me, on]);
}

export type ProfileSong = { id: string; uri: string; title: string; artist: string; artwork: string | null; durationMs: number };

/** An album they played lately. */
export type ProfileAlbum = { id: string; name: string; artist: string; artwork: string | null };

/** A playlist they made public, with its songs. */
export type ProfilePlaylist = { id: string; name: string; count: number; tracks: ProfileSong[] };

export type Profile = {
  id: string;
  name: string;
  /** the listener's own page */
  self: boolean;
  followers: number;
  following: number;
  iFollow: boolean;
  followsMe: boolean;
  /** whether this person shares what they listen to at all */
  shared: boolean;
  /** what is below is filled in: it is the listener's own page, or they share and the listener follows */
  visible: boolean;
  /** the albums of the songs they played most recently, newest first */
  albums: ProfileAlbum[];
  /** the playlists they marked public: a playlist set to private is never here */
  playlists: ProfilePlaylist[];
  /** the artist they played most in the last seven days */
  weeklyArtist: { name: string; plays: number } | null;
};

/** How many albums, playlists, and songs of a playlist a page holds. */
const ALBUMS = 10;
const PLAYLISTS = 12;
const PLAYLIST_SONGS = 100;

/** One person's page, or null when there is no such account. What they listen to is left out unless they share it with this follower. */
export async function profileOf(me: string, id: string): Promise<Profile | null> {
  const [u] = await query<{ id: string; name: string; shared: boolean }>(
    "select spotify_id as id, display_name as name, share_activity as shared from users where spotify_id = $1",
    [id],
  );
  if (!u) return null;
  const [n] = await query<{ followers: number; following: number; iFollow: boolean; followsMe: boolean }>(
    `select (select count(*)::int from user_follows where target_id = $2) as followers,
            (select count(*)::int from user_follows where follower_id = $2) as following,
            exists (select 1 from user_follows where follower_id = $1 and target_id = $2) as "iFollow",
            exists (select 1 from user_follows where follower_id = $2 and target_id = $1) as "followsMe"`,
    [me, id],
  );
  const self = me === id;
  const visible = self || (u.shared && n.iFollow);
  const base: Profile = {
    id: u.id,
    name: u.name,
    self,
    followers: n.followers,
    following: n.following,
    iFollow: n.iFollow,
    followsMe: n.followsMe,
    shared: u.shared,
    visible,
    albums: [],
    playlists: [],
    weeklyArtist: null,
  };
  if (!visible) return base;

  const [albums, lists, week] = await Promise.all([
    // plays_daily keeps the album of every play heard in Superlike; plays from before it did have none and are left out
    query<ProfileAlbum>(
      `select album_id as id, max(album_name) as name,
              (array_agg(artist order by coalesce(last_played_at, day::timestamptz) desc))[1] as artist,
              max(album_artwork) as artwork
         from plays_daily where user_id = $1 and album_id is not null and album_name is not null
        group by album_id order by max(coalesce(last_played_at, day::timestamptz)) desc limit ${ALBUMS}`,
      [id],
    ),
    query<{ id: string; name: string; count: number }>(
      `select p.id, p.name, (select count(*)::int from playlist_tracks t where t.playlist_id = p.id) as count
         from playlists p where p.user_id = $1 and p.is_public order by p.updated_at desc limit ${PLAYLISTS}`,
      [id],
    ),
    query<{ artist: string; plays: number }>(
      `select artist, sum(count)::int as plays from plays_daily
        where user_id = $1 and day > (now() at time zone 'Asia/Seoul')::date - 7
        group by artist order by plays desc limit 20`,
      [id],
    ),
  ]);
  const songs = lists.length
    ? await query<ProfileSong & { playlistId: string }>(
        `select playlist_id as "playlistId", track_id as id, uri, title, artist, artwork, duration_ms as "durationMs"
           from (select t.*, row_number() over (partition by playlist_id order by added_at, track_id) as n
                   from playlist_tracks t where playlist_id = any($1::uuid[])) x
          where n <= ${PLAYLIST_SONGS} order by playlist_id, n`,
        [lists.map((l) => l.id)],
      )
    : [];
  const playlists = lists.map((l) => ({
    ...l,
    tracks: songs.filter((t) => t.playlistId === l.id).map((t) => ({ id: t.id, uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs })),
  }));
  // plays_daily keeps the artist string of each song: count by the first artist named
  const tally = new Map<string, number>();
  for (const w of week) tally.set(firstArtist(w.artist), (tally.get(firstArtist(w.artist)) ?? 0) + w.plays);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return { ...base, albums, playlists, weeklyArtist: top ? { name: top[0], plays: top[1] } : null };
}
