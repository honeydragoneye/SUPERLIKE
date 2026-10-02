import { NextResponse, type NextRequest } from "next/server";
import { fetchLyrics } from "@/lib/lrclib/client";

/**
 * Lyrics for the track playing now.
 *
 * LRCLIB answers by name, so the Spotify id only serves as the cache key — the
 * same key the station's lyrics filter uses, which means a track already judged
 * for the filter returns here without another request.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  const artist = (url.searchParams.get("artist") ?? "").trim();
  const id = url.searchParams.get("id") ?? undefined;
  const durationMs = Number(url.searchParams.get("durationMs")) || undefined;

  if (!name || !artist) {
    return NextResponse.json({ error: "missing_track" }, { status: 400 });
  }

  const lyrics = await fetchLyrics(name, artist, durationMs, id, { timings: true });
  return NextResponse.json(lyrics, { headers: { "Cache-Control": "no-store" } });
}
