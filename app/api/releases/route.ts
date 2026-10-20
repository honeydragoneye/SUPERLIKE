import { NextResponse, type NextRequest } from "next/server";
import { COUNTRIES, recentReleases, type Country } from "@/lib/releases";

/**
 * `?country=KR|JP|US`: albums that came out in the last month and are charting
 * there. Public — nothing in it is the visitor's.
 */
export async function GET(request: NextRequest) {
  const asked = request.nextUrl.searchParams.get("country")?.toUpperCase() ?? "KR";
  const country = COUNTRIES.find((c) => c === asked) as Country | undefined;
  if (!country) return NextResponse.json({ error: "bad_country" }, { status: 400 });

  try {
    const albums = await recentReleases(country);
    return NextResponse.json({ country, albums }, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (e) {
    console.error("[releases]", e);
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
