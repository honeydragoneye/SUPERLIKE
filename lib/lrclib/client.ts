import { RateLimitedError, lrclibHttp } from "@/lib/http/throttle";

/**
 * Whether a track has lyrics.
 *
 * `null` means LRCLIB has no entry, not "no lyrics" — niche tracks are often
 * missing, and treating absence as instrumental would quietly corrupt the
 * filter. Callers exclude unknowns.
 */
export type LyricsFlag = true | false | null;

type LrclibHit = {
  trackName: string;
  artistName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
};

/** Survives a page reload only as long as the server process does; that is enough. */
const cache = new Map<string, LyricsFlag>();

function keyOf(track: string, artist: string): string {
  return `${track}|${artist}`.toLowerCase();
}

/**
 * Picks the hit whose runtime is closest to Spotify's.
 *
 * Search returns remasters, live cuts and edits together, and their
 * `instrumental` values differ — taking the first hit can answer for the wrong
 * version of the song.
 */
function bestHit(hits: LrclibHit[], durationMs?: number): LrclibHit | null {
  if (!hits.length) return null;
  if (!durationMs) return hits[0];
  const target = durationMs / 1000;
  return hits.reduce((best, hit) => {
    const d = Math.abs((hit.duration ?? Infinity) - target);
    const bestD = Math.abs((best.duration ?? Infinity) - target);
    return d < bestD ? hit : best;
  });
}

/** true = instrumental · false = has lyrics · null = unknown */
export async function checkInstrumental(
  trackName: string,
  artistName: string,
  durationMs?: number,
): Promise<LyricsFlag> {
  const key = keyOf(trackName, artistName);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let flag: LyricsFlag = null;
  try {
    const url =
      "https://lrclib.net/api/search" +
      `?track_name=${encodeURIComponent(trackName)}` +
      `&artist_name=${encodeURIComponent(artistName)}`;
    const res = await lrclibHttp(url);
    if (res.ok) {
      const hits = (await res.json()) as LrclibHit[];
      const hit = Array.isArray(hits) ? bestHit(hits, durationMs) : null;
      if (hit) flag = Boolean(hit.instrumental);
    }
  } catch (e) {
    // a throttled or unreachable LRCLIB leaves the track unknown, not wrong
    if (!(e instanceof RateLimitedError)) throw e;
  }

  cache.set(key, flag);
  return flag;
}

export type FilterKind = "instrumental" | "lyrics" | null;

/** Mirrors the prototype: unknown (null) never satisfies a filter. */
export function matchesFilter(flag: LyricsFlag, filter: FilterKind): boolean {
  if (filter === null) return true;
  if (filter === "instrumental") return flag === true;
  if (filter === "lyrics") return flag === false;
  return true;
}
