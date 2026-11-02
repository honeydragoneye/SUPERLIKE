import { NextResponse } from "next/server";
import {
  NotConnectedError,
  SpotifyApiError,
  flushToken,
  spotifyGet,
} from "@/lib/spotify/api";
import type { RecentTrack } from "@/lib/data";
import { signedInUser, withTokens } from "@/lib/db/account";
import { listRecent, markImported, rememberRecent, wasImported } from "@/lib/db/recent";
import type { Resolved } from "@/lib/spotify/tokens";

type SpotifyRecent = {
  items: {
    played_at: string;
    track: {
      id: string | null;
      uri: string;
      name: string;
      duration_ms: number;
      artists: { name: string }[];
      album: { name: string; images: { url: string; width: number | null }[] };
    };
  }[];
};

/**
 * Smallest image that still looks sharp at `atLeast` px.
 *
 * Two slots want two sizes from the same response: the 32px rows, and the
 * 231px Now Playing panel, which shows the most recent track after a reload.
 * Serving the row-sized art to the panel stretched a 64px image 3.6x.
 */
function pick(
  images: { url: string; width: number | null }[],
  atLeast: number,
): string | null {
  if (!images.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= atLeast) ?? sorted[sorted.length - 1]).url;
}

/** Spotify's own last fifty plays, once repeats are collapsed, as list rows. */
async function spotifyHistory(): Promise<{ tracks: RecentTrack[]; resolved: Resolved }> {
  // ask for the maximum, because collapsing repeats thins the list out
  const { data, resolved } = await spotifyGet<SpotifyRecent>("/me/player/recently-played?limit=50");

  /**
   * Spotify logs every play, so a track on repeat fills consecutive slots.
   * Items arrive newest-first, so keeping the first occurrence of each track
   * both removes the repeats and leaves each one at its latest position — a
   * re-listen floats back to the top instead of being appended.
   */
  const seen = new Set<string>();
  const tracks: RecentTrack[] = [];
  for (const item of data.items) {
    const key = item.track.uri || item.track.id || `${item.track.name}|${item.track.artists.map((a) => a.name).join()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      index: String(tracks.length + 1).padStart(2, "0"),
      title: item.track.name,
      artist: item.track.artists.map((a) => a.name).join(", "),
      artwork: pick(item.track.album.images, 64),
      artworkLarge: pick(item.track.album.images, 231),
      playedAt: item.played_at,
      durationMs: item.track.duration_ms,
      uri: item.track.uri,
    });
  }
  return { tracks, resolved };
}

/**
 * The listening history: the newest 100 tracks, kept by Superlike.
 *
 * Spotify's list is read once per user, the first time, to start the queue off
 * with what they had already heard. After that the list grows only from plays
 * made in Superlike (the 20-second rule of lib/plays, saved by /api/me/plays),
 * so Spotify is no longer asked. Without a database, or if it fails, the
 * screen still gets what Spotify says.
 */
export async function GET() {
  try {
    try {
      const user = await signedInUser();
      let spotifyResolved: Resolved | null = null;
      if (!(await wasImported(user.id))) {
        const { tracks, resolved } = await spotifyHistory();
        spotifyResolved = resolved;
        await rememberRecent(user.id, tracks);
        await markImported(user.id);
      }
      const res = NextResponse.json({ tracks: await listRecent(user.id) }, { headers: { "Cache-Control": "no-store" } });
      return withTokens(res, user.resolved, spotifyResolved ? [spotifyResolved] : []);
    } catch (e) {
      if (e instanceof NotConnectedError || e instanceof SpotifyApiError) throw e;
      console.warn("[recent] using Spotify's list, not the saved one:", e instanceof Error ? e.message : e);
    }
    const { tracks, resolved } = await spotifyHistory();
    return flushToken(NextResponse.json({ tracks }, { headers: { "Cache-Control": "no-store" } }), resolved);
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    if (e instanceof SpotifyApiError && e.isScopeProblem) {
      return NextResponse.json(
        { error: "insufficient_scope", detail: e.detail },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch_failed" },
      { status: 502 },
    );
  }
}
