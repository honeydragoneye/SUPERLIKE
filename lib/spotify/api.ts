import type { NextResponse } from "next/server";
import { RateLimitedError, spotifyHttp } from "@/lib/http/throttle";
import { resolveAccessToken, writeTokens, type Resolved } from "./tokens";

const API = "https://api.spotify.com/v1";

/**
 * Fallback market for catalogue lookups.
 *
 * This is the *listener's* market, not the music's origin — it decides which
 * regional pressing of a track comes back, not which countries' artists do.
 *
 * Every request here carries a user token, and Spotify gives the country on
 * that account priority over this value, so it is a fallback rather than a
 * setting. Sending one at all is what matters: without a market Spotify skips
 * track relinking and hands back a URI that may hold no licence for the
 * listener, and it omits `is_playable`, so code that checks that field never
 * fires. One constant so the station and the search route cannot drift apart.
 */
export const MARKET = "KR";

export class NotConnectedError extends Error {
  constructor() {
    super("not_connected");
  }
}

/** A non-2xx from Spotify, with its status preserved for the caller. */
export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`spotify_${status}`);
  }

  /** 403 here almost always means the grant predates a scope we now request. */
  get isScopeProblem(): boolean {
    return this.status === 403 || /scope/i.test(this.detail);
  }
}

/**
 * Calls the Spotify Web API with the stored token.
 *
 * Returns the token resolution alongside the payload so the caller can flush a
 * refreshed token onto its own response — cookies set any other way are lost.
 */
export async function spotifyGet<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; resolved: Resolved }> {
  const resolved = await resolveAccessToken();
  if (resolved.status === "none") throw new NotConnectedError();

  let res: Response;
  try {
    res = await spotifyHttp(`${API}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${resolved.accessToken}`,
      },
    });
  } catch (e) {
    // surfaced with the status so callers can tell throttling from a real error
    if (e instanceof RateLimitedError) throw new SpotifyApiError(429, e.message);
    throw e;
  }

  if (!res.ok) {
    throw new SpotifyApiError(res.status, (await res.text()).slice(0, 300));
  }
  return { data: (await res.json()) as T, resolved };
}

/** Attaches a refreshed token to the outgoing response, if one was issued. */
export function flushToken(res: NextResponse, resolved: Resolved): NextResponse {
  if (resolved.status === "refreshed") writeTokens(res, resolved.tokens);
  return res;
}

export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  /** always present on a track object; declared so the station can filter on it */
  explicit: boolean;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number | null }[];
    album_type?: "album" | "single" | "compilation";
    release_date?: string;
  };
  is_playable?: boolean;
};

/** album beats single beats compilation — the original release, where there is one. */
const ALBUM_TYPE_RANK: Record<string, number> = {
  album: 0,
  single: 1,
  compilation: 2,
};

function rank(track: SpotifyTrack): [number, number, string] {
  return [
    track.is_playable === false ? 1 : 0,
    ALBUM_TYPE_RANK[track.album.album_type ?? "album"] ?? 3,
    // within a type the earliest press is usually the original, not a remaster
    track.album.release_date ?? "9999",
  ];
}

/**
 * Resolves a Last.fm name pair to a playable Spotify track.
 *
 * Field-scoped search (`track:"…" artist:"…"`) rather than a loose query, so a
 * common title does not match some unrelated song by another artist.
 *
 * Spotify's own ranking readily puts a greatest-hits or soundtrack pressing
 * first, so the results are re-sorted: album, then single, then compilation,
 * earliest release breaking ties. Compilations are ordered last rather than
 * dropped — for some tracks they are the only release on Spotify.
 *
 * `limit` is 10 because that is what this app's credentials actually accept:
 * 20 and 50 come back `400 Invalid limit`, despite the documented range being
 * 0–50. Measured, not assumed — raising it silently breaks every lookup.
 *
 * `market` is what makes the `is_playable` rank above mean anything, and what
 * makes Spotify hand back the locally licensed pressing of a track.
 */
export async function findTrack(
  name: string,
  artist: string,
): Promise<{ track: SpotifyTrack | null; resolved: Resolved }> {
  const q = `track:"${name}" artist:"${artist}"`;
  const { data, resolved } = await spotifyGet<{ tracks?: { items?: SpotifyTrack[] } }>(
    `/search?q=${encodeURIComponent(q)}&type=track&limit=10&market=${MARKET}`,
  );
  const items = data.tracks?.items ?? [];
  if (!items.length) return { track: null, resolved };

  const best = items.slice().sort((a, b) => {
    const [pa, ta, ra] = rank(a);
    const [pb, tb, rb] = rank(b);
    return pa - pb || ta - tb || ra.localeCompare(rb);
  })[0];

  return { track: best, resolved };
}
