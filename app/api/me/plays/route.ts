import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { keepOwnerCopies } from "@/lib/db/owner";
import { DatabaseNotConfiguredError, query } from "@/lib/db/client";

const NO_STORE = { "Cache-Control": "no-store" };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One play: the track was heard past the threshold (see lib/plays).
 *
 * `day` is the listener's own calendar day, the same one the browser's tally
 * uses, so the weekly figure here agrees with the one on the home screen. It
 * is only accepted within a day of the server's clock either way: a wrong
 * value would put a play in a week it was not heard in.
 */
export async function POST(request: NextRequest) {
  let body: { trackId?: unknown; title?: unknown; artist?: unknown; artistId?: unknown; albumId?: unknown; day?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { trackId, title, artist, artistId, albumId, day } = body;
  // optional: plays sent before the id was kept have none
  const artistKey = typeof artistId === "string" && /^[A-Za-z0-9]{1,40}$/.test(artistId) ? artistId : null;
  const albumKey = typeof albumId === "string" && /^[A-Za-z0-9]{1,40}$/.test(albumId) ? albumId : null;
  const text = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  if (
    !text(trackId, 40) || !/^[A-Za-z0-9]+$/.test(trackId as string) ||
    !text(title, 300) || !text(artist, 300) ||
    typeof day !== "string" || !DAY.test(day) ||
    Math.abs(Date.parse(day) - Date.now()) > 2 * 24 * 60 * 60 * 1000
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const user = await signedInUser();
    await query(
      `insert into plays_daily (user_id, day, track_id, title, artist, artist_id, album_id, count)
       values ($1, $2::date, $3, $4, $5, $6, $7, 1)
       on conflict (user_id, day, track_id) do update
         set count = plays_daily.count + 1,
             artist_id = coalesce(plays_daily.artist_id, excluded.artist_id),
             album_id = coalesce(plays_daily.album_id, excluded.album_id)`,
      [user.id, day, trackId, title, artist, artistKey, albumKey],
    );
    // the developer's pick for the week may have just changed
    const more = await keepOwnerCopies(user.id);
    const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
    return withTokens(res, user.resolved, more);
  } catch (e) {
    if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("[plays]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
