import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { keepOwnerCopies } from "@/lib/db/owner";
import { DatabaseNotConfiguredError, query } from "@/lib/db/client";

type Row = {
  track_id: string;
  album_id: string | null;
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  duration_ms: number;
  liked_ms: string;
};

const NO_STORE = { "Cache-Control": "no-store" };

function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[likes]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/** The signed-in listener's hearts, newest first, in the shape lib/likes keeps them. */
export async function GET() {
  try {
    const user = await signedInUser();
    const rows = await query<Row>(
      `select track_id, album_id, uri, title, artist, artwork, duration_ms,
              (extract(epoch from liked_at) * 1000)::bigint::text as liked_ms
         from likes where user_id = $1 order by liked_at desc limit 500`,
      [user.id],
    );
    const more = await keepOwnerCopies(user.id);
    const res = NextResponse.json(
      {
        tracks: rows.map((r) => ({
          id: r.track_id,
          albumId: r.album_id,
          uri: r.uri,
          title: r.title,
          artist: r.artist,
          artwork: r.artwork,
          durationMs: r.duration_ms,
          at: Number(r.liked_ms),
        })),
      },
      { headers: NO_STORE },
    );
    return withTokens(res, user.resolved, more);
  } catch (e) {
    return failure(e);
  }
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

/** Marks or unmarks one track. `at` keeps the original time when older hearts are brought over. */
export async function POST(request: NextRequest) {
  let body: { liked?: unknown; track?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const t = body.track ?? {};
  const id = str(t.id, 40);
  if (!id || !/^[A-Za-z0-9]+$/.test(id) || typeof body.liked !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const user = await signedInUser();
    if (!body.liked) {
      await query("delete from likes where user_id = $1 and track_id = $2", [user.id, id]);
    } else {
      const title = str(t.title, 300);
      const artist = str(t.artist, 300);
      const uri = str(t.uri, 100);
      if (!title || !artist || !uri) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const album = str(t.albumId, 40);
      const at = typeof t.at === "number" && t.at > 0 && t.at <= Date.now() ? t.at : Date.now();
      await query(
        `insert into likes (user_id, track_id, album_id, uri, title, artist, artwork, duration_ms, liked_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))
         on conflict (user_id, track_id) do update
           set album_id = coalesce(excluded.album_id, likes.album_id)`,
        [
          user.id,
          id,
          album && /^[A-Za-z0-9]+$/.test(album) ? album : null,
          uri,
          title,
          artist,
          str(t.artwork, 500),
          Number.isFinite(t.durationMs) ? Math.max(0, Math.round(t.durationMs as number)) : 0,
          at,
        ],
      );
    }
    const more = body.liked ? await keepOwnerCopies(user.id) : [];
    const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
    return withTokens(res, user.resolved, more);
  } catch (e) {
    return failure(e);
  }
}
