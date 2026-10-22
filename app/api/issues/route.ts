import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { sentIssues } from "@/lib/db/issues";

/**
 * The archive of weekly mails, for anyone: every issue that has been sent,
 * newest first. An empty list is a real answer (nothing sent yet), not an error.
 */
export async function GET() {
  try {
    return NextResponse.json({ issues: await sentIssues() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    console.error("[issues]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
