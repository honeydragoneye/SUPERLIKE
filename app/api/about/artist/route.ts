import { NextResponse, type NextRequest } from "next/server";
import { artistAbout } from "@/lib/about";

/** The introduction shown beside an artist. Public: it uses Wikipedia and Last.fm, not the listener's Spotify. */
export async function GET(request: NextRequest) {
  const name = (request.nextUrl.searchParams.get("name") ?? "").trim();
  if (!name || name.length > 200) return NextResponse.json({ error: "bad_name" }, { status: 400 });
  try {
    return NextResponse.json(await artistAbout(name), { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.warn("[about/artist]", e);
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
