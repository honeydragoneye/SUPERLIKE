import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, query } from "@/lib/db/client";
import { ownerId } from "@/lib/db/owner";
import type { AlbumPage } from "@/lib/data";
import type { Palette } from "@/lib/palette";
import { paletteFromImage } from "@/lib/palette-server";

type Row = {
  track_title: string;
  track_artist: string;
  liked_ms: string;
  album_id: string | null;
  data: (AlbumPage & { palette?: Palette | null }) | null;
};

/**
 * Editor's Pick: the album of the song the developer hearted most recently.
 *
 * Public on purpose — it is what a visitor who has not connected Spotify sees.
 * The album is the copy saved while the developer was signed in (lib/db/owner),
 * so nothing here talks to Spotify. 404 means nothing has been picked yet or the
 * copy has not been made; the screen says so instead of showing a stand-in.
 */
export async function GET() {
  const owner = ownerId();
  if (!owner) return NextResponse.json({ error: "owner_not_set" }, { status: 404 });
  try {
    const [row] = await query<Row>(
      `select l.title as track_title, l.artist as track_artist,
              (extract(epoch from l.liked_at) * 1000)::bigint::text as liked_ms,
              l.album_id, c.data
         from likes l left join album_cache c on c.album_id = l.album_id
        where l.user_id = $1
        order by l.liked_at desc limit 1`,
      [owner],
    );
    if (!row || !row.data) return NextResponse.json({ error: "not_ready" }, { status: 404 });

    // a copy made before colours were kept gets them now, once, and keeps them
    const { palette: kept, ...album } = row.data;
    let palette = kept ?? null;
    if (!palette && album.artwork && row.album_id) {
      palette = await paletteFromImage(album.artwork).catch(() => null);
      if (palette) {
        await query(
          `update album_cache set data = data || jsonb_build_object('palette', $2::jsonb) where album_id = $1`,
          [row.album_id, JSON.stringify(palette)],
        );
      }
    }
    return NextResponse.json(
      {
        track: { title: row.track_title, artist: row.track_artist, likedAt: Number(row.liked_ms) },
        album,
        palette,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    console.error("[editors-pick]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
