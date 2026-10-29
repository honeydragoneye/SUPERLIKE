import { spotifyGet } from "./api";

/**
 * The titles of an artist's albums and singles as Spotify has them, for telling
 * two same-named artists apart in another catalogue. A failure (a request
 * limit, say) is an empty list: the caller then has nothing to settle with and
 * makes no match, rather than a wrong one.
 */
export async function albumTitles(artistId: string): Promise<string[]> {
  try {
    const { data } = await spotifyGet<{ items?: { name?: string }[] }>(
      `/artists/${encodeURIComponent(artistId)}/albums?include_groups=album,single&limit=20`,
    );
    return (data.items ?? []).map((i) => i.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}
