import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { cleanMessages, isChatId, listChats, saveChat } from "@/lib/db/chats";

const NO_STORE = { "Cache-Control": "no-store" };

export function failure(e: unknown): NextResponse {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[chats]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/**
 * The signed-in listener's saved chatbot conversations, newest first.
 *
 * Every query is scoped to `user.id`, which the server read from the Spotify
 * session: nothing the browser sends can name another account's rows.
 */
export async function GET() {
  try {
    const user = await signedInUser();
    const chats = await listChats(user.id);
    return withTokens(NextResponse.json({ chats }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** `{ id?, messages }`: saves the conversation, replacing the one `id` names. Answers with its id. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; messages?: unknown } | null;
  const messages = cleanMessages(body?.messages);
  if (!messages) return NextResponse.json({ error: "bad_messages" }, { status: 400 });

  try {
    const user = await signedInUser();
    const id = await saveChat(user.id, isChatId(body?.id) ? body.id : null, messages);
    return withTokens(NextResponse.json({ id }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
