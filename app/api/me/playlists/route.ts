import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { cleanName, cleanTrack, createPlaylist, listPlaylists, PlaylistLimitError } from "@/lib/db/playlists";

const NO_STORE = { "Cache-Control": "no-store" };

export function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof PlaylistLimitError) return NextResponse.json({ error: `${e.message}_limit` }, { status: 409 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[playlists]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/**
 * The signed-in listener's playlists, newest change first. `?track=<id>` marks
 * which of them already hold that song, for the "담기" list.
 *
 * Every query is scoped to `user.id`, which the server read from the Spotify
 * session: nothing the browser sends can name another account's rows.
 */
export async function GET(request: NextRequest) {
  const track = request.nextUrl.searchParams.get("track");
  try {
    const user = await signedInUser();
    const playlists = await listPlaylists(user.id, track && track.length <= 40 ? track : null);
    return withTokens(NextResponse.json({ playlists }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** `{ name, isPublic?, track? }`: makes a playlist, with `track` as its first song. Answers with its id. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; isPublic?: unknown; track?: unknown }
    | null;
  const name = cleanName(body?.name);
  if (!name) return NextResponse.json({ error: "bad_name" }, { status: 400 });
  const track = body?.track == null ? null : cleanTrack(body.track);
  if (body?.track != null && !track) return NextResponse.json({ error: "bad_track" }, { status: 400 });

  try {
    const user = await signedInUser();
    const id = await createPlaylist(user.id, name, body?.isPublic === true, track);
    return withTokens(NextResponse.json({ id }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
