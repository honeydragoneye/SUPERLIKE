import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, SPOTIFY_SCOPES, clientId, redirectUri } from "@/lib/spotify/config";
import { challengeFor, randomVerifier } from "@/lib/spotify/pkce";

/**
 * Starts the PKCE flow. The verifier is kept in an httpOnly cookie.
 *
 * Cookies are scoped per host, so the flow has to begin on the same origin
 * Spotify will redirect back to — otherwise the callback cannot read the
 * verifier. `localhost` and `127.0.0.1` are different hosts to the browser.
 */
export async function GET(request: NextRequest) {
  const target = new URL(redirectUri());
  // `request.url` is not a reliable source for the browser-facing host in dev
  const host = request.headers.get("host");

  if (host && host !== target.host) {
    return NextResponse.redirect(new URL("/api/spotify/login", target.origin));
  }

  const verifier = randomVerifier();
  const challenge = await challengeFor(verifier);

  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  const res = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params}`,
  );
  res.cookies.set(COOKIE.verifier, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
