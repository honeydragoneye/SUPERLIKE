import { NextResponse, type NextRequest } from "next/server";
import {
  MARKET,
  NotConnectedError,
  SpotifyApiError,
  flushToken,
  spotifyGet,
} from "@/lib/spotify/api";
import type { PlaylistPage } from "@/lib/data";

type RawImage = { url: string; width: number | null };
type RawTrack = {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  artists: { name: string }[];
  album: { name: string; images: RawImage[] };
};

/**
 * A row in the track list.
 *
 * Two shapes are accepted because two arrive. The reference calls the track
 * `track`; this app's credentials return it as `item`, inside a paging object
 * named `items` rather than `tracks`. Reading both costs nothing and survives
 * whichever Spotify sends.
 */
type RawRow = {
  track?: RawTrack | null;
  item?: RawTrack | null;
  added_at: string | null;
} | null;

type RawPaging = {
  total?: number;
  limit?: number;
  next?: string | null;
  items?: RawRow[];
};

type RawPlaylist = {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  images: RawImage[] | null;
  owner: { id: string; display_name: string | null };
  followers?: { total: number };
  collaborative: boolean;
  public: boolean | null;
  /** the documented name */
  tracks?: RawPaging;
  /** what this app actually receives */
  items?: RawPaging;
};

function pick(images: RawImage[] | null | undefined, atLeast: number): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= atLeast) ?? sorted[sorted.length - 1]).url;
}

/**
 * One of the listener's own playlists, with its tracks.
 *
 * Spotify withdrew its algorithmic and editorial playlists from the API for
 * applications registered after November 2024, so this only ever answers for
 * playlists the account made — which is also all the library screen now lists.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { data: playlist, resolved } = await spotifyGet<RawPlaylist>(
      `/playlists/${id}?market=${MARKET}`,
    );

    /**
     * The tracks travel with the playlist, because they have to.
     *
     * `/playlists/{id}/tracks` answers 403 for this app — measured with and
     * without a market, at every limit, with and without `fields` — so the
     * embedded paging object is the only source. It arrives with limit 100, so
     * a playlist up to that length comes complete in this one request; beyond
     * it the screen says how many it has rather than pretending otherwise.
     */
    const paging = playlist.items ?? playlist.tracks ?? {};
    const rows = paging.items ?? [];
    const total = paging.total ?? rows.length;

    const body: PlaylistPage = {
      id: playlist.id,
      uri: playlist.uri,
      name: playlist.name,
      description: playlist.description || null,
      cover: pick(playlist.images, 320),
      owner: playlist.owner?.display_name ?? "",
      followers: playlist.followers?.total ?? null,
      collaborative: playlist.collaborative,
      isPublic: playlist.public,
      totalTracks: total,
      tracks: rows
        // local files and removed entries arrive as nulls
        .map((row) => ({ row, track: row?.track ?? row?.item ?? null }))
        .filter((r): r is { row: NonNullable<RawRow>; track: RawTrack } =>
          Boolean(r.track?.uri),
        )
        .map(({ row, track }, n) => ({
          index: String(n + 1).padStart(2, "0"),
          id: track.id ?? track.uri,
          uri: track.uri,
          name: track.name,
          artist: track.artists.map((a) => a.name).join(", "),
          album: track.album?.name ?? "",
          artwork: pick(track.album?.images, 64),
          durationMs: track.duration_ms,
          explicit: track.explicit,
          addedAt: row.added_at,
        })),
    };

    return flushToken(NextResponse.json(body), resolved);
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    console.error(
      "[playlist]",
      id,
      e instanceof SpotifyApiError ? `${e.status} ${e.detail}` : e,
    );
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "playlist_failed",
        detail: e instanceof SpotifyApiError ? e.detail : undefined,
      },
      { status: e instanceof SpotifyApiError ? e.status : 502 },
    );
  }
}
