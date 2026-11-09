import { NextResponse, type NextRequest } from "next/server";
import { signedInUser, withTokens } from "@/lib/db/account";
import { removeItems } from "@/lib/db/memory";
import { failure } from "../../route";

const NO_STORE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

/** Takes one remembered line away. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!/^[0-9a-f-]{4,40}$/i.test(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const user = await signedInUser();
    await removeItems(user.id, [id]);
    return withTokens(NextResponse.json({ ok: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
