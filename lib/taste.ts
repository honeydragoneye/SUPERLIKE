import { artistTopTracks, similarArtists } from "@/lib/lastfm/client";
import { firstArtist, heardKey, type Taste } from "@/lib/db/taste";

/** A song picked for the listener, and the artist they listen to that it was picked from. */
export type Recommendation = { title: string; artist: string; because: string };

/** How many songs a round offers. */
const PER_ROUND = 10;
/** Artists the listener plays most are the seeds; a taste of one artist has one seed. */
const SEEDS = 2;
/** Similar artists asked for each seed: enough that a few rounds do not repeat. */
const SIMILAR = 12;
/** Similar artists tried for each seed in one round. */
const TRIED = 6;

/**
 * Songs by artists Last.fm calls close to the ones the listener plays most.
 *
 * Nothing here is invented: every pick is a track Last.fm lists as an artist's
 * own top track, by an artist it lists as similar. A song the listener has
 * played or hearted in the window is skipped, as are artists they already play
 * a lot (those are not discoveries).
 *
 * `round` moves along each seed's list of similar artists, so pressing
 * "새로 받기" gives different songs rather than the same ten.
 */
export async function recommend(taste: Taste, round: number): Promise<Recommendation[]> {
  const own = new Set(taste.artists.map((a) => a.name.toLowerCase()));
  const seeds = taste.artists.slice(0, SEEDS).map((a) => a.name);

  const perSeed = await Promise.all(
    seeds.map(async (seed): Promise<Recommendation[]> => {
      const similar = (await similarArtists(seed, SIMILAR).catch(() => []))
        .map((a) => a.name)
        .filter((n) => !own.has(n.toLowerCase()));
      if (!similar.length) return [];

      // wrap around the list so a late round still has artists to try
      const start = (round * TRIED) % similar.length;
      const rotated = [...similar.slice(start), ...similar.slice(0, start)].slice(0, TRIED);

      const tops = await Promise.all(rotated.map((name) => artistTopTracks(name, 6).catch(() => [])));
      const picks: Recommendation[] = [];
      for (const list of tops) {
        const fresh = list.find((t) => !taste.heard.has(heardKey(t.name, t.artist)));
        if (fresh) picks.push({ title: fresh.name, artist: firstArtist(fresh.artist), because: seed });
      }
      return picks;
    }),
  );

  // take turns between the seeds so the first artist does not crowd the others out
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < PER_ROUND; i++) {
    let any = false;
    for (const picks of perSeed) {
      const pick = picks[i];
      if (!pick) continue;
      any = true;
      const key = heardKey(pick.title, pick.artist);
      if (seen.has(key) || out.length >= PER_ROUND) continue;
      seen.add(key);
      out.push(pick);
    }
    if (!any) break;
  }
  return out;
}
