import { NextResponse, type NextRequest } from "next/server";
import {
  MARKET,
  NotConnectedError,
  SpotifyApiError,
  findTrack,
  flushToken,
  spotifyGet,
} from "@/lib/spotify/api";
import { artistTopTags, artistTopTracks, similarArtists } from "@/lib/lastfm/client";
import type { ArtistPage } from "@/lib/data";

type RawImage = { url: string; width: number | null };
type RawArtist = {
  id: string;
  uri: string;
  name: string;
  images: RawImage[];
  genres?: string[];
  followers?: { total: number };
  popularity?: number;
};
type RawTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  album: { id: string; name: string; images: RawImage[] };
};
type RawAlbum = {
  id: string;
  uri: string;
  name: string;
  images: RawImage[];
  release_date: string;
  total_tracks: number;
  album_type: "album" | "single" | "compilation";
  album_group?: string;
};

/**
 * Measured ceiling for this app's credentials: 20 comes back `400 Invalid
 * limit`, the same wall the search endpoint has. Pages are stitched instead.
 */
const PAGE = 10;
const MAX_PAGES = 3;

/** Smallest image at or above the slot it fills, else the largest there is. */
function pick(images: RawImage[] | undefined, atLeast: number): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= atLeast) ?? sorted[sorted.length - 1]).url;
}

/**
 * Everything the artist screen shows, in one request.
 *
 * Spotify covers the identity, the hits and the discography. It no longer
 * covers the rest: Related Artists was withdrawn from new applications in
 * November 2024, and `genres`, `followers` and `popularity` are all marked
 * deprecated on the artist object. Last.fm fills those two gaps — it is already
 * the station's similarity source, so no new dependency is added — and the
 * response reports which fields Spotify actually returned so the screen can
 * hide what came back empty rather than print a blank.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  /**
   * Settled, not all: one refused call must not cost the whole screen.
   *
   * Spotify answers 403 on some catalogue reads for applications registered
   * after its November 2024 changes, and which reads differ by account. Losing
   * the top tracks is a thinner page; losing the page is a dead end. Each
   * failure is logged with Spotify's own words so it can be told apart.
   */
  /** Walks the paginated discography, a page at a time, bounded. */
  async function discographyPages(): Promise<RawAlbum[]> {
    const out: RawAlbum[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await spotifyGet<{ items?: RawAlbum[] }>(
        `/artists/${id}/albums?include_groups=album,single` +
          `&limit=${PAGE}&offset=${page * PAGE}&market=${MARKET}`,
      );
      const items = data.items ?? [];
      out.push(...items);
      if (items.length < PAGE) break;
    }
    return out;
  }

  const [artistRes, topRes, albumRes] = await Promise.allSettled([
    spotifyGet<RawArtist>(`/artists/${id}`),
    spotifyGet<{ tracks?: RawTrack[] }>(`/artists/${id}/top-tracks?market=${MARKET}`),
    discographyPages(),
  ]);

  for (const [what, settled] of [
    ["artist", artistRes],
    ["top-tracks", topRes],
    ["albums", albumRes],
  ] as const) {
    if (settled.status === "rejected") {
      const e = settled.reason;
      console.warn(
        `[artist] ${id} ${what} failed:`,
        e instanceof SpotifyApiError ? `${e.status} ${e.detail}` : e,
      );
    }
  }

  try {
    if (artistRes.status === "rejected") throw artistRes.reason;
    const { data: artist, resolved } = artistRes.value;
    const spotifyTop = topRes.status === "fulfilled" ? (topRes.value.data.tracks ?? []) : [];
    const albumItems = albumRes.status === "fulfilled" ? albumRes.value : [];

    // Last.fm answers by name, which is all Spotify gives us to go on
    const [tags, neighbours] = await Promise.all([
      artistTopTags(artist.name, 6).catch(() => []),
      similarArtists(artist.name, 8).catch(() => []),
    ]);

    /**
     * Top tracks, with a second source behind the first.
     *
     * Measured on this app's credentials: /artists/{id}/top-tracks answers 403
     * with and without a market, so it is not a parameter problem — the
     * endpoint is closed to it. Last.fm knows an artist's most-played tracks by
     * name, and the station's resolver already turns names into playable
     * Spotify tracks, so the screen keeps the section rather than losing it.
     * The response says which source answered; the screen says so too.
     */
    let topTracks = spotifyTop.map((t) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      durationMs: t.duration_ms,
      explicit: t.explicit,
      albumId: t.album.id,
      albumName: t.album.name,
      artwork: pick(t.album.images, 64),
    }));
    let topSource: ArtistPage["topSource"] = topTracks.length ? "spotify" : "none";

    if (!topTracks.length) {
      const names = await artistTopTracks(artist.name, 8).catch(() => []);
      const resolvedTracks = [];
      for (const n of names) {
        try {
          const { track } = await findTrack(n.name, artist.name);
          if (track) {
            resolvedTracks.push({
              id: track.id,
              uri: track.uri,
              name: track.name,
              durationMs: track.duration_ms,
              explicit: false,
              albumId: "",
              albumName: track.album.name,
              artwork: pick(track.album.images, 64),
            });
          }
        } catch {
          // one unresolvable name should not cost the whole section
        }
      }
      if (resolvedTracks.length) {
        topTracks = resolvedTracks;
        topSource = "lastfm";
      }
    }

    // newest first, and one entry per title — reissues otherwise crowd the list
    const seen = new Set<string>();
    const discography = albumItems
      .slice()
      .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""))
      .filter((a) => {
        const key = `${a.name.toLowerCase()}|${a.album_type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const body: ArtistPage = {
      id: artist.id,
      uri: artist.uri,
      name: artist.name,
      image: pick(artist.images, 320),
      genres: artist.genres?.length ? artist.genres : tags,
      genreSource: artist.genres?.length ? "spotify" : tags.length ? "lastfm" : "none",
      followers: artist.followers?.total ?? null,
      popularity: artist.popularity ?? null,
      topTracks,
      topSource,
      albums: discography.map((a) => ({
        id: a.id,
        uri: a.uri,
        name: a.name,
        artwork: pick(a.images, 160),
        releaseDate: a.release_date,
        totalTracks: a.total_tracks,
        albumType: a.album_type,
      })),
      similar: neighbours.map((n) => ({ name: n.name, match: n.match })),
    };

    return flushToken(NextResponse.json(body), resolved);
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    console.error(
      "[artist]",
      id,
      e instanceof SpotifyApiError ? `${e.status} ${e.detail}` : e,
    );
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "artist_failed",
        detail: e instanceof SpotifyApiError ? e.detail : undefined,
      },
      { status: e instanceof SpotifyApiError ? e.status : 502 },
    );
  }
}
