import { nameGap, squash } from "./names";
import type { SearchAlbum, SearchArtist } from "./data";

/** Rows the panel may lend to an artist or an album before the songs: the rest stay songs. */
export const MAX_ENTITY_ROWS = 2;

export type Entities = { artist: SearchArtist | null; albums: SearchAlbum[] };

/**
 * Names that answer to what was typed: the ones spelled exactly the same once
 * squashed, and only when there is none of those the ones a slip or two away.
 * A near spelling never sits beside an exact one — "Radiohead" is not also
 * "Radiohed".
 */
function answering<T extends { name: string }>(query: string, items: T[]): T[] {
  const q = squash(query);
  if (!q) return [];
  const exact = items.filter((i) => squash(i.name) === q);
  if (exact.length) return exact;
  return items.filter((i) => nameGap(query, i.name) !== null);
}

/**
 * Which artist and albums the typed text is the name of, if any.
 *
 * - one artist at most: of the namesakes the most popular, which is how the
 *   chat's link cards choose as well; the rest are a tab away on the results
 *   page;
 * - albums share what the artist leaves of two rows, in Spotify's order, so an
 *   artist and a self-titled album both show, and a title several artists have
 *   shows two of them (their names tell them apart);
 * - the same album twice by the same artist (an edition) shows once.
 */
export function pickEntities(query: string, artists: SearchArtist[], albums: SearchAlbum[]): Entities {
  const artist = answering(query, artists).reduce<SearchArtist | null>(
    (best, a) => (best === null || a.popularity > best.popularity ? a : best),
    null,
  );

  const seen = new Set<string>();
  const matched = answering(query, albums).filter((a) => {
    const key = `${squash(a.name)}|${squash(a.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { artist, albums: matched.slice(0, MAX_ENTITY_ROWS - (artist ? 1 : 0)) };
}

/** 12만, 4.2만, 1.3억: the number of followers the way Korean writes it. */
export function followersLabel(n: number): string {
  const compact = (v: number, unit: string) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
  if (n >= 100_000_000) return compact(n / 100_000_000, "억");
  if (n >= 10_000) return compact(n / 10_000, "만");
  return n.toLocaleString("ko-KR");
}
