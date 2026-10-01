import { NextResponse, type NextRequest } from "next/server";
import { checkInstrumental, matchesFilter, type FilterKind } from "@/lib/lrclib/client";

type Ask = {
  id: string;
  name: string;
  artist: string;
  durationMs?: number;
};

/**
 * Lyrics verdict for a batch of tracks.
 *
 * LRCLIB is the ground truth for the lyrics filter. Calls are paced by the
 * shared throttle, so a batch resolves sequentially rather than as a burst —
 * the shape that earned 429s in the prototype.
 */
export async function POST(request: NextRequest) {
  const { tracks = [], filter = null } = (await request.json()) as {
    tracks?: Ask[];
    filter?: FilterKind;
  };

  if (!Array.isArray(tracks) || tracks.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results = [];
  for (const t of tracks) {
    const flag = await checkInstrumental(t.name, t.artist, t.durationMs, t.id);
    results.push({
      id: t.id,
      instrumental: flag,
      matches: matchesFilter(flag, filter),
    });
  }

  const unknown = results.filter((r) => r.instrumental === null).length;
  return NextResponse.json(
    { results, filter, checked: results.length, unknown },
    { headers: { "Cache-Control": "no-store" } },
  );
}
