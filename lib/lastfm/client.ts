import { RateLimitedError, lastfmHttp } from "@/lib/http/throttle";

const BASE = "https://ws.audioscrobbler.com/2.0/";

/** A candidate as Last.fm knows it — names only, no Spotify id yet. */
export type LfmCandidate = { name: string; artist: string };

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
  return {
    name: String(t.name ?? ""),
    artist:
      typeof artist === "string" ? artist : String(artist?.name ?? ""),
  };
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
    const tags = asList(data?.toptags?.tag)
      .map((t) => String(t.name ?? "").toLowerCase())
      .filter(Boolean);
    if (tags.length > 0) return tags.slice(0, limit);
  }
  return [];
}

/** Popular tracks carrying a tag — the genre and "instrumental" pools. */
export async function tagTopTracks(tag: string, limit = 30): Promise<LfmCandidate[]> {
  const data = await call<{ tracks?: { track?: unknown } }>(
    endpoint("tag.gettoptracks", { tag, limit }),
  );
  if (fatal(data)) return [];
  return asList(data?.tracks?.track)
    .map(toCandidate)
    .filter((c) => c.name && c.artist);
}
