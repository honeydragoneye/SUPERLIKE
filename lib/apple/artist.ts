import { squash } from "@/lib/names";
import { NOT_NEW } from "@/lib/releases";

/**
 * An artist's releases from Apple's public lookup (no key). Spotify is used for
 * the artist the listener follows and to open an album; asking Apple for the
 * list keeps this off Spotify's request limit.
 *
 * Server only.
 */
const TIMEOUT_MS = 10_000;

export type AppleRelease = {
  id: string;
  title: string;
  kind: "album" | "ep" | "single";
  /** YYYY-MM-DD, Apple's date */
  released: string;
  artwork: string | null;
};

type SearchRow = { artistId?: number; artistName?: string };
type LookupRow = {
  wrapperType?: string;
  collectionId?: number;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  collectionType?: string;
};

async function get<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`apple_${res.status}`);
  return ((await res.json()) as { results: T[] }).results;
}

/**
 * The artist's id in Apple's catalogue.
 *
 * One exact name (case, spacing and punctuation aside) is taken as it is. When
 * the name matches none, or several artists share it (a LILY who is not the
 * LILY), or Apple spells it another way (소녀시대 is Girls' Generation there),
 * the candidates are told apart by their records: the one with a title in
 * common with `knownTitles`, the artist's albums as the other catalogue has
 * them. A different artist's releases under someone's name are worse than no
 * news, so no overlap means no match.
 */
export async function findAppleArtist(
  name: string,
  knownTitles: () => Promise<string[]> = async () => [],
): Promise<string | null> {
  const want = squash(name);
  if (!want) return null;
  const rows = await get<SearchRow>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=6&country=KR`,
  );
  const found = rows.filter((r): r is { artistId: number; artistName: string } => Boolean(r.artistId && r.artistName));
  const exact = found.filter((r) => squash(r.artistName) === want);
  if (exact.length === 1) return String(exact[0].artistId);

  const titles = (await knownTitles()).map(squash).filter((t) => t.length >= 3);
  if (titles.length === 0) return null;
  for (const c of exact.length > 1 ? exact : found.slice(0, 3)) {
    const theirs = (await lookupAll(String(c.artistId)).catch(() => [])).map((r) => squash(r.title)).filter((t) => t.length >= 3);
    if (theirs.some((t) => titles.some((s) => s.includes(t) || t.includes(s)))) return String(c.artistId);
  }
  return null;
}

/** "X - EP" and "X - Single" are "X" to everyone else. */
function split(name: string): { title: string; kind: AppleRelease["kind"] } {
  const m = /\s-\s(EP|Single)$/i.exec(name);
  if (!m) return { title: name, kind: "album" };
  return { title: name.slice(0, m.index).trim(), kind: m[1].toLowerCase() === "ep" ? "ep" : "single" };
}

/** Every record Apple lists for the artist (its own order is not by date). Live recordings and remasters are left out. */
async function lookupAll(appleId: string): Promise<AppleRelease[]> {
  const rows = await get<LookupRow>(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&entity=album&limit=200&country=KR`,
  );
  const out: AppleRelease[] = [];
  for (const r of rows) {
    if (r.wrapperType !== "collection" || !r.collectionId || !r.collectionName || !r.releaseDate) continue;
    if (NOT_NEW.test(r.collectionName)) continue;
    const { title, kind } = split(r.collectionName);
    out.push({
      id: String(r.collectionId),
      title,
      kind,
      released: r.releaseDate.slice(0, 10),
      artwork: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/300x300bb.$1") : null,
    });
  }
  return out;
}

/** The artist's releases from the last year, which is all 소식 reaches back to. */
export async function lookupReleases(appleId: string): Promise<AppleRelease[]> {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  return (await lookupAll(appleId)).filter((r) => r.released >= since);
}
