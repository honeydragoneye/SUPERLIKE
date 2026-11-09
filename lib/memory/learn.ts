import { geminiHttp } from "@/lib/http/throttle";
import { isKind, type MemoryItem, type MemoryKind, type Reaction } from "@/lib/db/memory";

/**
 * Reads a few turns of the conversation and decides what is worth remembering about the listener.
 *
 * One small call per exchange that looks like it says something about taste or manner, never one per message.
 * It sees the profile as it stands (with ids, so it can take back a line the listener has since contradicted),
 * what they said, and what they did with recommended songs. It answers only with lines to add and ids to remove.
 */
const MODEL = "gemini-flash-lite-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type Turn = { role: "user" | "assistant"; text: string };
export type Patch = { add: { kind: MemoryKind; text: string }[]; remove: string[] };

const INSTRUCTION = `You keep a short profile of a music listener for a chatbot, from their conversation.
Write each line in Korean, short (under 30 characters; 'said' lines may be up to 60).
Line kinds:
- love: a kind of music, artist, mood or situation they clearly like (e.g. "잔잔한 어쿠스틱")
- avoid: what they clearly dislike or want less of
- style: how they like to be talked to, judged from HOW THEY WRITE: formal or casual speech, short or long answers, emoji or none (e.g. "반말로 편하게", "답은 짧게")
- said: a lasting fact about their listening life that they stated (e.g. "운전할 때는 신나는 곡이 좋아")
Rules:
- Add a line only when it is a durable preference or manner, not a one-off request ("다음 곡", "30초 앞으로", "이 곡 틀어줘").
- Never record sensitive personal information: health, location, money, relationships, religion, politics, anything identifying.
- A song the listener marked as liked/disliked is a hint about taste; do not just repeat the song title.
- Use the profile's ids in "remove" only for a line the listener now directly contradicts ("이제 잔잔한 건 싫어"). Widening their taste ("잔잔한 것만 듣는 건 아니야", "시끄러운 것도 좋아졌어") does not contradict a line: keep it and add the new one.
- If nothing is worth keeping, answer {"add": [], "remove": []}. Most exchanges add nothing; at most three lines per answer.`;

const SCHEMA = {
  type: "object",
  properties: {
    add: {
      type: "array",
      items: {
        type: "object",
        properties: { kind: { type: "string", enum: ["love", "avoid", "style", "said"] }, text: { type: "string" } },
        required: ["kind", "text"],
      },
    },
    remove: { type: "array", items: { type: "string" } },
  },
  required: ["add", "remove"],
};

const VALUE_WORD: Record<Reaction, string> = { up: "liked", down: "disliked", known: "already knows" };

export async function learn(
  turns: Turn[],
  profile: MemoryItem[],
  reacted: { title: string; artist: string; value: Reaction }[],
): Promise<Patch> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const convo = turns
    .slice(-6)
    .map((t) => `${t.role === "user" ? "Listener" : "Chatbot"}: ${t.text.replace(/\s+/g, " ").trim().slice(0, 400)}`)
    .join("\n");
  const have = profile.length ? profile.map((i) => `[${i.id}] ${i.kind}: ${i.text}`).join("\n") : "(empty)";
  const songs = reacted.length ? reacted.map((r) => `${VALUE_WORD[r.value]}: ${r.title} — ${r.artist}`).join("\n") : "(none)";
  const res = await geminiHttp(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: `Profile now:\n${have}\n\nSongs the listener reacted to:\n${songs}\n\nConversation:\n${convo}` }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = JSON.parse((body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")) as Partial<Patch>;
  const known = new Set(profile.map((i) => i.id));
  return {
    add: (Array.isArray(raw.add) ? raw.add : [])
      .flatMap((a) => (isKind(a?.kind) && typeof a?.text === "string" && a.text.trim() ? [{ kind: a.kind, text: a.text }] : []))
      .slice(0, 3),
    remove: (Array.isArray(raw.remove) ? raw.remove : []).filter((id): id is string => typeof id === "string" && known.has(id)),
  };
}
