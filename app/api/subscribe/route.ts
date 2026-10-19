import { NextResponse, type NextRequest } from "next/server";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { EMAIL, cleanNickname, settle, subscribe, validToken } from "@/lib/db/subscribers";
import { MailNotConfiguredError } from "@/lib/mail";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST { email, nickname }       — ask for a subscription, a confirmation mail follows
 * POST { token, action }          — the confirm / unsubscribe buttons on /subscribe
 *
 * The links in mails open a page that asks for a click rather than acting on
 * the request itself: mail scanners fetch every link, and a fetch must not be
 * able to confirm or cancel anyone.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; nickname?: unknown; token?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (body.token !== undefined) {
      if (!validToken(body.token) || (body.action !== "confirm" && body.action !== "unsubscribe")) {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
      }
      const ok = await settle(body.token, body.action === "confirm" ? "active" : "unsubscribed");
      return ok
        ? NextResponse.json({ ok: true }, { headers: NO_STORE })
        : NextResponse.json({ error: "unknown_token" }, { status: 404 });
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (email.length > 254 || !EMAIL.test(email)) {
      return NextResponse.json({ error: "bad_email" }, { status: 400 });
    }
    const nickname = cleanNickname(body.nickname);
    if (!nickname) return NextResponse.json({ error: "bad_nickname" }, { status: 400 });
    const result = await subscribe(email, nickname);
    return NextResponse.json({ result }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    if (e instanceof MailNotConfiguredError) return NextResponse.json({ error: "mail_off" }, { status: 503 });
    console.error("[subscribe]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
