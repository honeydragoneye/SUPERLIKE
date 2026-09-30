import { NextResponse } from "next/server";
import { resolveAccessToken, writeTokens } from "@/lib/spotify/tokens";

/**
 * The Web Playback SDK needs a bearer token in the browser, so this hands one
 * out — short-lived, refreshed here, never the refresh token itself.
 */
export async function GET() {
  try {
    const resolved = await resolveAccessToken();
    if (resolved.status === "none") {
      return NextResponse.json({ connected: false }, { status: 401 });
    }

    const res = NextResponse.json(
      {
        connected: true,
        accessToken: resolved.accessToken,
        expiresAt: resolved.expiresAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (resolved.status === "refreshed") writeTokens(res, resolved.tokens);
    return res;
  } catch (e) {
    return NextResponse.json(
      { connected: false, error: e instanceof Error ? e.message : "token_error" },
      { status: 401 },
    );
  }
}
