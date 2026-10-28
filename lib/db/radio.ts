import { siteRoot } from "@/lib/radio/client";
import { query } from "./client";

export type FavoriteStation = {
  uuid: string;
  name: string;
  country: string;
  countryCode: string;
  tags: string[];
  favicon: string | null;
  homepage: string | null;
  favoritedAt: number;
  lastPlayedAt: number | null;
};

type Row = {
  station_uuid: string;
  name: string;
  country: string | null;
  country_code: string | null;
  tags: string[];
  favicon: string | null;
  homepage: string | null;
  fav_ms: string;
  played_ms: string | null;
};

/** At most this many are kept per account. */
export const FAVORITE_LIMIT = 100;

/** The listener's stations, the one heard last first (a never-played one by when it was hearted). */
export async function listFavorites(userId: string): Promise<FavoriteStation[]> {
  const rows = await query<Row>(
    `select station_uuid, name, country, country_code, tags, favicon, homepage,
            (extract(epoch from favorited_at) * 1000)::bigint::text as fav_ms,
            (extract(epoch from last_played_at) * 1000)::bigint::text as played_ms
       from radio_favorites
      where user_id = $1
      order by coalesce(last_played_at, favorited_at) desc
      limit ${FAVORITE_LIMIT}`,
    [userId],
  );
  return rows.map((r) => ({
    uuid: r.station_uuid,
    name: r.name,
    country: r.country ?? "",
    countryCode: r.country_code ?? "",
    tags: r.tags,
    favicon: r.favicon,
    homepage: siteRoot(r.homepage),
    favoritedAt: Number(r.fav_ms),
    lastPlayedAt: r.played_ms ? Number(r.played_ms) : null,
  }));
}

export class FavoriteLimitError extends Error {
  constructor() {
    super("favorites");
    this.name = "FavoriteLimitError";
  }
}

export async function addFavorite(
  userId: string,
  s: { uuid: string; name: string; country: string; countryCode: string; tags: string[]; favicon: string | null; homepage: string | null },
): Promise<void> {
  const [{ n }] = await query<{ n: number }>(
    "select count(*)::int as n from radio_favorites where user_id = $1 and station_uuid <> $2",
    [userId, s.uuid],
  );
  if (n >= FAVORITE_LIMIT) throw new FavoriteLimitError();
  await query(
    `insert into radio_favorites (user_id, station_uuid, name, country, country_code, tags, favicon, homepage)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     on conflict (user_id, station_uuid) do nothing`,
    [userId, s.uuid, s.name, s.country || null, s.countryCode || null, JSON.stringify(s.tags), s.favicon, s.homepage],
  );
}

export async function removeFavorite(userId: string, uuid: string): Promise<void> {
  await query("delete from radio_favorites where user_id = $1 and station_uuid = $2", [userId, uuid]);
}

/** Notes that a hearted station was played; a station that is not hearted has no row to note it on. */
export async function notePlayed(userId: string, uuid: string): Promise<void> {
  await query(
    "update radio_favorites set last_played_at = now() where user_id = $1 and station_uuid = $2",
    [userId, uuid],
  );
}
