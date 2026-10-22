import { NextResponse, type NextRequest } from "next/server";
import { signedInUser, withTokens } from "@/lib/db/account";
import { cleanName, deletePlaylist, getPlaylist, isPlaylistId, updatePlaylist } from "@/lib/db/playlists";
import { failure } from "../route";

const NO_STORE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/** One playlist with its songs, if it is the signed-in listener's. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isPlaylistId(id)) return notFound();
  try {
    const user = await signedInUser();
    const playlist = await getPlaylist(user.id, id);
    if (!playlist) return notFound();
    return withTokens(NextResponse.json(playlist, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** `{ name?, isPublic? }`: renames it or changes who may see it. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isPlaylistId(id)) return notFound();
  const body = (await request.json().catch(() => null)) as { name?: unknown; isPublic?: unknown } | null;
  const name = body?.name === undefined ? undefined : cleanName(body.name);
  if (name === null) return NextResponse.json({ error: "bad_name" }, { status: 400 });
  const isPublic = typeof body?.isPublic === "boolean" ? body.isPublic : undefined;
  if (name === undefined && isPublic === undefined) {
    return NextResponse.json({ error: "nothing_to_change" }, { status: 400 });
  }
  try {
    const user = await signedInUser();
    if (!(await updatePlaylist(user.id, id, { name, isPublic }))) return notFound();
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isPlaylistId(id)) return notFound();
  try {
    const user = await signedInUser();
    await deletePlaylist(user.id, id);
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
