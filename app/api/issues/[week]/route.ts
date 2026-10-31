import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { sentIssueRow } from "@/lib/db/issues";
import { faceSvg, hydrate, render } from "@/lib/issue-mail.mjs";

/**
 * A sent issue as the mail drew it: the same HTML the subscribers got, minus the
 * greeting and the unsubscribe link (anyone may read it). The archive page shows it
 * in a frame, so it is a whole document and links open in a new tab.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const row = await sentIssueRow(week);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const view = hydrate(row);
    const face = `data:image/svg+xml;base64,${Buffer.from(faceSvg(view.theme)).toString("base64")}`;
    const { html } = render(view, null, null, face, true);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        // the page is the mail: pictures and its own styles, nothing that runs
        "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
      },
    });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    console.error("[issue]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
