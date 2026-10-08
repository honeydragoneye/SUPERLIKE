/**
 * The station's filter rules, in a module with no dependencies.
 *
 * Both sides need them: the server decides what enters the queue, the browser
 * decides what stays in it when the filter changes. Keeping a second copy on
 * the client let the two drift, so this lives apart from the LRCLIB client and
 * its HTTP machinery, which the browser has no business bundling.
 */

/** true = instrumental · false = has lyrics · null = unknown */
export type LyricsFlag = true | false | null;

/** The lyrics tags are one of a kind: a track cannot be both and neither. */
export type LyricsKind = "instrumental" | "lyrics" | null;

/**
 * Every tag at once.
 *
 * One field per dimension rather than a list of tag names, so a contradiction
 * is unrepresentable: 가사 없음 and 가사 있음 cannot both be on because they are
 * two values of the same field. A list would let the UI ask for both and match
 * nothing, and nothing in the type would have objected.
 */
export type StationFilter = {
  lyrics: LyricsKind;
  /** 19금 제외 — drop what Spotify marks explicit */
  clean: boolean;
  /**
   * A Last.fm genre to build from, not a test to pass.
   *
   * The other two are answered per track — Spotify sends `explicit`, LRCLIB
   * answers for lyrics — so they can keep or drop what is already queued. A
   * genre cannot: nothing on a candidate says which genres it belongs to, and
   * asking Last.fm would cost a request per artist. So this steers where the
   * ladder draws from instead, and `matches` below ignores it on purpose.
   */
  genre: string | null;
};

/** Nothing selected. A shared instance, so a reset is identity-stable. */
export const NO_FILTER: StationFilter = { lyrics: null, clean: false, genre: null };

/** Whether anything is actually being filtered — 해제 returns here. */
export function isFiltered(filter: StationFilter): boolean {
  return filter.lyrics !== null || filter.clean || filter.genre !== null;
}

export function sameFilter(a: StationFilter, b: StationFilter): boolean {
  return a.lyrics === b.lyrics && a.clean === b.clean && a.genre === b.genre;
}

/** What a candidate has to carry to be judged against a filter. */
export type Judgeable = {
  instrumental?: LyricsFlag;
  explicit?: boolean;
};

/** Unknown never satisfies a filter — absence of data is not evidence. */
export function matchesLyrics(flag: LyricsFlag, kind: LyricsKind): boolean {
  if (kind === null) return true;
  if (kind === "instrumental") return flag === true;
  return flag === false;
}

/**
 * The same rule, for 19금.
 *
 * Spotify sends `explicit` on every track, so unknown should not arise — but a
 * candidate built before the field existed would carry none, and letting that
 * through would play a 19금 track to someone who asked for clean. Unknown is a
 * no here for the same reason it is for lyrics.
 */
export function matchesClean(explicit: boolean | undefined, clean: boolean): boolean {
  if (!clean) return true;
  return explicit === false;
}

/**
 * Every dimension a candidate can be judged on, cheapest first: `clean` is
 * free, lyrics costs a request. `genre` is absent because a candidate carries
 * no genre to test — it is applied when the queue is built, not filtered.
 */
export function matches(track: Judgeable, filter: StationFilter): boolean {
  return (
    matchesClean(track.explicit, filter.clean) &&
    matchesLyrics(track.instrumental ?? null, filter.lyrics)
  );
}
