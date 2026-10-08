/**
 * What counts as a genre tag, and how it is spelled.
 *
 * A module with no dependencies, like lib/station/filter: these are rules about
 * a vocabulary, not about fetching anything, and keeping them beside the HTTP
 * client meant they could not be exercised without one.
 */

/**
 * Words that name a place or a nationality.
 *
 * Matched word by word rather than as whole tags, because the list was never
 * going to keep up: "korea" was excluded and "south korea" was not, so 잠비나이
 * offered it as a genre and picking it would have filled the queue by country.
 *
 * A tag is only dropped when *every* word is one of these, which is what keeps
 * the real genres that happen to carry a place: "uk garage", "french house"
 * and "korean rock" all name a sound, while "south korea" and "new zealand"
 * name only a map.
 */
const PLACE_WORDS = new Set([
  "north", "south", "east", "west", "new", "united", "kingdom", "states",
  "korea", "korean", "japan", "japanese", "china", "chinese", "taiwan",
  "taiwanese", "hong", "kong", "spain", "spanish", "france", "french",
  "germany", "german", "sweden", "swedish", "norway", "norwegian", "finland",
  "finnish", "britain", "british", "america", "american", "england", "english",
  "ireland", "irish", "scotland", "scottish", "wales", "welsh", "italy",
  "italian", "russia", "russian", "brazil", "brazilian", "canada", "canadian",
  "australia", "australian", "zealand", "mexico", "mexican", "india", "indian",
  "uk", "usa", "us", "eu",
]);

/**
 * Tags that say something other than what a record sounds like.
 *
 * "Korean" is the top tag on The Black Skirts at weight 100, ahead of "indie"
 * (86) and "korean indie" (50). Its top tracks are the most-played Korean songs
 * on Last.fm — Gee, The Boys, Run Devil Run — so a Korean indie seed built a
 * queue of Girls' Generation. Language, decade and personal shelving tags all
 * fail the same way; origin is handled by PLACE_WORDS above.
 */
const NON_GENRE_TAGS = new Set([
  "seen live", "favorites", "favourites", "favorite songs", "my favorites",
  "love", "beautiful", "awesome", "cool", "catchy", "masterpiece",
  "good", "great", "nice", "best", "amazing", "fun", "perfect", "epic",
  "male vocalists", "female vocalists", "male vocalist", "female vocalist",
  // a mood, not a sound — and the one the Gemini step will answer properly
  "chill", "sad", "happy", "melancholy", "energetic",
  // what you do with music, or that it is music at all
  "music", "band", "bands", "artist", "song", "songs", "album", "albums",
  "listen", "check out", "to listen", "listened", "want to listen",
  "60s", "70s", "80s", "90s", "00s", "10s", "20s",
  "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s",
]);

/**
 * Tags that describe the listening, not the record: "under 2000 listeners",
 * "over 2 hours". A prefix rule because the numbers are unbounded.
 */
const META_PREFIX = /^(under|over|less than|more than|at least)\b/;

/**
 * One spelling per genre.
 *
 * Last.fm lets everyone write the tag their own way, so the same genre arrives
 * under several — 소녀시대 carries both "k-pop" and "kpop", which would stand as
 * two pills that do nearly but not quite the same thing. Each variant maps to
 * whichever spelling Last.fm itself has the most taggings under, measured
 * rather than assumed: the hyphen usually wins but not always, which is why
 * "synthpop" (301k) and "rnb" (388k) are the targets and not "synth-pop" (16k)
 * or "r&b" (8k).
 */
const TAG_ALIAS: Record<string, string> = {
  kpop: "k-pop",
  "korean pop": "k-pop",
  jpop: "j-pop",
  "japanese pop": "j-pop",
  cpop: "c-pop",
  hiphop: "hip-hop",
  "hip hop": "hip-hop",
  "r&b": "rnb",
  "rhythm and blues": "rnb",
  lofi: "lo-fi",
  "synth pop": "synthpop",
  "synth-pop": "synthpop",
  dnb: "drum and bass",
  "drum n bass": "drum and bass",
};

/** The spelling this app uses for a genre, whichever one Last.fm sent. */
export function canonicalTag(tag: string): string {
  const key = tag.trim().toLowerCase();
  return TAG_ALIAS[key] ?? key;
}

/** True when a tag names a sound rather than an origin, a shelf or a shrug. */
export function isGenreTag(tag: string): boolean {
  const key = tag.trim().toLowerCase();
  if (!key) return false;
  if (NON_GENRE_TAGS.has(key)) return false;
  if (META_PREFIX.test(key)) return false;

  const bare = key.replace(/[^\p{L}\p{N}]+/gu, "");
  /**
   * A single character says nothing — "a" alone carries 19,813 taggings on
   * Last.fm and arrives as a pill meaning nothing at all. Two is the floor
   * because "oi" is a real one.
   */
  if (bare.length < 2) return false;
  /**
   * A bare number is a year or a count. The decade tags were listed one by one
   * above and the individual years were not, so 30 of them — 1994, 2012, 2020 —
   * came through as genres.
   */
  if (/^\d+$/.test(bare)) return false;

  // only a tag that is *nothing but* place names is an origin
  return !key.split(/[\s-]+/).every((word) => PLACE_WORDS.has(word));
}

/**
 * Letters and digits only, so punctuation and spacing cannot hide a match:
 * "T-ARA", "t ara" and "tara" all fold to the same thing.
 */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * True when a tag is just the artist's own name.
 *
 * Measured across 21 artists: a third of them carry one — RIHANNA, JAY-Z,
 * KANYE WEST, IU, T-ARA — and as a pill it promises a genre and delivers the
 * discography you are already listening to. The name is in hand, so this costs
 * no request.
 *
 * Only an exact fold matches, which leaves a romanisation (宇多田ヒカル tagged
 * "utada hikaru") and an abbreviation (소녀시대 tagged "snsd") in place. Both
 * would need a transliteration table this app has no other use for, and
 * picking one still returns that artist's own songs — wrong as a label, not as
 * a result.
 */
export function isOwnName(tag: string, artistNames: string[]): boolean {
  const folded = fold(tag);
  if (!folded) return false;
  return artistNames.some((name) => fold(name) === folded);
}
