import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, redirectUri } from "@/lib/spotify/config";
import { exchangeCode, writeTokens } from "@/lib/spotify/tokens";

/** Spotify redirects here with ?code=. Exchange it and store tokens server-side. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  // `request.url` does not carry the browser-facing host in dev, and the
  // cookies below are scoped to the redirect URI's host — so land there.
  const home = new URL("/", new URL(redirectUri()).origin);

  const fail = (reason: string) => {
    home.searchParams.set("spotify_error", reason);
    return NextResponse.redirect(home);
  };

  if (oauthError) return fail(oauthError);
  if (!code) return fail("missing_code");

  const jar = await cookies();
  const verifier = jar.get(COOKIE.verifier)?.value;
  if (!verifier) return fail("missing_verifier");

  try {
    const tokens = await exchangeCode(code, verifier, redirectUri());
    const res = NextResponse.redirect(home);
    writeTokens(res, tokens);
    res.cookies.set(COOKIE.verifier, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "exchange_failed");
  }
}
