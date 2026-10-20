import { NextResponse, type NextRequest } from "next/server";
import { signedInUser, withTokens } from "@/lib/db/account";
import { deleteChat, getChat, isChatId } from "@/lib/db/chats";
import { failure } from "../route";

const NO_STORE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

/** One saved conversation, if it is the signed-in listener's. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isChatId(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const user = await signedInUser();
    const messages = await getChat(user.id, id);
    if (!messages) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return withTokens(NextResponse.json({ messages }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isChatId(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const user = await signedInUser();
    await deleteChat(user.id, id);
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
