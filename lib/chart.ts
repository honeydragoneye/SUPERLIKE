import { query } from "@/lib/db/client";

/**
 * "이번주 인기곡": a week's ranking built from a daily chart.
 *
 * The source is Apple Music's public most-played feed for the South Korean
 * storefront, top 50 songs, refreshed daily. It has no date range and no play
 * counts, so one day's list is not "this week" by itself. Each day's list is
 * therefore stored (chart_daily) and the week's ranking is the last seven days
 * added up: a song scores 51 minus its place on every day it was on the chart,
 * so one that held a high place all week beats one that spiked yesterday.
 *
 * The screen does not name the country; this file is where the source is
 * written down, for whoever reads the numbers later. If Apple's feed is
 * unreachable, Last.fm's chart for the same country is used instead.
 *
 * Server only.
 */
const APPLE_FEED = "https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/50/songs.json";
const LASTFM_COUNTRY = "Korea, Republic of";
/** the storefront's own calendar, so "today" turns over when the listeners' day does */
const TODAY = "(now() at time zone 'Asia/Seoul')::date";

export type ChartEntry = {
  title: string;
  artist: string;
  artwork: string | null;
  url: string | null;
};

export type WeeklyChartTrack = ChartEntry & { rank: number };

async function fromApple(): Promise<ChartEntry[]> {
  const res = await fetch(APPLE_FEED, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`apple chart ${res.status}`);
  const body = (await res.json()) as {
    feed?: {
      results?: { name?: string; artistName?: string; artworkUrl100?: string; url?: string }[];
    };
  };
  return (body.feed?.results ?? [])
    .filter((r) => r.name && r.artistName)
    .map((r) => ({
      title: r.name as string,
      artist: r.artistName as string,
      // the feed gives a 100px cover; the same address serves larger sizes
      artwork: r.artworkUrl100 ? r.artworkUrl100.replace("100x100bb", "200x200bb") : null,
      url: r.url ?? null,
    }));
}

async function fromLastfm(): Promise<ChartEntry[]> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("LASTFM_API_KEY is not set");
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({
    method: "geo.gettoptracks",
    country: LASTFM_COUNTRY,
    limit: "50",
    api_key: key,
    format: "json",
  }).toString();
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`lastfm chart ${res.status}`);
  const body = (await res.json()) as {
    tracks?: { track?: { name?: string; url?: string; artist?: { name?: string } }[] };
  };
  return (body.tracks?.track ?? [])
    .filter((t) => t.name && t.artist?.name)
    .map((t) => ({ title: t.name as string, artist: t.artist!.name as string, artwork: null, url: t.url ?? null }));
}

async function fetchChart(): Promise<ChartEntry[]> {
  try {
    const apple = await fromApple();
    if (apple.length) return apple;
  } catch (e) {
    console.warn("[chart] apple feed failed, trying Last.fm:", e instanceof Error ? e.message : e);
  }
  return fromLastfm();
}

/** One fetch at a time: the first visitors of a day must not each store the chart. */
let inflight: Promise<void> | null = null;

/**
 * Stores today's chart if it is not there yet.
 *
 * Called when someone asks for the ranking, so no scheduler is needed: the
 * first request of each day brings the day's list in, the rest read it.
 */
export function ensureTodayChart(): Promise<void> {
  inflight ??= (async () => {
    const [have] = await query<{ n: number }>(`select count(*)::int as n from chart_daily where day = ${TODAY}`);
    if (have.n > 0) return;
    const entries = await fetchChart();
    if (!entries.length) return;
    await query(
      `insert into chart_daily (day, rank, title, artist, artwork, url)
       select ${TODAY}, r, t, a, w, u
         from unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[]) as x(r, t, a, w, u)
       on conflict do nothing`,
      [
        entries.map((_, i) => i + 1),
        entries.map((e) => e.title),
        entries.map((e) => e.artist),
        entries.map((e) => e.artwork),
        entries.map((e) => e.url),
      ],
    );
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The week's ranking: the last seven days of charts added up. */
export async function weeklyTop(limit = 10): Promise<WeeklyChartTrack[]> {
  const rows = await query<ChartEntry>(
    `select min(title) as title, min(artist) as artist, max(artwork) as artwork, max(url) as url
       from chart_daily
      where day > ${TODAY} - 7
      group by lower(title), lower(artist)
      order by sum(51 - rank) desc, min(rank) asc, min(title)
      limit $1`,
    [limit],
  );
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
