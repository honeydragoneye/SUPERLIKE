import { NextResponse } from "next/server";
import {
  NotConnectedError,
  SpotifyApiError,
  flushToken,
  spotifyGet,
} from "@/lib/spotify/api";
import type { Playlist } from "@/lib/data";

type SpotifyPlaylists = {
  total: number;
  items: ({
    id: string;
    uri: string;
    name: string;
    images: { url: string; width: number | null }[] | null;
    owner: { id: string; display_name: string | null };
    tracks: { total: number };
    public: boolean | null;
    collaborative: boolean;
  } | null)[];
};

/** Prefer something a little larger than the 140px slot, for retina. */
function cover(images: { url: string; width: number | null }[] | null): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 300) ?? sorted[sorted.length - 1]).url;
}

/**
 * The playlists this account made, not the ones it follows.
 *
 * `/me/playlists` mixes both, so the list filled up with saved and editorial
 * playlists the listener never built. Ownership is the only honest divider, and
 * it needs the account's own id — hence the extra `/me`, which is one small
 * call and the same one that would be needed to show the profile anyway.
 *
 * It matters beyond tidiness: Spotify withdrew its own algorithmic and
 * editorial playlists from the API for applications registered after November
 * 2024, so those entries could never open a detail screen regardless.
 */
export async function GET() {
  try {
    const [{ data: me }, { data, resolved }] = await Promise.all([
      spotifyGet<{ id: string }>("/me"),
      spotifyGet<SpotifyPlaylists>("/me/playlists?limit=50"),
    ]);

    // Spotify occasionally returns null entries for playlists the user can no
    // longer see; they would otherwise blow up the mapping below.
    const playlists: Playlist[] = data.items
      .filter((p): p is NonNullable<(typeof data.items)[number]> => p !== null)
      .filter((p) => p.owner?.id === me.id)
      .map((p) => ({
        id: p.id,
        uri: p.uri,
        name: p.name,
        owner: p.owner?.display_name ?? "",
        trackCount: p.tracks?.total ?? 0,
        cover: cover(p.images),
        collaborative: p.collaborative,
      }));

    return flushToken(
      NextResponse.json(
        // `total` is now what the listener actually owns, not Spotify's count
        { playlists, total: playlists.length },
        { headers: { "Cache-Control": "no-store" } },
      ),
      resolved,
    );
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
