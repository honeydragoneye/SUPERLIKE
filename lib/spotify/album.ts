import { MARKET, spotifyGet } from "./api";
import type { Resolved } from "./tokens";
import type { AlbumPage } from "@/lib/data";

type RawImage = { url: string; width: number | null };
type RawAlbum = {
  id: string;
  uri: string;
  name: string;
  images: RawImage[];
  release_date: string;
  release_date_precision?: string;
  total_tracks: number;
  album_type: "album" | "single" | "compilation";
  label?: string;
  artists: { id: string; name: string }[];
  copyrights?: { text: string; type: string }[];
  external_ids?: { upc?: string; isrc?: string };
  tracks?: {
    items?: {
      id: string;
      uri: string;
      name: string;
      duration_ms: number;
      explicit: boolean;
      track_number: number;
      disc_number: number;
      artists: { name: string }[];
    }[];
  };
};

function pick(images: RawImage[] | undefined, atLeast: number): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= atLeast) ?? sorted[sorted.length - 1]).url;
}

/**
 * The album screen's data.
 *
 * One request covers it: Get Album embeds the first 50 tracks, so only an album
 * longer than that needs the separate tracks endpoint — rare enough to fetch
 * only when the count says so.
 *
 * `genres` is not read at all. The reference documents it as always empty, so
 * asking the screen to handle a field that never arrives is noise. `label` is
 * deprecated but still sometimes populated, so it is passed through as nullable
 * and the screen omits it when absent.
 *
 * Shared by the album route and by the copy kept for Editor's Pick, so the two
 * cannot describe the same album differently.
 */
export async function fetchAlbumPage(id: string): Promise<{ page: AlbumPage; resolved: Resolved }> {
  const { data: album, resolved } = await spotifyGet<RawAlbum>(`/albums/${id}?market=${MARKET}`);

  let items = album.tracks?.items ?? [];
  if (album.total_tracks > items.length) {
    const { data: more } = await spotifyGet<{ items?: typeof items }>(
      `/albums/${id}/tracks?limit=50&offset=${items.length}&market=${MARKET}`,
    );
    items = [...items, ...(more.items ?? [])];
  }

  const page: AlbumPage = {
    id: album.id,
    uri: album.uri,
    name: album.name,
    artwork: pick(album.images, 320),
    releaseDate: album.release_date,
    releaseDatePrecision: album.release_date_precision ?? "day",
    totalTracks: album.total_tracks,
    albumType: album.album_type,
    label: album.label ?? null,
    artists: album.artists.map((a) => ({ id: a.id, name: a.name })),
    copyrights: (album.copyrights ?? []).map((c) => `${c.type === "P" ? "℗" : "©"} ${c.text}`),
    upc: album.external_ids?.upc ?? null,
    tracks: items
      .slice()
      .sort((a, b) => a.disc_number - b.disc_number || a.track_number - b.track_number)
      .map((t) => ({
        id: t.id,
        uri: t.uri,
        name: t.name,
        durationMs: t.duration_ms,
        explicit: t.explicit,
        trackNumber: t.track_number,
        discNumber: t.disc_number,
        artist: t.artists.map((a) => a.name).join(", "),
      })),
  };
  return { page, resolved };
}
