import { artistTopTags } from "@/lib/lastfm/client";
import type { Taste } from "@/lib/db/taste";
import { stationsByTag, type Station } from "./client";

export type RadioPick = Station & {
  /** the listener's genres this station is tagged with: why it was picked */
  matched: string[];
};

export type RadioPicks = { tags: string[]; stations: RadioPick[] };

/** Artists whose genres make up the picture, heaviest first. */
const SEEDS = 4;
/** Genres kept as the listener's taste. */
const TAGS = 3;
/** Stations offered in one round. */
const PER_ROUND = 3;

/** Radio Browser spells some genres without the dash or space Last.fm uses. */
function variants(tag: string): string[] {
  const squashed = tag.replace(/[-\s]/g, "");
  return squashed !== tag ? [tag, squashed] : [tag];
}

/**
 * The listener's genres: the tags of the artists they play most, the heaviest
 * artist counting most. The tags are Last.fm's, already cleaned of places,
 * decades and personal shelving (lib/lastfm/tags).
 */
export async function tasteTags(taste: Taste): Promise<string[]> {
  const per = await Promise.all(
    taste.artists.slice(0, SEEDS).map((a) => artistTopTags(a.name, 4).catch(() => [])),
  );
  const weight = new Map<string, number>();
  per.forEach((tags, i) => {
    tags.forEach((tag, j) => {
      weight.set(tag, (weight.get(tag) ?? 0) + (SEEDS - i) * (4 - j));
    });
  });
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, TAGS).map(([tag]) => tag);
}

/** Languages the listener reads here: a station in one of them is worth more. */
const LANGUAGES = /korean|english/;
/** Stations looked at for each genre. */
const POOL = 40;

/**
 * Stations for those genres. Nothing is invented: a station is offered because
 * Radio Browser tags it with one of the genres, and `matched` says which.
 *
 * Tags there are typed in by whoever added the station, so a single tag is a
 * weak signal. A station carrying several of the listener's genres ranks above
 * one carrying a single genre, votes keep out stations nobody listens to, and
 * Korean and English stations are favoured over the rest of the world's.
 *
 * One pick comes from each genre in turn, so the round is not three stations
 * of the biggest genre. `round` moves along each genre's ranking, so
 * "다시 추천" shows others.
 */
export async function recommendStations(tags: string[], round: number): Promise<RadioPick[]> {
  const found = await Promise.all(
    tags.map(async (tag) => {
      const lists = await Promise.all(variants(tag).map((v) => stationsByTag(v, POOL).catch(() => [])));
      return { tag, stations: lists.flat() };
    }),
  );

  // every genre of the listener a station carries, whichever list it turned up in
  const matched = new Map<string, string[]>();
  for (const { tag, stations } of found) {
    for (const s of stations) {
      const list = matched.get(s.uuid) ?? [];
      if (!list.includes(tag)) list.push(tag);
      matched.set(s.uuid, list);
    }
  }

  const ranked = found.map(({ stations }) =>
    [...new Map(stations.map((s) => [s.uuid, s])).values()]
      .map((s) => {
        const hits = matched.get(s.uuid) ?? [];
        // votes are compressed so a giant station does not bury the rest
        const score = hits.length * Math.log10(s.votes + 10) * (LANGUAGES.test(s.language) ? 1.6 : 1);
        return { s, hits, score };
      })
      .sort((a, b) => b.score - a.score),
  );

  const out: RadioPick[] = [];
  const used = new Set<string>();
  for (let k = 0; out.length < PER_ROUND && k < PER_ROUND * tags.length; k++) {
    const list = ranked[k % ranked.length].filter((c) => !used.has(c.s.uuid));
    if (!list.length) continue;
    const { s, hits } = list[(round + Math.floor(k / ranked.length)) % list.length];
    used.add(s.uuid);
    out.push({
      uuid: s.uuid,
      name: s.name,
      country: s.country,
      countryCode: s.countryCode,
      tags: s.tags,
      favicon: s.favicon,
      votes: s.votes,
      language: s.language,
      homepage: s.homepage,
      matched: hits,
    });
  }
  return out;
}
