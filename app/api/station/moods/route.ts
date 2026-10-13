import { NextResponse, type NextRequest } from "next/server";
import { judgeMoods, type MoodAsk } from "@/lib/gemini/moods";

/**
 * Mood verdicts for tracks already in the queue.
 *
 * The ladder judges what it adds; this is for what was queued before a mood
 * tag was switched on. One Gemini request covers the whole list, and tracks
 * the server has answered for before cost nothing.
 *
 * A track Gemini gave no answer for is left out of `results` rather than sent
 * as an empty list, so the browser can tell "none of the moods" from "ask
 * again later" and does not remember the second as if it were the first.
 */
export async function POST(request: NextRequest) {
  const { tracks = [] } = (await request.json()) as { tracks?: MoodAsk[] };

  if (!Array.isArray(tracks) || tracks.length === 0) {
    return NextResponse.json({ results: [], ms: 0, error: null });
  }

  const { verdicts, ms, error } = await judgeMoods(
    tracks.map((t) => ({ id: t.id, name: t.name, artist: t.artist })),
  );
  return NextResponse.json(
    { results: [...verdicts].map(([id, moods]) => ({ id, moods })), ms, error },
    { headers: { "Cache-Control": "no-store" } },
  );
}
