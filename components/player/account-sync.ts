import type { LikedTrack } from "@/lib/likes";

/**
 * Sending the browser's hearts and plays to the account's database.
 *
 * Best effort and one way: the local store is what answers the screen, so a
 * failed request (not signed in, database off, offline) is dropped quietly and
 * the heart still holds in this browser. The database is only ever read back by
 * use-account-sync, once per page load.
 */
const JSON_POST = { "Content-Type": "application/json" };

export async function mirrorLike(track: Omit<LikedTrack, "at"> & { at?: number }, liked: boolean): Promise<void> {
  try {
    await fetch("/api/me/likes", {
      method: "POST",
      headers: JSON_POST,
      body: JSON.stringify({ liked, track }),
    });
  } catch {
    // offline or the server is down: the local heart already holds
  }
}

/** The listener's own calendar day, the same boundary lib/plays counts a day by. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function mirrorPlay(play: {
  trackId: string;
  title: string;
  artist: string;
  artistId: string | null;
  albumId: string | null;
  albumName: string | null;
  albumArtwork: string | null;
}): Promise<void> {
  try {
    await fetch("/api/me/plays", {
      method: "POST",
      headers: JSON_POST,
      body: JSON.stringify({ ...play, day: localDay() }),
    });
  } catch {
    // a play missed here is still counted in the browser's own tally
  }
}
