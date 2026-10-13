/**
 * The mood tags, and how to read Gemini's answer about them.
 *
 * A module with no dependencies, like lib/station/filter: the browser needs the
 * labels, the server needs the definitions, and the parsing rule is worth being
 * able to exercise without an API key.
 */
import type { MoodKey } from "./filter";

/**
 * A tag is a definition and a few songs that have it.
 *
 * That is all the model is ever given, which is what makes a tag teachable:
 * changing what 경쾌 means is editing two strings here, not retraining anything.
 * Measured on thirteen hand-labelled tracks, title and artist alone scored
 * 11/13 on Flash-Lite — adding lyrics or genre tags made it slightly worse.
 */
export type MoodTag = {
  key: MoodKey;
  label: string;
  /** shown on the pill */
  hint: string;
  /** what the model is told the tag means */
  definition: string;
  /** "Title — Artist", songs that plainly carry it */
  examples: string[];
  /** Last.fm tags whose top tracks are worth asking about when the seed's own neighbours run out */
  pools: string[];
};

/**
 * 우울 and 슬픔 are one tag.
 *
 * They were two, and the model could not tell them apart: Fake Plastic Trees
 * and WILDFLOWER came back as both, every time. Two pills returning nearly the
 * same queue promise a distinction the judge cannot make.
 */
export const MOODS: MoodTag[] = [
  {
    key: "blue",
    label: "우울·슬픔",
    hint: "가라앉거나 이별·그리움이 드러나는 곡만",
    definition:
      "sad or gloomy — heartbreak, parting, longing or loss carried openly, or a sunk, dark, heavy and inward mood; often slow or a ballad",
    examples: [
      "Fake Plastic Trees — Radiohead",
      "WILDFLOWER — Billie Eilish",
      "스토커 — 10CM",
      "곰인형 — 린",
    ],
    pools: ["sad", "melancholy"],
  },
  {
    key: "upbeat",
    label: "경쾌",
    hint: "밝고 가벼운 곡만",
    definition: "bright, light and feel-good; easy and pleasant",
    examples: [
      "Hype Boy — NewJeans",
      "Cruel Summer — Taylor Swift",
      "Vancouver — BIG Naughty",
    ],
    pools: ["happy", "upbeat"],
  },
  {
    key: "rhythmic",
    label: "리드미컬",
    hint: "비트와 그루브가 끌고 가는 곡만",
    definition: "driven by beat and groove; energy that moves the body",
    examples: [
      "Rush — Troye Sivan",
      "Victory Lap — Fred again..",
      "UNDERWATER BOI — Turnstile",
    ],
    pools: ["dance", "funk"],
  },
];

/**
 * Moods one track may carry.
 *
 * Hype Boy is 경쾌 and 리드미컬 both, and plenty of songs are. Forcing a single
 * answer would starve whichever tag lost the coin toss.
 */
export const MAX_MOODS_PER_TRACK = 2;

const KEYS = new Set<string>(MOODS.map((m) => m.key));

export function moodTag(key: MoodKey): MoodTag {
  return MOODS.find((m) => m.key === key)!;
}

/** What the model is told before it sees a single track. */
export function moodInstruction(): string {
  return (
    "You tag songs for a music player's station filter.\n" +
    "Tags (use only these keys):\n" +
    MOODS.map((m) => `- ${m.key}: ${m.definition}. Examples: ${m.examples.join("; ")}`).join("\n") +
    `\nFor each track list every tag that clearly fits, at most ${MAX_MOODS_PER_TRACK}, best first; [] when none fits.\n` +
    'Answer with JSON only: [{"id": "...", "tags": [...]}] — one entry per track, same ids.'
  );
}

/**
 * The tracks, under ids of our own.
 *
 * Positional ids rather than Spotify's: a 22-character base62 id is something a
 * model can get one letter wrong in, and a wrong letter is a verdict silently
 * attached to nothing. `t3` is hard to misspell.
 */
export function moodQuestion(tracks: { name: string; artist: string }[]): string {
  return (
    "Tag these tracks:\n" +
    tracks.map((t, i) => `t${i + 1} | ${t.name} — ${t.artist}`).join("\n")
  );
}

/**
 * Gemini's answer, one verdict per track in the order they were asked.
 *
 * `null` is "no answer for this one", which is not the same as `[]`, "none of
 * the tags fit". The first is unknown and satisfies no filter; the second is a
 * verdict worth remembering. Anything malformed lands on the unknown side: a
 * tag the model invented is dropped, an entry without a list is no entry.
 */
export function parseMoodAnswer(raw: unknown, count: number): (MoodKey[] | null)[] {
  const out: (MoodKey[] | null)[] = Array.from({ length: count }, () => null);
  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { id, tags } = entry as { id?: unknown; tags?: unknown };
    const m = typeof id === "string" ? /^t(\d+)$/.exec(id.trim()) : null;
    if (!m || !Array.isArray(tags)) continue;
    const at = Number(m[1]) - 1;
    if (at < 0 || at >= count) continue;
    out[at] = [...new Set(tags.filter((t): t is MoodKey => KEYS.has(t)))].slice(
      0,
      MAX_MOODS_PER_TRACK,
    );
  }
  return out;
}
