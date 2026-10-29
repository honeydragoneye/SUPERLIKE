/**
 * Albums released lately, by country, from Apple Music's public charts.
 *
 * Spotify has no usable "new releases by country" for this app: the browse
 * endpoint answers 403, and a `tag:new` search returns the same worldwide list
 * whatever the market. Apple's most-played chart is per country, and every entry
 * carries its release date, so a country's recent releases are the chart entries
 * whose date falls in the last month. It is a chart, not a feed: a record that
 * came out yesterday and nobody has played yet is not in it.
 */
export const COUNTRIES = ["KR", "JP", "US"] as const;
export type Country = (typeof COUNTRIES)[number];

export type Release = {
  /** Apple's id: only a key for the list, Spotify has its own */
  id: string;
  title: string;
  artist: string;
  /** YYYY-MM-DD, the date Apple gives */
  releaseDate: string;
  artwork: string | null;
};

const CHART = (country: Country) =>
  `https://rss.marketingtools.apple.com/api/v2/${country.toLowerCase()}/music/most-played/100/albums.json`;

/** How far back a release still counts as recent. */
const WINDOW_DAYS = 30;
const MAX_ALBUMS = 12;
/** The chart moves slowly: a few hours old is as good as live. */
const KEEP_MS = 3 * 60 * 60 * 1000;

/**
 * Not new music even when the date is: concert recordings, remasters and
 * anniversary reissues.
 */
export const NOT_NEW = /\b(live|tour|remaster(?:ed)?|anniversary)\b|ライブ|リマスター|周年/i;

type AppleAlbum = {
  id: string;
  name: string;
  artistName: string;
  releaseDate: string;
  artworkUrl100?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in Seoul, the calendar the rest of the app counts days in. */
function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** Apple serves the cover at the size in its name; ask for one that stays sharp at 150px on a 2x screen. */
function cover(url: string | undefined): string | null {
  return url ? url.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/300x300bb.$1") : null;
}

async function fetchChart(country: Country): Promise<AppleAlbum[]> {
  let last: unknown;
  // the feed sometimes stalls once and answers the next time
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(CHART(country), { signal: AbortSignal.timeout(10_000), cache: "no-store" });
      if (!res.ok) throw new Error(`apple_${res.status}`);
      const data = (await res.json()) as { feed: { results: AppleAlbum[] } };
      return data.feed.results;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const kept = new Map<Country, { at: number; albums: Release[] }>();

export async function recentReleases(country: Country): Promise<Release[]> {
  const known = kept.get(country);
  if (known && Date.now() - known.at < KEEP_MS) return known.albums;

  try {
    const now = today();
    const seen = new Set<string>();
    const albums = (await fetchChart(country))
      .filter((a) => {
        const age = daysBetween(a.releaseDate, now);
        // a negative age is an album announced for later
        return age >= 0 && age <= WINDOW_DAYS && !NOT_NEW.test(a.name);
      })
      // newest first; the sort is stable, so the chart's order breaks ties
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
      .filter((a) => !seen.has(a.id) && seen.add(a.id))
      .slice(0, MAX_ALBUMS)
      .map((a) => ({
        id: a.id,
        title: a.name,
        artist: a.artistName,
        releaseDate: a.releaseDate,
        artwork: cover(a.artworkUrl100),
      }));
    kept.set(country, { at: Date.now(), albums });
    return albums;
  } catch (e) {
    // an older answer beats none
    if (known) return known.albums;
    throw e;
  }
}
