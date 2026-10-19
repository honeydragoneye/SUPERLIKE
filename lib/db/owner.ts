import { MARKET, spotifyGet } from "@/lib/spotify/api";
import { fetchAlbumPage } from "@/lib/spotify/album";
import type { Resolved } from "@/lib/spotify/tokens";
import { paletteFromImage } from "@/lib/palette-server";
import { query } from "./client";

/**
 * The developer's account, named in OWNER_SPOTIFY_ID.
 *
 * Editor's Pick and Artist of the Week are the developer's own taste shown to
 * everyone, so they read this one account's rows. Nothing here is a privilege:
 * anyone else's likes and plays are stored the same way and are simply not shown.
 */
export function ownerId(): string | null {
  return process.env.OWNER_SPOTIFY_ID?.trim() || null;
}

export function isOwner(userId: string): boolean {
  const owner = ownerId();
  return owner !== null && owner === userId;
}

/**
 * Makes sure the developer's latest heart has its album saved for visitors.
 *
 * Spotify answers only with a listener's token (the app has no client secret),
 * so the copy has to be made while the developer is signed in — which is why this
 * runs inside their own requests. It also repairs hearts made before album ids
 * were kept: the track is asked for its album once, and the id written back.
 *
 * Returns the token resolutions it caused, so the route can flush a refreshed
 * token onto its response (Spotify refresh tokens are single use).
 */
export async function keepLatestAlbum(userId: string): Promise<Resolved[]> {
  const resolutions: Resolved[] = [];
  const [latest] = await query<{ track_id: string; album_id: string | null }>(
    "select track_id, album_id from likes where user_id = $1 order by liked_at desc limit 1",
    [userId],
  );
  if (!latest) return resolutions;

  let albumId = latest.album_id;
  if (!albumId) {
    const { data, resolved } = await spotifyGet<{ album: { id: string } }>(
      `/tracks/${latest.track_id}?market=${MARKET}`,
    );
    resolutions.push(resolved);
    albumId = data.album.id;
    await query("update likes set album_id = $3 where user_id = $1 and track_id = $2", [
      userId,
      latest.track_id,
      albumId,
    ]);
  }

  const [have] = await query("select 1 from album_cache where album_id = $1", [albumId]);
  if (have) return resolutions;

  const { page, resolved } = await fetchAlbumPage(albumId);
  resolutions.push(resolved);
  // the colours of the cover are worked out once, here, and kept with the album
  const palette = page.artwork ? await paletteFromImage(page.artwork).catch(() => null) : null;
  await query(
    `insert into album_cache (album_id, data) values ($1, $2::jsonb)
     on conflict (album_id) do update set data = excluded.data, fetched_at = now()`,
    [albumId, JSON.stringify({ ...page, palette })],
  );
  return resolutions;
}
