import { NextResponse, type NextRequest } from "next/server";
import { signedInUser, withTokens } from "@/lib/db/account";
import { getMemory, recordReaction, recordShown, undoReaction, type FeedbackTrack } from "@/lib/db/memory";
import { failure } from "../route";

const NO_STORE = { "Cache-Control": "no-store" };

const tracksOf = (raw: unknown): FeedbackTrack[] =>
  Array.isArray(raw)
    ? raw.slice(0, 30).flatMap((t): FeedbackTrack[] => {
        const row = t as { title?: unknown; artist?: unknown };
        return typeof row?.title === "string" && row.title ? [{ title: row.title, artist: typeof row.artist === "string" ? row.artist : "" }] : [];
      })
    : [];

/**
 * `{ action: "react", value: "up" | "down" | "known", tracks }` records what the listener thought of songs;
 * `{ action: "undo", tracks }` takes it back; `{ action: "shown", tracks }` notes that songs were recommended.
 * Nothing is kept while the memory is switched off.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { action?: unknown; value?: unknown; tracks?: unknown } | null;
  const tracks = tracksOf(body?.tracks);
  const action = body?.action;
  const value = body?.value;
  const valid =
    tracks.length > 0 &&
    ((action === "react" && (value === "up" || value === "down" || value === "known")) || action === "undo" || action === "shown");
  if (!valid) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const user = await signedInUser();
    if (!(await getMemory(user.id)).enabled) return withTokens(NextResponse.json({ ok: true, kept: false }, { headers: NO_STORE }), user.resolved, []);
    if (action === "react") await recordReaction(user.id, tracks, value as "up" | "down" | "known");
    else if (action === "undo") await undoReaction(user.id, tracks);
    else await recordShown(user.id, tracks);
    return withTokens(NextResponse.json({ ok: true, kept: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
