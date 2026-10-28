import { NextResponse, type NextRequest } from "next/server";
import { streamOf, UUID } from "@/lib/radio/client";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * A fresh stream address for one station: `{ url, hls }`.
 *
 * Asked for at the moment of playing and never stored, because some stations
 * hand out signed links that stop working after a while.
 */
export async function GET(request: NextRequest) {
  const uuid = request.nextUrl.searchParams.get("uuid") ?? "";
  if (!UUID.test(uuid)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const stream = await streamOf(uuid);
    if (!stream) return NextResponse.json({ error: "no_stream" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(stream, { headers: NO_STORE });
  } catch (e) {
    console.error("[radio/stream]", e);
    return NextResponse.json({ error: "failed" }, { status: 502, headers: NO_STORE });
  }
}
