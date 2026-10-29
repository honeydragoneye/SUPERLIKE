import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { MIN_PLAYS, tasteOf } from "@/lib/db/taste";
import { favoriteIds } from "@/lib/db/radio";
import { recommendStations, tasteTags, type RadioPicks } from "@/lib/radio/recommend";

const NO_STORE = { "Cache-Control": "no-store" };

/** A listener's genres change slowly, and finding them asks Last.fm once per artist. */
const KEEP_MS = 30 * 60 * 1000;
const kept = new Map<string, { at: number; tags: string[] }>();

/**
 * Radio stations picked from what the signed-in listener has been playing.
 *
 * `ready: false` says there is not enough listening yet to say what they like
 * (the same floor the home taste uses), as opposed to a failure.
 * `?round=N` asks for the N-th set, for "다시 추천". Stations the listener has
 * hearted are not offered: they are played from the 즐겨찾기 tab.
 */
export async function GET(request: NextRequest) {
  const round = Math.min(Math.max(Number(request.nextUrl.searchParams.get("round")) || 0, 0), 50);
  try {
    const user = await signedInUser();

    let tags: string[];
    const hit = kept.get(user.id);
    if (hit && Date.now() - hit.at < KEEP_MS) {
      tags = hit.tags;
    } else {
      const taste = await tasteOf(user.id);
      if (taste.totalPlays < MIN_PLAYS || taste.artists.length === 0) {
        return withTokens(NextResponse.json({ ready: false, tags: [], stations: [] }, { headers: NO_STORE }), user.resolved, []);
      }
      tags = await tasteTags(taste);
      if (tags.length) kept.set(user.id, { at: Date.now(), tags });
    }

    const stations = tags.length ? await recommendStations(tags, round, await favoriteIds(user.id)) : [];
    const body: RadioPicks & { ready: boolean } = { ready: true, tags, stations };
    return withTokens(NextResponse.json(body, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("[radio/recommend]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
