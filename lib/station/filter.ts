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
 * The mood tags. One at a time, like the lyrics pair: a queue that is both
 * 우울·슬픔 and 경쾌 is a queue of nothing.
 */
export type BuiltinMoodKey = "blue" | "upbeat" | "rhythmic";

/**
 * A tag the listener wrote: "u:" and an id of their own.
 *
 * It rides in the same field as the built-in moods, since it is judged the same
 * way — Gemini reads a title and an artist against a definition. The
 * definition is not in this key: it lives in the browser and goes to the
 * server with each request that needs it.
 */
export type CustomMoodKey = `u:${string}`;

export type MoodKey = BuiltinMoodKey | CustomMoodKey;

export function isCustomMood(mood: MoodKey | null): mood is CustomMoodKey {
  return mood !== null && mood.startsWith("u:");
}

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
  /**
   * Gemini's reading of the track, from its title and artist.
   *
   * Answered per track like lyrics, so it can re-judge what is already queued —
   * but it is an estimate where the other two are facts: the model has not
   * heard the song. See lib/station/moods for what each key means.
   */
  mood: MoodKey | null;
};

/** Nothing selected. A shared instance, so a reset is identity-stable. */
export const NO_FILTER: StationFilter = {
  lyrics: null,
  clean: false,
  genre: null,
  mood: null,
};

/** Whether anything is actually being filtered — 해제 returns here. */
export function isFiltered(filter: StationFilter): boolean {
  return (
    filter.lyrics !== null ||
    filter.clean ||
    filter.genre !== null ||
    filter.mood !== null
  );
}

export function sameFilter(a: StationFilter, b: StationFilter): boolean {
  return (
    a.lyrics === b.lyrics &&
    a.clean === b.clean &&
    a.genre === b.genre &&
    a.mood === b.mood
  );
}

/** What a candidate has to carry to be judged against a filter. */
export type Judgeable = {
  instrumental?: LyricsFlag;
  explicit?: boolean;
  /** absent until Gemini has answered for this track */
  moods?: readonly MoodKey[];
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
 * The same rule, for mood.
 *
 * No verdict is a no. It matters more here than anywhere: Gemini can be out of
 * quota or simply not answer, and waving those tracks through would fill a
 * 경쾌 queue with whatever happened to be asked about during the outage.
 */
export function matchesMood(
  moods: readonly MoodKey[] | undefined,
  mood: MoodKey | null,
): boolean {
  if (mood === null) return true;
  return moods !== undefined && moods.includes(mood);
}

/**
 * Every dimension a candidate can be judged on, cheapest first: `clean` is
 * free, lyrics and mood each cost a request. `genre` is absent because a
 * candidate carries no genre to test — it is applied when the queue is built,
 * not filtered.
 */
export function matches(track: Judgeable, filter: StationFilter): boolean {
  return (
    matchesClean(track.explicit, filter.clean) &&
    matchesLyrics(track.instrumental ?? null, filter.lyrics) &&
    matchesMood(track.moods, filter.mood)
  );
}
