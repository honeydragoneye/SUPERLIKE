import { query } from "./client";

/**
 * The weekly mails that have gone out, newest first: what the archive page
 * (/issues) lists. Only `sent` issues are public; a draft is somebody's
 * unfinished work and stays out of reach.
 *
 * The rows are written by scripts/issue.mjs, so the shape of `album` is its
 * (the iTunes lookup, plus `albumIntro` and `spotifyAlbumId`).
 */
export type IssueAlbum = {
  name: string;
  artist: string;
  artwork: string | null;
  releaseDate: string | null;
  trackCount: number | null;
  genre: string | null;
  spotifyAlbumId: string | null;
  intro: string | null;
};

export type Issue = {
  /** the Monday of the week, YYYY-MM-DD */
  week: string;
  /** 1 for the first mail ever sent */
  no: number;
  theme: string | null;
  sentAt: string | null;
  /** how many songs of the album the developer played that week, of how many the album has */
  heard: number;
  album: IssueAlbum | null;
};

type Row = {
  week: string;
  theme: string | null;
  sent_at: string | null;
  tracks: { title?: string }[] | null;
  album: (Omit<IssueAlbum, "intro"> & { albumIntro?: { text?: string } | null; tracks?: string[] }) | null;
};

export async function sentIssues(): Promise<Issue[]> {
  const rows = await query<Row>(
    `select week_start::text as week, theme, sent_at::text as sent_at, tracks, album
       from issues where status = 'sent' order by week_start desc`,
  );
  return rows.map((r, i) => {
    const a = r.album;
    const names = new Set((a?.tracks ?? []).map((t) => t.toLowerCase()));
    const heard = (r.tracks ?? []).filter((t) => t.title && names.has(t.title.toLowerCase())).length;
    return {
      week: r.week,
      no: rows.length - i,
      theme: r.theme,
      sentAt: r.sent_at,
      heard,
      album: a
        ? {
            name: a.name,
            artist: a.artist,
            artwork: a.artwork ?? null,
            releaseDate: a.releaseDate ?? null,
            trackCount: a.trackCount ?? null,
            genre: a.genre ?? null,
            spotifyAlbumId: a.spotifyAlbumId ?? null,
            intro: a.albumIntro?.text ?? null,
          }
        : null,
    };
  });
}
