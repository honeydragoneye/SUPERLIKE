import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { albumTitles } from "@/lib/spotify/artist-titles";
import { FollowLimitError, followArtist, listFollows, unfollowArtist } from "@/lib/db/follows";

const NO_STORE = { "Cache-Control": "no-store" };

function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof FollowLimitError) return NextResponse.json({ error: "follows_limit" }, { status: 409 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[artist-follows]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/** The artists the signed-in listener follows, the one with the newest release first. */
export async function GET() {
  try {
    const user = await signedInUser();
    const artists = await listFollows(user.id);
    return withTokens(NextResponse.json({ artists }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

const ID = /^[A-Za-z0-9]{10,40}$/;
const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;

/** `{ action: "follow" | "unfollow", artist: { id, name, image? } }`. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; artist?: Record<string, unknown> }
    | null;
  const a = body?.artist ?? {};
  const id = typeof a.id === "string" && ID.test(a.id) ? a.id : null;
  const action = body?.action;
  if (!id || (action !== "follow" && action !== "unfollow")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const user = await signedInUser();
    if (action === "unfollow") {
      await unfollowArtist(user.id, id);
    } else {
      const name = str(a.name, 200);
      if (!name) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const image = typeof a.image === "string" && a.image.startsWith("https://") ? a.image.slice(0, 500) : null;
      await followArtist(user.id, { id, name, image }, () => albumTitles(id));
    }
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
