import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { COOKIE, clientId } from "./config";
import { spotifyHttp } from "@/lib/http/throttle";
import { createRefreshOnce } from "./refresh-once";

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

const TOKEN_URL = "https://accounts.spotify.com/api/token";

/** Refresh a little early so the SDK never sees a dead token mid-track. */
const SKEW_MS = 60_000;

export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<TokenSet> {
  const res = await spotifyHttp(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "token exchange failed");
  }
  return data as TokenSet;
}

export async function refresh(refreshToken: string): Promise<TokenSet> {
  const res = await spotifyHttp(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "token refresh failed");
  }
  return data as TokenSet;
}

function cookieBase(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/**
 * Writes tokens onto the response being returned.
 *
 * Cookies set through `next/headers` are dropped when a route handler returns
 * its own NextResponse, so persistence has to happen on that object.
 */
export function writeTokens(res: NextResponse, tokens: TokenSet): number {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const month = 60 * 60 * 24 * 30;
  res.cookies.set(COOKIE.access, tokens.access_token, cookieBase(tokens.expires_in));
  res.cookies.set(COOKIE.expires, String(expiresAt), cookieBase(month));
  if (tokens.refresh_token) {
    res.cookies.set(COOKIE.refresh, tokens.refresh_token, cookieBase(month));
  }
  return expiresAt;
}

export function clearTokens(res: NextResponse) {
  for (const name of [COOKIE.access, COOKIE.refresh, COOKIE.expires, COOKIE.verifier]) {
    res.cookies.set(name, "", { ...cookieBase(0), maxAge: 0 });
  }
}

export type Resolved =
  | { status: "none" }
  | { status: "valid"; accessToken: string; expiresAt: number }
  /** caller must persist `tokens` onto its response */
  | { status: "refreshed"; accessToken: string; expiresAt: number; tokens: TokenSet };

/**
 * Held on `globalThis` rather than in module scope: route handlers are bundled
 * apart, and a copy of this per route would let two routes spend the same
 * refresh token — the exact collision it exists to prevent.
 */
const shared = globalThis as typeof globalThis & {
  __superlikeRefreshOnce?: ReturnType<typeof createRefreshOnce<TokenSet>>;
};
const refreshOnce = (shared.__superlikeRefreshOnce ??= createRefreshOnce<TokenSet>());

/** Current access token, refreshing when it is close to expiry. */
export async function resolveAccessToken(): Promise<Resolved> {
  const jar = await cookies();
  const access = jar.get(COOKIE.access)?.value;
  const expiresAt = Number(jar.get(COOKIE.expires)?.value ?? 0);
  const refreshToken = jar.get(COOKIE.refresh)?.value;

  if (access && expiresAt - SKEW_MS > Date.now()) {
    return { status: "valid", accessToken: access, expiresAt };
  }
  if (!refreshToken) return { status: "none" };

  const next = await refreshOnce(refreshToken, () => refresh(refreshToken));
  return {
    status: "refreshed",
    accessToken: next.access_token,
    expiresAt: Date.now() + next.expires_in * 1000,
    tokens: next,
  };
}
