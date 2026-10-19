import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { ownerId } from "@/lib/db/owner";
import { weeklyArtist } from "@/lib/db/weekly";

/**
 * Artist of the Week, for anyone: the artist the developer played most this
 * week, from the copy saved while they were signed in (lib/db/weekly). When
 * nothing is saved for this week yet the latest earlier one is returned with
 * `previous: true`, and the screen says it is last week's. 404: never picked.
 */
export async function GET() {
  const owner = ownerId();
  if (!owner) return NextResponse.json({ error: "owner_not_set" }, { status: 404 });
  try {
    const pick = await weeklyArtist(owner);
    if (!pick) return NextResponse.json({ error: "not_ready" }, { status: 404 });
    return NextResponse.json(pick, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    console.error("[weekly-artist]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
