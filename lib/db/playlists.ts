import { query } from "./client";

/** What one account may keep, so a script cannot fill the table. */
export const MAX_PLAYLISTS = 50;
export const MAX_TRACKS = 500;
const NAME_LENGTH = 60;

/** One song as a playlist keeps it. */
export type PlaylistTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
  albumId: string | null;
};

export type PlaylistSummary = {
  id: string;
  name: string;
  isPublic: boolean;
  count: number;
  /** up to four covers, for the mosaic */
  covers: string[];
  /** whether the track asked about is already in it */
  has: boolean;
  updatedAt: string;
};

export type PlaylistDetail = {
  id: string;
  name: string;
  isPublic: boolean;
  tracks: PlaylistTrack[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPlaylistId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

export class PlaylistLimitError extends Error {}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

/** A name as the listener typed it, tidied; null when nothing is left of it. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH);
  return name || null;
}

/** Only what a Spotify track row has; anything else in the body is dropped. */
export function cleanTrack(raw: unknown): PlaylistTrack | null {
  const t = (raw ?? {}) as Record<string, unknown>;
  const id = str(t.id, 40);
  const uri = str(t.uri, 80);
  const title = str(t.title, 300);
  if (!id || !uri || !title || uri !== `spotify:track:${id}`) return null;
  const duration = typeof t.durationMs === "number" && t.durationMs >= 0 ? Math.round(t.durationMs) : 0;
  return {
    id,
    uri,
    title,
    artist: typeof t.artist === "string" ? t.artist.slice(0, 300) : "",
    artwork: str(t.artwork, 500),
    durationMs: Math.min(duration, 86_400_000),
    albumId: str(t.albumId, 40),
  };
}

export async function listPlaylists(userId: string, trackId: string | null): Promise<PlaylistSummary[]> {
  return query<PlaylistSummary>(
    `select p.id, p.name, p.is_public as "isPublic", p.updated_at as "updatedAt",
            (select count(*)::int from playlist_tracks t where t.playlist_id = p.id) as count,
            array(select t.artwork from playlist_tracks t
                   where t.playlist_id = p.id and t.artwork is not null
                   order by t.added_at limit 4) as covers,
            exists (select 1 from playlist_tracks t where t.playlist_id = p.id and t.track_id = $2) as has
       from playlists p where p.user_id = $1 order by p.updated_at desc`,
    [userId, trackId],
  );
}

async function owns(userId: string, id: string): Promise<boolean> {
  const rows = await query("select 1 from playlists where id = $1 and user_id = $2", [id, userId]);
  return rows.length > 0;
}

export async function getPlaylist(userId: string, id: string): Promise<PlaylistDetail | null> {
  const [head] = await query<{ id: string; name: string; isPublic: boolean }>(
    `select id, name, is_public as "isPublic" from playlists where id = $1 and user_id = $2`,
    [id, userId],
  );
  if (!head) return null;
  const tracks = await query<PlaylistTrack>(
    `select track_id as id, uri, title, artist, artwork, duration_ms as "durationMs", album_id as "albumId"
       from playlist_tracks where playlist_id = $1 order by added_at, track_id`,
    [id],
  );
  return { ...head, tracks };
}

async function insertTrack(playlistId: string, t: PlaylistTrack): Promise<void> {
  await query(
    `insert into playlist_tracks (playlist_id, track_id, uri, title, artist, artwork, duration_ms, album_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
    [playlistId, t.id, t.uri, t.title, t.artist, t.artwork, t.durationMs, t.albumId],
  );
  await query("update playlists set updated_at = now() where id = $1", [playlistId]);
}

/** Makes a playlist, with `first` already in it when the listener started it from a song. */
export async function createPlaylist(
  userId: string,
  name: string,
  isPublic: boolean,
  first: PlaylistTrack | null,
): Promise<string> {
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from playlists where user_id = $1", [userId]);
  if (n >= MAX_PLAYLISTS) throw new PlaylistLimitError("playlists");
  const [row] = await query<{ id: string }>(
    "insert into playlists (user_id, name, is_public) values ($1, $2, $3) returning id",
    [userId, name, isPublic],
  );
  if (first) await insertTrack(row.id, first);
  return row.id;
}

/** False when the playlist is not this user's. Adding a song already in it is not an error. */
export async function addTrack(userId: string, id: string, track: PlaylistTrack): Promise<boolean> {
  if (!(await owns(userId, id))) return false;
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from playlist_tracks where playlist_id = $1", [id]);
  if (n >= MAX_TRACKS) throw new PlaylistLimitError("tracks");
  await insertTrack(id, track);
  return true;
}

export async function removeTrack(userId: string, id: string, trackId: string): Promise<boolean> {
  if (!(await owns(userId, id))) return false;
  await query("delete from playlist_tracks where playlist_id = $1 and track_id = $2", [id, trackId]);
  await query("update playlists set updated_at = now() where id = $1", [id]);
  return true;
}

export async function updatePlaylist(
  userId: string,
  id: string,
  patch: { name?: string; isPublic?: boolean },
): Promise<boolean> {
  const rows = await query(
    `update playlists set name = coalesce($3, name), is_public = coalesce($4, is_public), updated_at = now()
      where id = $1 and user_id = $2 returning id`,
    [id, userId, patch.name ?? null, patch.isPublic ?? null],
  );
  return rows.length > 0;
}

export async function deletePlaylist(userId: string, id: string): Promise<void> {
  await query("delete from playlists where id = $1 and user_id = $2", [id, userId]);
}
