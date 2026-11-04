import { NextResponse } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { myWeeklyArtist } from "@/lib/db/weekly";
import type { Resolved } from "@/lib/spotify/tokens";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The signed-in listener's own Artist of the Week: who they played most this
 * week and which of that artist's songs. Last week's when this week has no plays
 * yet (`previous: true`). 404: no plays in either week. 401: not signed in, and
 * the screen shows the developer's pick instead.
 */
export async function GET() {
  try {
    const user = await signedInUser();
    const resolutions: Resolved[] = [];
    const pick = await myWeeklyArtist(user.id, resolutions);
    const res = pick
      ? NextResponse.json(pick, { headers: NO_STORE })
      : NextResponse.json({ error: "not_ready" }, { status: 404 });
    return withTokens(res, user.resolved, resolutions);
  } catch (e) {
    if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    if (e instanceof SpotifyApiError) {
      // Spotify is rate limiting this app: say so, the screen waits rather than reporting a broken server
      return NextResponse.json({ error: e.message, retryAfterSec: e.retryAfterSec }, { status: e.status === 429 ? 429 : 502 });
    }
    console.error("[me/weekly-artist]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
