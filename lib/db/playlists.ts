import { paletteFromImage } from "@/lib/palette-server";
import type { Palette } from "@/lib/palette";
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
  /** the colours of the first song's album, null while the playlist is empty */
  palette: Palette | null;
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

const httpUrl = (v: unknown): string | null => {
  const url = str(v, 500);
  return url && /^https:\/\//.test(url) ? url : null;
};

/**
 * The colours are read by fetching the cover, and the cover's address came from
 * the browser. Only Spotify's own image hosts are fetched, so a request cannot
 * make the server open anything else.
 */
function spotifyImage(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "scdn.co" || host.endsWith(".scdn.co") || host.endsWith(".spotifycdn.com");
  } catch {
    return false;
  }
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
    artwork: httpUrl(t.artwork),
    durationMs: Math.min(duration, 86_400_000),
    albumId: str(t.albumId, 40),
  };
}

/** The cover of the song that was added first, which is what colours the playlist. */
async function firstArtwork(playlistId: string): Promise<{ id: string; artwork: string | null } | null> {
  const [row] = await query<{ id: string; artwork: string | null }>(
    "select track_id as id, artwork from playlist_tracks where playlist_id = $1 order by added_at, track_id limit 1",
    [playlistId],
  );
  return row ?? null;
}

/** Works the colours out again from the first song, and stores them (or clears them when it is empty). */
async function refreshPalette(playlistId: string): Promise<Palette | null> {
  const first = await firstArtwork(playlistId);
  const palette =
    first?.artwork && spotifyImage(first.artwork)
      ? await paletteFromImage(first.artwork).catch(() => null)
      : null;
  await query("update playlists set palette = $2::jsonb where id = $1", [
    playlistId,
    palette ? JSON.stringify(palette) : null,
  ]);
  return palette;
}

/** Playlists made before covers had colours get theirs the first time they are listed. */
const BACKFILL_AT_A_TIME = 6;

export async function listPlaylists(userId: string, trackId: string | null): Promise<PlaylistSummary[]> {
  const rows = await query<PlaylistSummary>(
    `select p.id, p.name, p.is_public as "isPublic", p.updated_at as "updatedAt", p.palette,
            (select count(*)::int from playlist_tracks t where t.playlist_id = p.id) as count,
            exists (select 1 from playlist_tracks t where t.playlist_id = p.id and t.track_id = $2) as has
       from playlists p where p.user_id = $1 order by p.updated_at desc`,
    [userId, trackId],
  );
  const missing = rows.filter((r) => r.palette === null && r.count > 0).slice(0, BACKFILL_AT_A_TIME);
  await Promise.all(
    missing.map(async (r) => {
      r.palette = await refreshPalette(r.id).catch(() => null);
    }),
  );
  return rows;
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
  if (first) {
    await insertTrack(row.id, first);
    await refreshPalette(row.id);
  }
  return row.id;
}

/** False when the playlist is not this user's. Adding a song already in it is not an error. */
export async function addTrack(userId: string, id: string, track: PlaylistTrack): Promise<boolean> {
  if (!(await owns(userId, id))) return false;
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from playlist_tracks where playlist_id = $1", [id]);
  if (n >= MAX_TRACKS) throw new PlaylistLimitError("tracks");
  await insertTrack(id, track);
  // the first song colours the playlist, so only the song that makes it non-empty matters
  if (n === 0) await refreshPalette(id);
  return true;
}

export async function removeTrack(userId: string, id: string, trackId: string): Promise<boolean> {
  if (!(await owns(userId, id))) return false;
  const before = await firstArtwork(id);
  await query("delete from playlist_tracks where playlist_id = $1 and track_id = $2", [id, trackId]);
  await query("update playlists set updated_at = now() where id = $1", [id]);
  // taking out the first song moves the colours to whichever is first now (or to none)
  if (before?.id === trackId) await refreshPalette(id);
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
