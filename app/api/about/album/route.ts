import { NextResponse, type NextRequest } from "next/server";
import { albumAbout } from "@/lib/about";

/** The introduction shown beside an album. Public, like the artist's. */
export async function GET(request: NextRequest) {
  const name = (request.nextUrl.searchParams.get("name") ?? "").trim();
  const artist = (request.nextUrl.searchParams.get("artist") ?? "").trim();
  if (!name || !artist || name.length > 200 || artist.length > 200) {
    return NextResponse.json({ error: "bad_name" }, { status: 400 });
  }
  try {
    return NextResponse.json(await albumAbout(name, artist), { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.warn("[about/album]", e);
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
