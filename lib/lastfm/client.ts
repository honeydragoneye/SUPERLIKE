import { RateLimitedError, lastfmHttp } from "@/lib/http/throttle";
import { canonicalTag, isGenreTag, isOwnName } from "./tags";

export { canonicalTag, isGenreTag, isOwnName } from "./tags";

const BASE = "https://ws.audioscrobbler.com/2.0/";

/**
 * A candidate as Last.fm knows it — names only, no Spotify id yet.
 *
 * `match` is Last.fm's own similarity, 0–1. Measured on "International Love
 * Song": 1.0, 0.63, 0.13, 0.054 — the tail is noise, and throwing the score
 * away meant the queue treated the last of those like the first.
 */
export type LfmCandidate = { name: string; artist: string; match?: number };

/**
 * Last.fm indexes some artists under a different name than Spotify uses.
 * Extend as gaps turn up; the lookup falls back to the raw name first.
 */
const ARTIST_ALIAS: Record<string, string> = {
  아이유: "IU",
};

/**
 * Drops the parenthetical noise Spotify carries and Last.fm does not —
 * "(Remastered 2011)", "[Live]", " - Radio Edit".
 */
/**
 * Spotify joins collaborating artists into one string — "T-ARA, 초신성" for a
 * duet — but Last.fm has no such entry: it indexes each artist separately.
 * Measured on TTL (Time To Love): the joined name returns 0 similar tracks and
 * 0 tags, "T-ARA" alone returns 60 similar tracks and 10 tags.
 *
 * So the joined name is tried first — right for an artist whose own name
 * contains a comma — then each part on its own, each with its alias.
 */
export function artistCandidates(artistName: string): string[] {
  const parts = artistName
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const withAliases = [artistName, ...parts].flatMap((n) => [n, ARTIST_ALIAS[n]]);
  return Array.from(new Set(withAliases.filter(Boolean) as string[]));
}

export function cleanTitle(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s-\s.*$/, "")
    .trim();
}

function endpoint(method: string, params: Record<string, string | number>): string {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("LASTFM_API_KEY is not set");
  const query = new URLSearchParams({
    method,
    api_key: key,
    format: "json",
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${BASE}?${query}`;
}

type LfmError = { error?: number; message?: string };

/** Last.fm answers 200 with an error body; these are worth stopping for. */
function fatal(data: LfmError): string | null {
  switch (data.error) {
    case 10:
      return "Last.fm API 키가 잘못되었습니다";
    case 26:
      return "Last.fm 계정이 정지되었습니다";
    case 29:
      return "Last.fm 요청 제한을 초과했습니다";
    default:
      return null;
  }
}

/**
 * Last.fm collapses a single result to an object instead of a one-item array,
 * so every list it returns has to be normalised before use.
 */
function asList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function toCandidate(t: Record<string, unknown>): LfmCandidate {
  const artist = t.artist as { name?: string } | string | undefined;
  const match = Number(t.match);
  return {
    name: String(t.name ?? ""),
    artist: typeof artist === "string" ? artist : String(artist?.name ?? ""),
    match: Number.isFinite(match) ? match : undefined,
  };
}

/** Artists Last.fm considers close to this one, strongest first. */
export async function similarArtists(
  artistName: string,
  limit = 5,
): Promise<{ name: string; match: number }[]> {
  for (const artist of artistCandidates(artistName)) {
    const data = await call<{ similarartists?: { artist?: unknown } }>(
      endpoint("artist.getsimilar", { artist, limit, autocorrect: 1 }),
    );
    if (fatal(data)) return [];
    const out = asList(data?.similarartists?.artist)
      .map((a) => ({ name: String(a.name ?? ""), match: Number(a.match) || 0 }))
      .filter((a) => a.name);
    if (out.length) return out;
  }
  return [];
}

/** What Last.fm writes about an artist or an album: the user-written summary, the listeners, the genre tags. */
export type LfmInfo = { summary: string; listeners: number | null; tags: string[] };

/** Last.fm's wiki text carries HTML links and a licence tail; neither belongs on screen. */
function plainWiki(text: unknown): string {
  return String(text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s*User-contributed text is available[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Genre tags only, each once, and never the artist's own name (people tag an album with it). */
function genreTags(raw: unknown, names: string[]): string[] {
  return [
    ...new Set(
      asList(raw)
        .map((t) => canonicalTag(String(t.name ?? "")))
        .filter(Boolean)
        .filter(isGenreTag)
        .filter((t) => !isOwnName(t, names)),
    ),
  ].slice(0, 3);
}

/** `artist.getInfo`, tried under each spelling Last.fm might know the artist by; null when it knows none. */
export async function artistInfo(artistName: string): Promise<LfmInfo | null> {
  for (const artist of artistCandidates(artistName)) {
    const data = await call<{
      artist?: { stats?: { listeners?: string }; bio?: { summary?: string }; tags?: { tag?: unknown } };
    }>(endpoint("artist.getinfo", { artist, autocorrect: 1 }));
    if (fatal(data) || !data?.artist) continue;
    const listeners = Number(data.artist.stats?.listeners);
    return {
      summary: plainWiki(data.artist.bio?.summary),
      listeners: Number.isFinite(listeners) && listeners > 0 ? listeners : null,
      tags: genreTags(data.artist.tags?.tag, artistCandidates(artistName)),
    };
  }
  return null;
}

/** `album.getInfo`: the summary and the tags people gave the album. */
export async function albumInfo(albumName: string, artistName: string): Promise<LfmInfo | null> {
  for (const artist of artistCandidates(artistName)) {
    const data = await call<{
      album?: { listeners?: string; wiki?: { summary?: string }; tags?: { tag?: unknown } };
    }>(endpoint("album.getinfo", { artist, album: cleanTitle(albumName) || albumName, autocorrect: 1 }));
    if (fatal(data) || !data?.album) continue;
    const listeners = Number(data.album.listeners);
    return {
      summary: plainWiki(data.album.wiki?.summary),
      listeners: Number.isFinite(listeners) && listeners > 0 ? listeners : null,
      tags: genreTags(data.album.tags?.tag, artistCandidates(artistName)),
    };
  }
  return null;
}

/** An artist's most-played tracks. */
export async function artistTopTracks(
  artistName: string,
  limit = 10,
): Promise<LfmCandidate[]> {
  const data = await call<{ toptracks?: { track?: unknown } }>(
    endpoint("artist.gettoptracks", { artist: artistName, limit, autocorrect: 1 }),
  );
  if (fatal(data)) return [];
  return asList(data?.toptracks?.track)
    .map(toCandidate)
    .filter((c) => c.name && c.artist);
}

async function call<T>(url: string): Promise<T & LfmError> {
  try {
    const res = await lastfmHttp(url);
    return (await res.json()) as T & LfmError;
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return { error: 29, message: e.message } as T & LfmError;
    }
    throw e;
  }
}

/**
 * Similar tracks for a seed.
 *
 * Tries the artist alias and a cleaned title before giving up, because a miss
 * here is silent — Last.fm returns an empty list rather than an error for
 * tracks it does not know.
 */
export async function similarTracks(
  trackName: string,
  artistName: string,
  limit: number,
): Promise<{ candidates: LfmCandidate[]; error: string | null }> {
  const artists = artistCandidates(artistName);
  const titles = Array.from(new Set([trackName, cleanTitle(trackName)]));

  for (const artist of artists) {
    for (const track of titles) {
      const data = await call<{ similartracks?: { track?: unknown } }>(
        endpoint("track.getsimilar", { artist, track, limit }),
      );
      const stop = fatal(data);
      if (stop) return { candidates: [], error: stop };

      const tracks = asList(data?.similartracks?.track)
        .map(toCandidate)
        .filter((c) => c.name && c.artist);
      if (tracks.length > 0) return { candidates: tracks, error: null };
    }
  }
  return { candidates: [], error: null };
}

/** Genre tags for an artist, most-weighted first. */
export async function artistTopTags(artistName: string, limit = 3): Promise<string[]> {
  const artists = artistCandidates(artistName);
  for (const artist of artists) {
    const data = await call<{ toptags?: { tag?: unknown } }>(
      endpoint("artist.gettoptags", { artist }),
    );
    if (fatal(data)) return [];
    const tags = [
      ...new Set(
        asList(data?.toptags?.tag)
          .map((t) => canonicalTag(String(t.name ?? "")))
          .filter(Boolean)
          .filter(isGenreTag)
          // an artist's own name is not a genre, however many people tag it
          .filter((t) => !isOwnName(t, artists)),
      ),
    ];
    if (tags.length > 0) return tags.slice(0, limit);
  }
  return [];
}

/**
 * How many listeners a tag needs before it is offered as a genre.
 *
 * "yuma e maki da jen" came up as a pill: one person's shelf, seven tracks to
 * its name, and a reach of 0. No list of words would have caught it, and the
 * next one will be spelled differently. Measured beside it: trot 298, korean
 * indie 363, city pop 903, slowcore 7,360 — so the floor sits well under the
 * smallest real genre seen, and only clears out tags nobody else uses.
 *
 * It does not catch a tag that is popular and still not a genre —
 * "nickelodeon" has a reach of 366 — which is what NON_GENRE_TAGS is for.
 */
const MIN_TAG_REACH = 100;

/** Reach by tag, for as long as the server runs: "pop" is asked about once. */
const reachCache = new Map<string, number>();

/**
 * True when enough people use a tag for it to mean something.
 *
 * A lookup that fails says nothing about the tag, so it passes and is not
 * remembered: hiding SHOEGAZE because Last.fm had a bad second would be a
 * worse answer than showing one stray pill.
 */
export async function isSharedTag(tag: string): Promise<boolean> {
  const known = reachCache.get(tag);
  if (known !== undefined) return known >= MIN_TAG_REACH;
  try {
    const data = await call<{ tag?: { reach?: unknown } }>(endpoint("tag.getinfo", { tag }));
    if (data.error || !data.tag) return true;
    const reach = Number(data.tag.reach) || 0;
    reachCache.set(tag, reach);
    return reach >= MIN_TAG_REACH;
  } catch {
    return true;
  }
}

/**
 * Popular tracks carrying a tag — the genre and "instrumental" pools.
 *
 * `page` reaches past the first `limit`: measured on "christmas", page 3 of 50
 * opens with 2000 Miles, Happy Xmas (War Is Over) and Step Into Christmas, so
 * the chart is still the genre a hundred places down.
 */
export async function tagTopTracks(
  tag: string,
  limit = 30,
  page = 1,
): Promise<LfmCandidate[]> {
  const data = await call<{ tracks?: { track?: unknown } }>(
    endpoint("tag.gettoptracks", { tag, limit, page }),
  );
  if (fatal(data)) return [];
  return asList(data?.tracks?.track)
    .map(toCandidate)
    .filter((c) => c.name && c.artist);
}
