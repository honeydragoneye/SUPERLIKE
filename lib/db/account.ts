import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/spotify/config";
import { flushToken, spotifyGet } from "@/lib/spotify/api";
import type { Resolved } from "@/lib/spotify/tokens";
import { query } from "./client";

type SpotifyMe = { id: string; display_name: string | null };

export type SignedInUser = {
  id: string;
  name: string;
  /** the token resolution of the request that found out, so the route can flush a refreshed token */
  resolved: Resolved | null;
};

/**
 * Who is asking, as the database knows them.
 *
 * The identity is the Spotify account the browser is signed in to — there is no
 * password or sign-up of our own. Asking Spotify for `/me` costs a throttled
 * request, so the answer is remembered per refresh token (which outlives the
 * hourly access token) for a few hours.
 *
 * Throws NotConnectedError when no Spotify session exists.
 */
const KNOWN_FOR_MS = 6 * 60 * 60 * 1000;
const known = new Map<string, { id: string; name: string; at: number }>();

export async function signedInUser(): Promise<SignedInUser> {
  const jar = await cookies();
  const key = jar.get(COOKIE.refresh)?.value ?? "";
  const hit = key ? known.get(key) : undefined;
  if (hit && Date.now() - hit.at < KNOWN_FOR_MS) {
    return { id: hit.id, name: hit.name, resolved: null };
  }

  const { data, resolved } = await spotifyGet<SpotifyMe>("/me");
  const name = data.display_name || data.id;
  await query(
    `insert into users (spotify_id, display_name) values ($1, $2)
     on conflict (spotify_id) do update set display_name = excluded.display_name`,
    [data.id, name],
  );
  if (key) known.set(key, { id: data.id, name, at: Date.now() });
  return { id: data.id, name, resolved };
}

/** A refreshed Spotify token must reach the browser whichever call in the request refreshed it. */
export function withTokens(res: NextResponse, first: Resolved | null, more: Resolved[]): NextResponse {
  const refreshed = [first, ...more].find((r) => r?.status === "refreshed");
  return refreshed ? flushToken(res, refreshed) : res;
}
