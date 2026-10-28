import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { addFavorite, FavoriteLimitError, listFavorites, notePlayed, removeFavorite } from "@/lib/db/radio";
import { UUID, siteRoot } from "@/lib/radio/client";

const NO_STORE = { "Cache-Control": "no-store" };

function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof FavoriteLimitError) return NextResponse.json({ error: "favorites_limit" }, { status: 409 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[radio]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/** The signed-in listener's hearted stations, the one heard last first. */
export async function GET() {
  try {
    const user = await signedInUser();
    const stations = await listFavorites(user.id);
    return withTokens(NextResponse.json({ stations }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

/**
 * `{ action: "add" | "remove" | "played", station }`.
 *
 * "played" stamps a hearted station with the time it was last heard, which is
 * what orders the list; for a station that is not hearted it does nothing.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; station?: Record<string, unknown> }
    | null;
  const s = body?.station ?? {};
  const uuid = typeof s.uuid === "string" && UUID.test(s.uuid) ? s.uuid : null;
  const action = body?.action;
  if (!uuid || (action !== "add" && action !== "remove" && action !== "played")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const user = await signedInUser();
    if (action === "remove") {
      await removeFavorite(user.id, uuid);
    } else if (action === "played") {
      await notePlayed(user.id, uuid);
    } else {
      const name = str(s.name, 120);
      if (!name) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      await addFavorite(user.id, {
        uuid,
        name,
        country: str(s.country, 80) ?? "",
        countryCode: (str(s.countryCode, 2) ?? "").toUpperCase(),
        tags: Array.isArray(s.tags)
          ? s.tags.filter((t): t is string => typeof t === "string" && t.length <= 40).slice(0, 8)
          : [],
        homepage: siteRoot(s.homepage),
        favicon: typeof s.favicon === "string" && s.favicon.startsWith("https://") ? s.favicon.slice(0, 500) : null,
      });
    }
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
