import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { lastChecked, listFollows, listUpdates, markRead, refreshReleases } from "@/lib/db/follows";

const NO_STORE = { "Cache-Control": "no-store" };

function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[updates]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/**
 * 소식: new releases of the artists the listener follows.
 *
 * `?refresh=1` first brings them up to date (at most one lookup per artist per
 * day, see lib/db/follows). `checkError` says something could not be asked;
 * what was already kept is returned either way.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await signedInUser();
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const clean = refresh ? await refreshReleases(user.id) : true;
    const [items, follows, checkedAt] = await Promise.all([listUpdates(user.id), listFollows(user.id), lastChecked(user.id)]);
    const body = {
      items,
      unread: items.filter((i) => i.unread).length,
      following: follows.length,
      checkedAt,
      checkError: !clean,
    };
    return withTokens(NextResponse.json(body, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** `{ action: "read", ids?: string[] }`: without ids, everything is marked read. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { action?: unknown; ids?: unknown } | null;
  if (body?.action !== "read") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((i): i is string => typeof i === "string" && /^\d{1,20}$/.test(i)).slice(0, 100)
    : null;
  try {
    const user = await signedInUser();
    await markRead(user.id, ids);
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
