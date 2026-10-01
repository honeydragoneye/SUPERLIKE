import { lrclibHttp } from "@/lib/http/throttle";

/**
 * Whether a track has lyrics.
 *
 * `null` means LRCLIB has no entry, not "no lyrics" — niche tracks are often
 * missing, and treating absence as instrumental would quietly corrupt the
 * filter. Callers exclude unknowns.
 *
 * The type and the predicate live in lib/station/filter so the browser can use
 * them without pulling in this module's HTTP layer.
 */
export { matchesFilter } from "@/lib/station/filter";
export type { FilterKind, LyricsFlag } from "@/lib/station/filter";
import type { LyricsFlag } from "@/lib/station/filter";

type LrclibHit = {
  trackName: string;
  artistName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
};

/** Survives a page reload only as long as the server process does; that is enough. */
const cache = new Map<string, LyricsFlag>();

/**
 * Cache identity.
 *
 * Spotify's track id when the caller has one, which every caller here does.
 * Keying on `name|artist` looked equivalent and was not: the ladder passes the
 * first artist and the batch route passes the joined string, so the same track
 * cached twice and a queue that had just been judged was judged again from
 * scratch. An id has no such ambiguity.
 */
function keyOf(id: string | undefined, track: string, artist: string): string {
  return id ? `id:${id}` : `${track}|${artist}`.toLowerCase();
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
  trackId?: string,
): Promise<LyricsFlag> {
  const key = keyOf(trackId, trackName, artistName);
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
    /**
     * Any failure leaves the track unknown, never wrong.
     *
     * Re-throwing anything but a rate limit contradicted the line above and had
     * teeth: a single network blip inside a queue build propagated out and took
     * the whole build with it. Unknown is already excluded by matchesFilter, so
     * swallowing here loses a candidate rather than the request.
     */
    console.warn("[lrclib]", key, e instanceof Error ? e.message : e);
  }

  cache.set(key, flag);
  return flag;
}

