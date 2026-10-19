import { NextResponse, type NextRequest } from "next/server";
import { NotConnectedError, SpotifyApiError, flushToken } from "@/lib/spotify/api";
import { fetchAlbumPage } from "@/lib/spotify/album";

/** The album screen's data; see lib/spotify/album for what is in it and why. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { page, resolved } = await fetchAlbumPage(id);
    return flushToken(NextResponse.json(page), resolved);
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    console.error("[album]", id, e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "album_failed",
        detail: e instanceof SpotifyApiError ? e.detail : undefined,
      },
      { status: e instanceof SpotifyApiError ? e.status : 502 },
    );
  }
}
