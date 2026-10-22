import { albumInfo, artistInfo, cleanTitle } from "@/lib/lastfm/client";
import { squash } from "@/lib/names";

/** The short introduction shown beside an artist or an album, and where it came from. */
export type About = {
  text: string | null;
  source: "wikipedia" | "lastfm" | null;
  url: string | null;
  /** Last.fm's listener count (artists) or null when it has none */
  listeners: number | null;
  tags: string[];
};

const EMPTY: About = { text: null, source: null, url: null, listeners: null, tags: [] };

const UA = "Superlike/0.1 (https://github.com/honeydragoneye/SUPERLIKE)";
const HANGUL = /[가-힣]/;
const MAX_TEXT = 360;

/** A song lasts a few minutes, a Wikipedia article's introduction does not change in a day. */
const KEEP_MS = 12 * 60 * 60 * 1000;
const kept = new Map<string, { at: number; about: About }>();

const MUSICAL = /band|group|singer|rapper|musician|duo|vocalist|songwriter|producer|\bDJ\b|boy ?group|girl ?group|idol|가수|밴드|그룹|래퍼|음악|아이돌|싱어송라이터|프로듀서|듀오/i;
const RELEASE = /album|record|single|extended play|\bEP\b|mixtape|음반|앨범|싱글|미니|정규/i;

/** The first sentences that fit, cut at a sentence end rather than mid-word. */
function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_TEXT) return flat;
  const cut = flat.slice(0, MAX_TEXT);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다. "), cut.lastIndexOf("。"));
  return end > 120 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

type WikiPage = { title: string; extract?: string; index?: number };

/**
 * The first Wikipedia article for `query` that `accepts` — the title has to
 * be the name asked for, so a search for "Lucy" cannot hand back "Lucy Liu".
 * A Korean name is looked up on the Korean edition first.
 */
async function wikipedia(
  query: string,
  hangul: boolean,
  accepts: (title: string, extract: string) => boolean,
): Promise<{ text: string; url: string } | null> {
  for (const lang of hangul ? ["ko", "en"] : ["en", "ko"]) {
    try {
      const url =
        `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=4` +
        `&prop=extracts&exintro=1&explaintext=1&exlimit=4&gsrsearch=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 43_200 } });
      if (!res.ok) continue;
      const pages = Object.values(((await res.json()) as { query?: { pages?: Record<string, WikiPage> } }).query?.pages ?? {})
        .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
      for (const page of pages) {
        const extract = (page.extract ?? "").trim();
        const title = page.title.replace(/\s*\(.*?\)\s*$/, "");
        if (extract && accepts(title, extract)) {
          return { text: clip(extract), url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}` };
        }
      }
    } catch {
      // an edition that is down is the same as one without the article
    }
  }
  return null;
}

function remember(key: string, about: About): About {
  kept.set(key, { at: Date.now(), about });
  return about;
}

function recall(key: string): About | null {
  const hit = kept.get(key);
  return hit && Date.now() - hit.at < KEEP_MS ? hit.about : null;
}

/** Wikipedia first, Last.fm's own text when Wikipedia has no article by that name. */
export async function artistAbout(name: string): Promise<About> {
  const key = `artist:${squash(name)}`;
  const hit = recall(key);
  if (hit) return hit;

  const [wiki, lfm] = await Promise.all([
    wikipedia(name, HANGUL.test(name), (title, extract) => squash(title) === squash(name) && MUSICAL.test(extract.slice(0, 400))),
    artistInfo(name).catch(() => null),
  ]);
  const text = wiki?.text ?? (lfm?.summary ? clip(lfm.summary) : null);
  if (!text && !lfm) return remember(key, EMPTY);
  return remember(key, {
    text,
    source: wiki ? "wikipedia" : text ? "lastfm" : null,
    url: wiki?.url ?? null,
    listeners: lfm?.listeners ?? null,
    tags: lfm?.tags ?? [],
  });
}

export async function albumAbout(album: string, artist: string): Promise<About> {
  const key = `album:${squash(album)}|${squash(artist)}`;
  const hit = recall(key);
  if (hit) return hit;

  const title = cleanTitle(album) || album;
  const first = artist.split(",")[0].trim();
  const [wiki, lfm] = await Promise.all([
    wikipedia(
      `${title} ${first}`,
      HANGUL.test(title) || HANGUL.test(first),
      (found, extract) =>
        squash(found) === squash(title) && (squash(extract).includes(squash(first)) || RELEASE.test(extract.slice(0, 300))),
    ),
    albumInfo(album, artist).catch(() => null),
  ]);
  const text = wiki?.text ?? (lfm?.summary ? clip(lfm.summary) : null);
  if (!text && !lfm) return remember(key, EMPTY);
  return remember(key, {
    text,
    source: wiki ? "wikipedia" : text ? "lastfm" : null,
    url: wiki?.url ?? null,
    listeners: null,
    tags: lfm?.tags ?? [],
  });
}
