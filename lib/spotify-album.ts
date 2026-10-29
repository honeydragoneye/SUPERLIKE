import { squash } from "@/lib/names";

/** An album as another catalogue names it: just enough to look it up on Spotify. */
export type AlbumRef = { id: string; title: string; artist: string };

/** What the chart calls "X - EP" is "X" to Spotify. */
const bare = (title: string) => title.replace(/\s-\s(?:EP|Single)$/i, "").trim();

/** One answer per album, so a second press does not search again. */
const found = new Map<string, Promise<string | null>>();

/**
 * Apple's catalogue has no Spotify id, so an album is looked up by name when it is
 * pressed. The first hit only counts when its name says the same thing: a
 * wrong album opened is worse than none.
 */
export function findSpotifyAlbum(release: AlbumRef): Promise<string | null> {
  const known = found.get(release.id);
  if (known) return known;

  const pending = (async () => {
    const q = encodeURIComponent(`${bare(release.title)} ${release.artist}`);
    const res = await fetch(`/api/spotify/search?q=${q}&type=album&limit=3`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { albums?: { id: string; name: string }[] };
    const want = squash(bare(release.title));
    return data.albums?.find((a) => squash(a.name).includes(want) || want.includes(squash(a.name)))?.id ?? null;
  })();
  // a failed search is not remembered, so the next press tries again
  pending.catch(() => found.delete(release.id));
  found.set(release.id, pending);
  return pending;
}

