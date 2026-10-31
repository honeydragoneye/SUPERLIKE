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
export { matches, matchesLyrics, matchesClean } from "@/lib/station/filter";
export type { StationFilter, LyricsKind, LyricsFlag } from "@/lib/station/filter";
import type { LyricsFlag } from "@/lib/station/filter";

type LrclibHit = {
  trackName: string;
  artistName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  /** LRC format: one `[mm:ss.xx]line` per row */
  syncedLyrics: string | null;
};

/** One line of a synced lyric, in milliseconds from the start of the track. */
export type LyricLine = { ms: number; text: string };

export type Lyrics = {
  instrumental: LyricsFlag;
  /** timed lines when LRCLIB has them, empty when it only has plain text */
  lines: LyricLine[];
  /** the plain text, for a track with no timings */
  plain: string[];
};

const UNKNOWN: Lyrics = { instrumental: null, lines: [], plain: [] };

/** How long a track LRCLIB failed to answer about stays unasked. */
const FAILED_KEPT_MS = 30_000;

/**
 * One track's answer, and whether its timings have been vetted.
 *
 * The flag matters because the two callers want different things from the same
 * request: the filter needs `instrumental` and nothing else, the panel needs
 * timings good enough to follow. An answer the filter settled for can reach
 * the panel through the cache, so the panel has to be able to tell that nobody
 * has checked the timings yet and take its turn.
 */
type Entry = { lyrics: Lyrics; vetted: boolean; /** LRCLIB did not answer: not a verdict, asked again later */ failed?: boolean };

/**
 * Survives a page reload only as long as the server process does; that is
 * enough. The whole answer is kept, not just the flag: the lyrics filter and
 * the lyrics panel ask about the same tracks, and the second to arrive should
 * pay nothing.
 *
 * Promises rather than values, so "the second to arrive" includes the one that
 * arrives while the first is still in flight. Measured in the dev log: the
 * panel asked for Umbrella twice within a few milliseconds and both missed a
 * cache that only held settled answers — 810ms and 1468ms for one track's
 * words. The pair now shares a single request.
 */
const cache = new Map<string, Promise<Entry>>();

/** `[01:23.45] text` → `{ ms: 83450, text }`. Rows without a stamp are dropped. */
function parseSynced(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const row of lrc.split("\n")) {
    const m = /^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/.exec(row.trim());
    if (!m) continue;
    const ms = (Number(m[1]) * 60 + Number(m[2])) * 1000;
    out.push({ ms: Math.round(ms), text: m[3].trim() });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

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
 * Picks the hit to answer with: a timed one when the song has one, and among
 * those the runtime closest to Spotify's.
 *
 * Search returns remasters, live cuts and edits together, and their
 * `instrumental` values differ — taking the first hit can answer for the wrong
 * version of the song. Duration alone was not enough either: a plain-text
 * upload that happens to sit closest would throw away a synced one a few
 * seconds further off, costing the panel the ability to follow for no gain.
 */
function bestHit(hits: LrclibHit[], durationMs?: number): LrclibHit | null {
  if (!hits.length) return null;
  const synced = hits.filter((h) => h.syncedLyrics);
  const pool = synced.length ? synced : hits;
  if (!durationMs) return pool[0];
  const target = durationMs / 1000;
  return pool.reduce((best, hit) => {
    const d = Math.abs((hit.duration ?? Infinity) - target);
    const bestD = Math.abs((best.duration ?? Infinity) - target);
    return d < bestD ? hit : best;
  });
}

/**
 * The longest stretch a timed transcription leaves unsung.
 *
 * A measure of whether the timings can be followed at all. Umbrella's entry
 * under the joined artist name stamps its first line at 0.56s and its next
 * words at 35.04s: for half a minute the highlighted line is the right one by
 * the file's own account and the wrong one by the song's. A sound
 * transcription keeps its gaps down to the length of a real instrumental
 * break.
 */
function deadGapMs(lines: LyricLine[]): number {
  const sung = lines.filter((l) => l.text);
  if (sung.length < 2) return Infinity;
  let worst = sung[0].ms;
  for (let i = 1; i < sung.length; i += 1) {
    worst = Math.max(worst, sung[i].ms - sung[i - 1].ms);
  }
  return worst;
}

/** Longer than any plausible instrumental break: the file is mis-stamped. */
const SUSPECT_GAP_MS = 25_000;

/**
 * Artist strings to ask LRCLIB about, in the order to try them.
 *
 * The joined string Spotify hands over goes first — an artist whose own name
 * carries a comma has to stay findable. But a collaboration credited
 * "Rihanna, JAY-Z" steers the search towards uploads that spell the pair the
 * same loose way, and those turn out to be the loose transcriptions: measured
 * on Umbrella, all twenty hits for the joined name are the same 84-line file
 * with a 31.5s dead stretch, while "Rihanna" alone returns an 82-line file
 * whose worst gap is 7.8s and which opens where the song does.
 */
function artistQueries(artistName: string): string[] {
  const primary = artistName.split(",")[0].trim();
  return primary && primary !== artistName ? [artistName, primary] : [artistName];
}

/** What a lookup came to: the lyrics, and whether LRCLIB failed to answer (as opposed to answering "none"). */
type Found = { lyrics: Lyrics | null; failed: boolean };

function toLyrics(hit: LrclibHit): Lyrics {
  return {
    instrumental: Boolean(hit.instrumental),
    lines: hit.syncedLyrics ? parseSynced(hit.syncedLyrics) : [],
    plain: (hit.plainLyrics ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

/**
 * One request, its hits or null when LRCLIB did not answer.
 *
 * LRCLIB answers some queries with 502/503 every time they are asked, however
 * often they are retried: measured, "Umbrella / Rihanna" and "Pretender /
 * Official髭男dism" fail by name and artist yet answer by track name alone.
 * An answer of "none" and no answer at all are different things, and telling
 * them apart is what lets the next way of asking be tried.
 */
async function hitsOf(url: string): Promise<LrclibHit[] | null> {
  try {
    const res = await lrclibHttp(url);
    if (res.status === 404) return [];
    if (!res.ok) return null;
    const body = (await res.json()) as LrclibHit | LrclibHit[];
    return Array.isArray(body) ? body : body ? [body] : [];
  } catch {
    return null;
  }
}

const SEARCH = "https://lrclib.net/api/search";
const GET = "https://lrclib.net/api/get";

/** One LRCLIB search by track and artist, reduced to the answer for its best-matching hit. */
async function search(trackName: string, artistName: string, durationMs?: number): Promise<Found> {
  const hits = await hitsOf(`${SEARCH}?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}`);
  if (hits === null) return { lyrics: null, failed: true };
  const hit = bestHit(hits, durationMs);
  return { lyrics: hit ? toLyrics(hit) : null, failed: false };
}

/** The exact lookup: LRCLIB's own match on name, artist and runtime. Needs the runtime. */
async function exact(trackName: string, artistName: string, durationMs: number): Promise<Found> {
  const hits = await hitsOf(
    `${GET}?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}&duration=${Math.round(durationMs / 1000)}`,
  );
  if (hits === null) return { lyrics: null, failed: true };
  return { lyrics: hits[0] ? toLyrics(hits[0]) : null, failed: false };
}

const norm = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** "Song (feat. X)" and "Song - Remastered" are the song. */
const core = (name: string) => norm(name.replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s-\s.*$/, ""));

/**
 * Whether a hit found by title alone is the song asked about.
 *
 * The title has to be the same, and then either the runtime or the artist
 * settles it: within 3s when the artist reads the same, within 2s when it does
 * not (LRCLIB often lists a Japanese act by its romaji — "Official髭男dism" is
 * "OFFICIAL HIGE DANDISM" there). Without a runtime only the artist can say.
 */
function sameSong(hit: LrclibHit, trackName: string, artistName: string, durationMs?: number): boolean {
  if (core(hit.trackName) !== core(trackName)) return false;
  const a = norm(hit.artistName);
  const b = norm(artistName.split(",")[0]);
  const sameArtist = Boolean(a && b && (a.includes(b) || b.includes(a)));
  if (!durationMs) return sameArtist;
  const off = Math.abs((hit.duration ?? Infinity) - durationMs / 1000);
  return off <= (sameArtist ? 3 : 2);
}

/** Title-only and free-text searches, keeping only hits that are the song asked about. */
async function broad(trackName: string, artistName: string, durationMs?: number): Promise<Found> {
  const primary = artistName.split(",")[0].trim();
  const urls = [
    `${SEARCH}?track_name=${encodeURIComponent(trackName)}`,
    `${SEARCH}?q=${encodeURIComponent(`${trackName} ${primary}`)}`,
  ];
  let failed = false;
  for (const url of urls) {
    const hits = await hitsOf(url);
    if (hits === null) {
      failed = true;
      continue;
    }
    const hit = bestHit(
      hits.filter((h) => sameSong(h, trackName, artistName, durationMs)),
      durationMs,
    );
    if (hit) return { lyrics: toLyrics(hit), failed: false };
  }
  return { lyrics: null, failed };
}

/**
 * Other ways of asking, for a track the first search did not settle.
 *
 * The exact lookup comes first and is cheap. `deep` adds the title-only
 * searches, which cost more requests: the lyrics panel (one track someone is
 * looking at) takes them, the filter (sixty tracks at a time) does not.
 */
async function fallbacks(
  trackName: string,
  artistName: string,
  durationMs: number | undefined,
  deep: boolean,
): Promise<Found> {
  let failed = false;
  if (durationMs) {
    for (const artist of artistQueries(artistName)) {
      const hit = await exact(trackName, artist, durationMs);
      if (hit.lyrics) return hit;
      failed = failed || hit.failed;
    }
  }
  if (deep) {
    const hit = await broad(trackName, artistName, durationMs);
    if (hit.lyrics) return hit;
    failed = failed || hit.failed;
  }
  return { lyrics: null, failed };
}

/** Nothing left to improve: no timings at all, or timings that already follow. */
function timingsSettled(lyrics: Lyrics): boolean {
  return lyrics.lines.length === 0 || deadGapMs(lyrics.lines) <= SUSPECT_GAP_MS;
}

/**
 * Asks the remaining artist spellings for a transcription that can be
 * followed, and keeps the best of them.
 */
async function escalate(
  found: Lyrics,
  trackName: string,
  artists: string[],
  durationMs?: number,
): Promise<Lyrics> {
  let best = found;
  for (const artist of artists) {
    const alt = (await search(trackName, artist, durationMs)).lyrics;
    if (alt?.lines.length && deadGapMs(alt.lines) < deadGapMs(best.lines)) best = alt;
    if (timingsSettled(best)) break;
  }
  return best;
}

/**
 * Any failure leaves the track unknown, never wrong.
 *
 * Re-throwing anything but a rate limit contradicted that contract and had
 * teeth: a single network blip inside a queue build propagated out and took
 * the whole build with it. Unknown is already excluded by matchesFilter, so
 * swallowing here loses a candidate rather than the request.
 */
function swallow(key: string, e: unknown): void {
  console.warn("[lrclib]", key, e instanceof Error ? e.message : e);
}

/** The first search, the other ways of asking when it settles nothing, and a second query when the caller needs good timings. */
async function load(
  key: string,
  trackName: string,
  artistName: string,
  durationMs: number | undefined,
  wantTimings: boolean,
): Promise<Entry> {
  const [first] = artistQueries(artistName);
  let found = UNKNOWN;
  let failed = false;
  try {
    const firstTry = await search(trackName, first, durationMs);
    found = firstTry.lyrics ?? UNKNOWN;
    failed = firstTry.failed;
    if (!firstTry.lyrics) {
      const other = await fallbacks(trackName, artistName, durationMs, wantTimings);
      if (other.lyrics) {
        found = other.lyrics;
        failed = false;
      } else {
        failed = failed || other.failed;
      }
    }
    /**
     * A second query only where the first one actually answered badly, and
     * only for a caller that reads timings.
     *
     * Not merely because a track has no synced lyrics: most have none, the
     * station's lyrics filter asks about sixty tracks at a time, and the flag
     * it needs is already in hand. Charging the filter for timings it never
     * reads would be the whole 가사 없음 wait made worse for nothing.
     */
    if (wantTimings && found !== UNKNOWN && !timingsSettled(found)) {
      found = await escalate(found, trackName, artistQueries(artistName).slice(1), durationMs);
    }
  } catch (e) {
    swallow(key, e);
    return { lyrics: found, vetted: true, failed: true };
  }
  return { lyrics: found, vetted: wantTimings || timingsSettled(found), failed };
}

/**
 * The whole LRCLIB answer for one track: the flag and, when it has them, the
 * words.
 *
 * One request serves both the lyrics filter and the lyrics panel. Keeping only
 * the boolean, as this did before, meant showing the words cost a second call
 * for something already fetched and thrown away.
 *
 * `timings: true` says the caller will read the timestamps, which buys the
 * extra query a mis-stamped transcription needs. The filter leaves it off.
 */
export async function fetchLyrics(
  trackName: string,
  artistName: string,
  durationMs?: number,
  trackId?: string,
  options?: { timings?: boolean },
): Promise<Lyrics> {
  const key = keyOf(trackId, trackName, artistName);
  const wantTimings = options?.timings ?? false;

  let pending = cache.get(key);
  if (!pending) {
    pending = load(key, trackName, artistName, durationMs, wantTimings);
    cache.set(key, pending);
  }
  let entry = await pending;

  /**
   * An answer that is only "LRCLIB did not answer" is not remembered for long.
   * Kept as a verdict it made a track read "no lyrics" until the server was
   * restarted; kept for half a minute it spares LRCLIB the same asking over and
   * over and lets the next press try again.
   */
  if (entry.failed) {
    const seen = pending;
    setTimeout(() => {
      if (cache.get(key) === seen) cache.delete(key);
    }, FAILED_KEPT_MS).unref?.();
  }

  /**
   * The filter ran first and settled for what it needed; now the panel wants
   * the words. Vetting here rather than on the way in keeps the upgrade from
   * costing anything until somebody actually displays the track.
   */
  if (wantTimings && !entry.vetted) {
    const [, ...rest] = artistQueries(artistName);
    const upgrade = (async (): Promise<Entry> => {
      try {
        return { lyrics: await escalate(entry.lyrics, trackName, rest, durationMs), vetted: true };
      } catch (e) {
        swallow(key, e);
        return { lyrics: entry.lyrics, vetted: true };
      }
    })();
    cache.set(key, upgrade);
    entry = await upgrade;
  }

  return entry.lyrics;
}

/** true = instrumental · false = has lyrics · null = unknown */
export async function checkInstrumental(
  trackName: string,
  artistName: string,
  durationMs?: number,
  trackId?: string,
): Promise<LyricsFlag> {
  const { instrumental } = await fetchLyrics(trackName, artistName, durationMs, trackId);
  return instrumental;
}
