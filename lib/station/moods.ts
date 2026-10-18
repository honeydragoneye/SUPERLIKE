/**
 * The mood tags, and how to read Gemini's answer about them.
 *
 * A module with no dependencies, like lib/station/filter: the browser needs the
 * labels, the server needs the definitions, and the parsing rule is worth being
 * able to exercise without an API key.
 */
import type { BuiltinMoodKey, CustomMoodKey, MoodKey } from "./filter";

/**
 * A tag is a definition and a few songs that have it.
 *
 * That is all the model is ever given, which is what makes a tag teachable:
 * changing what 경쾌 means is editing two strings here, not retraining anything.
 * Measured on thirteen hand-labelled tracks, title and artist alone scored
 * 11/13 on Flash-Lite — adding lyrics or genre tags made it slightly worse.
 */
export type MoodTag = {
  key: BuiltinMoodKey;
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

/** Built-in tags only; a custom tag has no entry here, its definition is the listener's. */
export function moodTag(key: BuiltinMoodKey): MoodTag {
  return MOODS.find((m) => m.key === key)!;
}

/** A tag the listener wrote, as the server is told about it. */
export type CustomMoodSpec = {
  key: CustomMoodKey;
  label: string;
  /** what the model is told the tag means */
  definition: string;
};

export const CUSTOM_LABEL_MAX = 12;
export const CUSTOM_DEFINITION_MAX = 80;

/**
 * A spec from outside, or nothing.
 *
 * The definition goes into the model's instructions, so it is bounded and
 * flattened to one line here rather than trusted as sent.
 */
export function cleanCustomSpec(raw: unknown): CustomMoodSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { key, label, definition } = raw as Record<string, unknown>;
  if (typeof key !== "string" || !/^u:[a-z0-9]{1,16}$/.test(key)) return undefined;
  if (typeof label !== "string" || typeof definition !== "string") return undefined;
  const flat = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
  const l = flat(label, CUSTOM_LABEL_MAX);
  const d = flat(definition, CUSTOM_DEFINITION_MAX);
  if (!l || !d) return undefined;
  return { key: key as CustomMoodKey, label: l, definition: d };
}

/**
 * What the model is told before it sees a single track.
 *
 * With a custom tag it is asked about that tag alone: the built-ins are not
 * part of the question, and the answer is kept apart from theirs.
 */
export function moodInstruction(custom?: CustomMoodSpec): string {
  if (custom) {
    return (
      "You tag songs for a music player's station filter.\n" +
      `Tag (use only this key): ${custom.key}: ${custom.definition}\n` +
      `For each track answer [${JSON.stringify(custom.key)}] when it clearly fits, [] when it does not.\n` +
      'Answer with JSON only: [{"id": "...", "tags": [...]}] — one entry per track, same ids.'
    );
  }
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
export function parseMoodAnswer(
  raw: unknown,
  count: number,
  custom?: CustomMoodSpec,
): (MoodKey[] | null)[] {
  const allowed = custom ? new Set<string>([custom.key]) : KEYS;
  const out: (MoodKey[] | null)[] = Array.from({ length: count }, () => null);
  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { id, tags } = entry as { id?: unknown; tags?: unknown };
    const m = typeof id === "string" ? /^t(\d+)$/.exec(id.trim()) : null;
    if (!m || !Array.isArray(tags)) continue;
    const at = Number(m[1]) - 1;
    if (at < 0 || at >= count) continue;
    out[at] = [...new Set(tags.filter((t): t is MoodKey => allowed.has(t)))].slice(
      0,
      MAX_MOODS_PER_TRACK,
    );
  }
  return out;
}
