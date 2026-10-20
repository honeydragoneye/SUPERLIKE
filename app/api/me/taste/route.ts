import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { MIN_PLAYS, TASTE_DAYS, tasteOf } from "@/lib/db/taste";
import { recommend, type Recommendation } from "@/lib/taste";

const NO_STORE = { "Cache-Control": "no-store" };

/** One round of picks is kept for a while: Last.fm is asked a dozen times to make it. */
const KEEP_MS = 30 * 60 * 1000;
const rounds = new Map<string, { at: number; recs: Recommendation[] }>();

/**
 * The signed-in listener's taste, and songs picked from it.
 *
 * `?recs=0` leaves the picks out (the chat only wants what was played);
 * `?round=N` asks for the N-th set of picks.
 *
 * The taste is the visitor's own and is computed here, on the server, from the
 * plays the database holds: nothing leaves for a model. Only the artist names
 * go to Last.fm, to ask who sounds alike.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const withRecs = params.get("recs") !== "0";
  const round = Math.min(Math.max(Number(params.get("round")) || 0, 0), 50);

  try {
    const user = await signedInUser();
    const taste = await tasteOf(user.id);
    const ready = taste.totalPlays >= MIN_PLAYS && taste.artists.length > 0;

    let recs: Recommendation[] = [];
    let recsError: string | null = null;
    if (ready && withRecs) {
      const key = `${user.id}:${round}:${taste.artists.slice(0, 2).map((a) => a.name).join("|")}`;
      const kept = rounds.get(key);
      if (kept && Date.now() - kept.at < KEEP_MS) {
        recs = kept.recs;
      } else {
        try {
          recs = await recommend(taste, round);
          if (recs.length) rounds.set(key, { at: Date.now(), recs });
        } catch (e) {
          console.error("[taste]", e);
          recsError = "recommend_failed";
        }
      }
    }

    const res = NextResponse.json(
      {
        ready,
        days: TASTE_DAYS,
        minPlays: MIN_PLAYS,
        totalPlays: taste.totalPlays,
        artists: taste.artists.slice(0, 5),
        ...(withRecs ? { recs, recsError } : { tracks: taste.tracks }),
      },
      { headers: NO_STORE },
    );
    return withTokens(res, user.resolved, []);
  } catch (e) {
    if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("[taste]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
