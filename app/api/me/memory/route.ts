import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { clearMemory, getMemory, reactions, setFlags } from "@/lib/db/memory";

const NO_STORE = { "Cache-Control": "no-store" };

export function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[memory]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/** What the chatbot remembers about the signed-in listener, and what they reacted to (for drawing the buttons). */
export async function GET() {
  try {
    const user = await signedInUser();
    const [state, reacted] = await Promise.all([getMemory(user.id), reactions(user.id)]);
    return withTokens(NextResponse.json({ ...state, reactions: reacted }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** `{ enabled?: boolean, noticeSeen?: boolean }`: the switch, and the first-time notice being dismissed. */
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; noticeSeen?: unknown } | null;
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : undefined;
  const noticeSeen = typeof body?.noticeSeen === "boolean" ? body.noticeSeen : undefined;
  if (enabled === undefined && noticeSeen === undefined) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const user = await signedInUser();
    await setFlags(user.id, { enabled, noticeSeen });
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** Forgets everything: the lines and the reactions. The on/off choice stays. */
export async function DELETE() {
  try {
    const user = await signedInUser();
    await clearMemory(user.id);
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
