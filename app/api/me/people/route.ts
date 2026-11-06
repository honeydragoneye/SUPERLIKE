import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { PersonError, followPerson, getShare, isUserId, listPeople, setShare, unfollowPerson } from "@/lib/db/people";

const NO_STORE = { "Cache-Control": "no-store" };

export function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof PersonError) return NextResponse.json({ error: e.code }, { status: e.code === "self" ? 400 : 404 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[people]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/** The other accounts that have signed in, with who follows whom, whether the listener shares their own activity, and who the listener is. */
export async function GET() {
  try {
    const user = await signedInUser();
    const [people, share] = await Promise.all([listPeople(user.id), getShare(user.id)]);
    return withTokens(NextResponse.json({ people, share, me: { id: user.id, name: user.name } }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** `{ action: "follow" | "unfollow", id }` or `{ action: "share", on: boolean }`. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { action?: unknown; id?: unknown; on?: unknown } | null;
  const action = body?.action;
  const valid =
    ((action === "follow" || action === "unfollow") && isUserId(body?.id)) || (action === "share" && typeof body?.on === "boolean");
  if (!valid) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const user = await signedInUser();
    if (action === "share") await setShare(user.id, body?.on === true);
    else if (action === "follow") await followPerson(user.id, body?.id as string);
    else await unfollowPerson(user.id, body?.id as string);
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
