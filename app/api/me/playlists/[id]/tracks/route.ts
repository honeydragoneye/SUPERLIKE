import { NextResponse, type NextRequest } from "next/server";
import { signedInUser, withTokens } from "@/lib/db/account";
import { addTrack, cleanTrack, isPlaylistId, removeTrack } from "@/lib/db/playlists";
import { failure } from "../../route";

const NO_STORE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/** `{ track }`: adds a song. Adding one that is already in the playlist changes nothing. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isPlaylistId(id)) return notFound();
  const body = (await request.json().catch(() => null)) as { track?: unknown } | null;
  const track = cleanTrack(body?.track);
  if (!track) return NextResponse.json({ error: "bad_track" }, { status: 400 });
  try {
    const user = await signedInUser();
    if (!(await addTrack(user.id, id, track))) return notFound();
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** `{ trackId }`: takes a song out. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isPlaylistId(id)) return notFound();
  const body = (await request.json().catch(() => null)) as { trackId?: unknown } | null;
  const trackId = typeof body?.trackId === "string" && body.trackId.length <= 40 ? body.trackId : null;
  if (!trackId) return NextResponse.json({ error: "bad_track" }, { status: 400 });
  try {
    const user = await signedInUser();
    if (!(await removeTrack(user.id, id, trackId))) return notFound();
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
