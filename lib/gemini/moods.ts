import { RateLimitedError, geminiHttp } from "@/lib/http/throttle";
import type { MoodKey } from "@/lib/station/filter";
import {
  MOODS,
  moodInstruction,
  moodQuestion,
  parseMoodAnswer,
} from "@/lib/station/moods";

/**
 * Flash-Lite, not Flash.
 *
 * Measured on the same thirteen tracks: Flash 12/13 in 7–12s, Flash-Lite 11/13
 * in about 2s. One track of accuracy does not buy back ten seconds of a queue
 * that is already the slowest thing in the app.
 */
const MODEL = "gemini-flash-lite-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Tracks per request.
 *
 * Measured: ten tracks 1.6s, fifteen 1.6s, twenty 1.9s — and on a slow
 * afternoon two tracks 6.3s, twelve 7.2s. The cost is the request, not the list. Twenty is the size of a full queue being re-judged,
 * so that case is one call.
 */
const MAX_BATCH = 20;

export type MoodAsk = { id: string; name: string; artist: string };

export type MoodVerdicts = {
  /** by the id asked under; a track with no entry was not answered for and is unknown */
  verdicts: Map<string, MoodKey[]>;
  /** time spent waiting on Gemini; 0 when the cache answered everything */
  ms: number;
  /** why some tracks went unanswered, in words the panel can show */
  error: string | null;
};

/**
 * Every answer Gemini has given, for as long as the server runs.
 *
 * Keyed by whatever id the caller asked under: a Spotify id for a track already
 * in the queue, a Last.fm "name|artist" key for a candidate the ladder has not
 * looked up yet. The two never collide and are never compared.
 *
 * All the moods are asked for at once and kept, whichever tag was on at the
 * time, so switching 우울·슬픔 to 경쾌 asks nothing about a track already seen.
 * Only answers are stored: a failure is not a verdict, and caching one would
 * turn a minute without quota into a track that is never asked about again.
 */
const cache = new Map<string, MoodKey[]>();

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" },
      tags: { type: "ARRAY", items: { type: "STRING", enum: MOODS.map((m) => m.key) } },
    },
    required: ["id", "tags"],
  },
};

/** One request. Throws for anything that is not an answer. */
async function ask(tracks: MoodAsk[]): Promise<(MoodKey[] | null)[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const res = await geminiHttp(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: moodInstruction() }] },
      contents: [{ role: "user", parts: [{ text: moodQuestion(tracks) }] }],
      generationConfig: {
        // the same track should get the same answer tomorrow
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return parseMoodAnswer(JSON.parse(text), tracks.length);
}

function describe(e: unknown): string {
  if (e instanceof RateLimitedError) return "Gemini 요청 제한을 초과했습니다";
  if (e instanceof Error && e.message.includes("GEMINI_API_KEY")) {
    return "Gemini API 키가 설정되지 않았습니다";
  }
  return "Gemini가 응답하지 않습니다";
}

/**
 * Mood verdicts for a batch of tracks.
 *
 * Never throws: like the lyrics check, a failure leaves a track unknown rather
 * than taking the queue build down with it, and unknown is already a no in
 * matchesMood. The error comes back beside the verdicts so the panel can say
 * why a 경쾌 queue is empty instead of looking as if nothing was 경쾌.
 */
export async function judgeMoods(tracks: MoodAsk[]): Promise<MoodVerdicts> {
  const verdicts = new Map<string, MoodKey[]>();
  const unasked: MoodAsk[] = [];
  for (const t of tracks) {
    const known = cache.get(t.id);
    if (known) verdicts.set(t.id, known);
    else unasked.push(t);
  }

  let error: string | null = null;
  let ms = 0;
  for (let i = 0; i < unasked.length && !error; i += MAX_BATCH) {
    const batch = unasked.slice(i, i + MAX_BATCH);
    const startedAt = Date.now();
    try {
      const answers = await ask(batch);
      let answered = 0;
      batch.forEach((t, at) => {
        const moods = answers[at];
        if (!moods) return;
        answered += 1;
        cache.set(t.id, moods);
        verdicts.set(t.id, moods);
      });
      console.log(
        `[gemini/moods] ${answered}/${batch.length} answered @${Date.now() - startedAt}ms`,
      );
    } catch (e) {
      // the rest of the list would meet the same wall; stop spending requests on it
      error = describe(e);
      console.warn("[gemini/moods]", e instanceof Error ? e.message : e);
    }
    ms += Date.now() - startedAt;
  }
  return { verdicts, ms, error };
}
