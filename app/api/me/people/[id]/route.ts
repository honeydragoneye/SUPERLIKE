import { NextResponse, type NextRequest } from "next/server";
import { signedInUser, withTokens } from "@/lib/db/account";
import { isUserId, profileOf } from "@/lib/db/people";
import { failure } from "../route";

const NO_STORE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

/** One person's page. What they listen to is in it only when they share it and the listener follows them. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isUserId(id)) return notFound();
  try {
    const user = await signedInUser();
    const profile = await profileOf(user.id, id);
    if (!profile) return notFound();
    return withTokens(NextResponse.json(profile, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
