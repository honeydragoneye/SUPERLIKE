import { NextResponse } from "next/server";
import { ensureTodayChart, weeklyTop } from "@/lib/chart";
import { DatabaseNotConfiguredError } from "@/lib/db/client";

/**
 * 이번주 인기곡 TOP10, for anyone — it needs no sign-in. Asking for it is what
 * brings in the day's chart (see lib/chart), so a failed fetch only means the
 * ranking is as of the last day that worked.
 */
export async function GET() {
  try {
    await ensureTodayChart().catch((e) => console.error("[chart] could not store today's chart:", e));
    const tracks = await weeklyTop(10);
    if (!tracks.length) return NextResponse.json({ error: "empty" }, { status: 404 });
    return NextResponse.json({ tracks, source: "Apple Music" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    console.error("[chart]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
