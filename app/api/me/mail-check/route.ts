import { NextResponse } from "next/server";
import { NotConnectedError, SpotifyApiError } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { isOwner } from "@/lib/db/owner";
import { runChecks } from "@/lib/mail-check.mjs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The operator's mail check (lib/mail-check.mjs): does each connection the weekly
 * issue depends on work, from where the site runs. Nothing is sent.
 *
 * For anyone but the owner account both methods answer 404, as if the route were
 * not there: the page shows the panel only when GET says yes, and nobody else
 * learns that it exists. A visitor who is not signed in gets 401, which the page
 * also treats as "no panel".
 */
async function owner() {
  const user = await signedInUser();
  return isOwner(user.id) ? user : null;
}

function failure(e: unknown) {
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
  if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: e.status === 429 ? 429 : 502 });
  console.error("[mail-check]", e);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/** Is there a panel for this listener? */
export async function GET() {
  try {
    const user = await owner();
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return withTokens(NextResponse.json({ owner: true }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}

/** Runs the checks. */
export async function POST() {
  try {
    const user = await owner();
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const checks = await runChecks();
    return withTokens(NextResponse.json({ at: new Date().toISOString(), checks }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
