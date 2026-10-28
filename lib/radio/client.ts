/**
 * Radio Browser (radio-browser.info): the open directory of internet radio.
 *
 * Radio Garden has no public API and its private one sits behind a Cloudflare
 * challenge, so a server cannot call it. This directory is free, needs no key,
 * and lists stations by genre tag, which is what a taste-based pick needs.
 *
 * Server only. Mirrors are tried in turn: any one of them can be down.
 */

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
];
const HEADERS = { "User-Agent": "Superlike/0.1 (+https://github.com/honeydragoneye/SUPERLIKE)" };
const TIMEOUT_MS = 8_000;

export type Station = {
  uuid: string;
  name: string;
  country: string;
  countryCode: string;
  tags: string[];
  /** https only: an http logo is blocked on an https page */
  favicon: string | null;
  votes: number;
  /** what Radio Browser lists the station as broadcasting in, lower-cased; may be empty */
  language: string;
  /** the front page of the station's own website, http or https; null when it lists none */
  homepage: string | null;
};

type Raw = {
  stationuuid?: string;
  name?: string;
  country?: string;
  countrycode?: string;
  tags?: string;
  favicon?: string;
  votes?: number;
  language?: string;
  homepage?: string;
  url_resolved?: string;
  url?: string;
};

/** An address that is safe to put in a link: http or https only, so a listing cannot smuggle in a `javascript:` one. */
export function webAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The station's website, as its front page.
 *
 * The directory is filled in by listeners, and a deep address rots: listen.moe
 * is listed at /kpop, a page the site has since dropped, so the link opened a 404
 * on a site that was fine. The front page of the same site does not rot.
 */
export function siteRoot(value: unknown): string | null {
  const address = webAddress(value);
  return address ? new URL(address).origin + "/" : null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function get<T>(path: string): Promise<T> {
  let last: unknown;
  for (const base of MIRRORS) {
    try {
      const res = await fetch(base + path, {
        headers: HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`radio-browser ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("radio-browser unreachable");
}

function station(r: Raw): Station | null {
  if (!r.stationuuid || !UUID.test(r.stationuuid) || !r.name?.trim()) return null;
  return {
    uuid: r.stationuuid,
    name: r.name.trim().slice(0, 120),
    country: r.country ?? "",
    countryCode: (r.countrycode ?? "").toUpperCase(),
    tags: (r.tags ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8),
    favicon: r.favicon?.startsWith("https://") ? r.favicon.slice(0, 500) : null,
    votes: r.votes ?? 0,
    language: (r.language ?? "").toLowerCase(),
    homepage: siteRoot(r.homepage),
  };
}

/** Working stations carrying a genre tag exactly, most voted first. Stations with no https stream are left out: the page is https, so the browser would refuse them. */
export async function stationsByTag(tag: string, limit = 12): Promise<Station[]> {
  const q = new URLSearchParams({
    tag,
    tagExact: "true",
    hidebroken: "true",
    is_https: "true",
    order: "votes",
    reverse: "true",
    limit: String(limit),
  });
  const rows = await get<Raw[]>(`/json/stations/search?${q}`);
  return rows.map(station).filter((s): s is Station => s !== null);
}

/** A fresh stream address for one station. Also counts as a listen in the directory, which is how it ranks stations. */
export async function streamOf(uuid: string): Promise<{ url: string; hls: boolean } | null> {
  if (!UUID.test(uuid)) return null;
  const res = await get<{ ok?: boolean | string; url?: string }>(`/json/url/${uuid}`);
  const url = res.url;
  if (!url || !url.startsWith("https://")) return null;
  return { url, hls: /\.m3u8(\?|$)/i.test(url) };
}
