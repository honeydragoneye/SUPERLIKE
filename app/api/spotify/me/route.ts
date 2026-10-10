import { NextResponse } from "next/server";
import {
  NotConnectedError,
  SpotifyApiError,
  flushToken,
  spotifyGet,
} from "@/lib/spotify/api";
import type { Profile } from "@/lib/data";

type SpotifyMe = {
  id: string;
  display_name: string | null;
  product?: string;
  images: { url: string; width: number | null }[] | null;
};

/** Prefer something a little larger than the 76px slot, for retina. */
function avatar(images: SpotifyMe["images"]): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 150) ?? sorted[sorted.length - 1]).url;
}

/**
 * The connected account, for the head of 마이페이지.
 *
 * The address Spotify also returns is left behind on purpose: the screen does
 * not show it, and a field nobody reads has no business crossing to the
 * browser.
 */
export async function GET() {
  try {
    const { data, resolved } = await spotifyGet<SpotifyMe>("/me");
    const profile: Profile = {
      id: data.id,
      // an account without a display name still has to be called something
      name: data.display_name || data.id,
      avatar: avatar(data.images),
      product: data.product ?? null,
    };
    return flushToken(
      NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } }),
      resolved,
    );
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    if (e instanceof SpotifyApiError && e.isScopeProblem) {
      return NextResponse.json(
        { error: "insufficient_scope", detail: e.detail },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch_failed" },
      { status: 502 },
    );
  }
}
