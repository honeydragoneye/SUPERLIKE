import { NextResponse } from "next/server";
import { MARKET, NotConnectedError, SpotifyApiError, spotifyGet } from "@/lib/spotify/api";
import { signedInUser, withTokens } from "@/lib/db/account";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { fillAlbum, recentAlbums } from "@/lib/db/albums";

/** Albums asked of Spotify at the same moment. */
const FILL_AT_ONCE = 4;

const NO_STORE = { "Cache-Control": "no-store" };

type SpotifyAlbum = { id: string; name: string; images: { url: string; width: number | null }[] };

/** The image that is still sharp at the 150px card, without taking the full-size one. */
function cover(images: { url: string; width: number | null }[]): string | null {
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 300) ?? sorted[sorted.length - 1])?.url ?? null;
}

/**
 * The albums the signed-in listener played lately, newest first.
 *
 * Plays record an album's name and cover from now on; the ones recorded before
 * have only its id. Those are asked of Spotify here, in one request, and written
 * back so each question is asked once. If Spotify cannot answer, the album still
 * comes back by id (the card links to it) and is filled in on a later visit.
 */
export async function GET() {
  try {
    const user = await signedInUser();
    const albums = await recentAlbums(user.id);

    let resolved = user.resolved;
    const missing = albums.filter((a) => !a.name || !a.artwork);
    // the same request the album page makes, which this app is allowed; a few at a time, as Spotify throttles
    for (let i = 0; i < missing.length; i += FILL_AT_ONCE) {
      const answers = await Promise.all(
        missing.slice(i, i + FILL_AT_ONCE).map((a) =>
          spotifyGet<SpotifyAlbum>(`/albums/${a.id}?market=${MARKET}`).catch((e) => {
            console.error("[albums] fill", a.id, e);
            return null;
          }),
        ),
      );
      for (const answer of answers) {
        if (!answer) continue;
        resolved = resolved ?? answer.resolved;
        const found = answer.data;
        const art = cover(found.images ?? []);
        await fillAlbum(user.id, found.id, found.name, art);
        const mine = albums.find((a) => a.id === found.id);
        if (mine) {
          mine.name ??= found.name;
          mine.artwork ??= art;
        }
      }
    }

    return withTokens(NextResponse.json({ albums }, { headers: NO_STORE }), resolved, []);
  } catch (e) {
    if (e instanceof NotConnectedError) return NextResponse.json({ error: "not_connected" }, { status: 401 });
    if (e instanceof DatabaseNotConfiguredError) return NextResponse.json({ error: "database_off" }, { status: 503 });
    if (e instanceof SpotifyApiError) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("[albums]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
