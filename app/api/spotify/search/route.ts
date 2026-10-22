import { NextResponse, type NextRequest } from "next/server";
import { RateLimitedError } from "@/lib/http/throttle";
import {
  MARKET,
  NotConnectedError,
  SpotifyApiError,
  flushToken,
  spotifyGet,
} from "@/lib/spotify/api";
import { SEARCH_PAGE } from "@/lib/data";
import type {
  Playlist,
  SearchAlbum,
  SearchArtist,
  SearchResults,
  SearchTrack,
} from "@/lib/data";

/** Measured ceiling for this app's credentials: 20 and above are rejected. */
const MAX_LIMIT = SEARCH_PAGE;

type Img = { url: string; width: number | null };

/** Smallest image at or above the slot it will fill, else the largest there is. */
function pick(images: Img[] | null | undefined, atLeast: number): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= atLeast) ?? sorted[sorted.length - 1]).url;
}

type RawTrack = {
  id: string; uri: string; name: string; duration_ms: number;
  explicit: boolean; popularity: number; preview_url: string | null;
  artists: { id?: string; name: string }[];
  album: { id?: string; name: string; images: Img[] };
};
type RawAlbum = {
  id: string; uri: string; name: string; images: Img[];
  release_date: string; total_tracks: number;
  album_type: SearchAlbum["albumType"];
  artists: { name: string }[];
};
type RawArtist = {
  id: string; uri: string; name: string; images: Img[];
  genres: string[]; followers: { total: number }; popularity: number;
};
type RawPlaylist = {
  id: string; uri: string; name: string; images: Img[] | null;
  owner: { display_name: string | null };
  tracks: { total: number } | null;
  collaborative: boolean;
};

type RawSearch = {
  tracks?: { items?: (RawTrack | null)[] };
  albums?: { items?: (RawAlbum | null)[] };
  artists?: { items?: (RawArtist | null)[] };
  playlists?: { items?: (RawPlaylist | null)[] };
};

/** Spotify returns null entries for items the caller cannot see. */
function present<T>(items: (T | null)[] | undefined): T[] {
  return (items ?? []).filter((i): i is T => i !== null);
}

/**
 * Catalogue search across the four tabs the app shows.
 *
 * One request covers every type — Spotify accepts a comma-separated `type`,
 * so four tabs cost one round trip rather than four.
 *
 * `market` matters: without it Spotify omits playability and drops results
 * that are unavailable locally.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const market = url.searchParams.get("market") ?? MARKET;
  const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_LIMIT) || MAX_LIMIT, MAX_LIMIT);
  const types = url.searchParams.get("type") ?? "track,album,artist,playlist";

  if (!query) {
    const empty: SearchResults = { query: "", tracks: [], albums: [], artists: [], playlists: [] };
    return NextResponse.json(empty);
  }

  try {
    const { data, resolved } = await spotifyGet<RawSearch>(
      `/search?q=${encodeURIComponent(query)}&type=${types}` +
        `&limit=${limit}&offset=${offset}&market=${market}`,
    );

    const tracks: SearchTrack[] = present(data.tracks?.items).map((t) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      album: t.album?.name ?? "",
      artwork: pick(t.album?.images, 64),
      artworkLarge: pick(t.album?.images, 300),
      durationMs: t.duration_ms,
      explicit: t.explicit,
      popularity: t.popularity,
      previewUrl: t.preview_url,
      albumId: t.album?.id ?? null,
      artistId: t.artists[0]?.id ?? null,
      artistName: t.artists[0]?.name ?? "",
    }));

    const albums: SearchAlbum[] = present(data.albums?.items).map((a) => ({
      id: a.id,
      uri: a.uri,
      name: a.name,
      artist: a.artists.map((x) => x.name).join(", "),
      artwork: pick(a.images, 300),
      releaseDate: a.release_date,
      totalTracks: a.total_tracks,
      albumType: a.album_type,
    }));

    const artists: SearchArtist[] = present(data.artists?.items).map((a) => ({
      id: a.id,
      uri: a.uri,
      name: a.name,
      image: pick(a.images, 300),
      genres: a.genres ?? [],
      followers: a.followers?.total ?? 0,
      popularity: a.popularity ?? 0,
    }));

    const playlists: Playlist[] = present(data.playlists?.items).map((p) => ({
      id: p.id,
      uri: p.uri,
      name: p.name,
      owner: p.owner?.display_name ?? "",
      trackCount: p.tracks?.total ?? 0,
      cover: pick(p.images, 300),
      collaborative: p.collaborative,
    }));

    const results: SearchResults = { query, tracks, albums, artists, playlists };
    return flushToken(
      NextResponse.json(results, { headers: { "Cache-Control": "no-store" } }),
      resolved,
    );
  } catch (e) {
    if (e instanceof RateLimitedError) {
      const mins = Math.ceil(e.retryAfterSec / 60);
      return NextResponse.json(
        {
          error: "rate_limited",
          retryAfterSec: e.retryAfterSec,
          detail: `Spotify 검색 요청 한도를 초과했습니다. 약 ${mins}분 후 다시 시도할 수 있습니다.`,
        },
        { status: 429 },
      );
    }
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    if (e instanceof SpotifyApiError) {
      return NextResponse.json(
        { error: e.message, detail: e.detail },
        { status: e.status === 403 ? 403 : 502 },
      );
    }
    return NextResponse.json({ error: "search_failed" }, { status: 502 });
  }
}
