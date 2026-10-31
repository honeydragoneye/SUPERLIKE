import type { MailRow } from "../issue-mail.mjs";
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
  /** the mail's subject, e.g. "Superlike 10월호 · 핼러윈" */
  title: string;
  theme: string | null;
  /** the mail's own colours: its page, and its small print on it; null for an issue saved without them */
  colors: { bg: string; sub: string } | null;
  sentAt: string | null;
  /** how many songs of the album the developer played that week, of how many the album has */
  heard: number;
  album: IssueAlbum | null;
};

type Row = {
  week: string;
  title: string;
  season: { bg?: string; sub?: string } | null;
  theme: string | null;
  sent_at: string | null;
  tracks: { title?: string }[] | null;
  album: (Omit<IssueAlbum, "intro"> & { albumIntro?: { text?: string } | null; tracks?: string[] }) | null;
};

export async function sentIssues(): Promise<Issue[]> {
  const rows = await query<Row>(
    `select week_start::text as week, title, theme, magazine->'season' as season, to_char(sent_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as sent_at, tracks, album
       from issues where status = 'sent' order by week_start desc`,
  );
  return rows.map((r, i) => {
    const a = r.album;
    const names = new Set((a?.tracks ?? []).map((t) => t.toLowerCase()));
    const heard = (r.tracks ?? []).filter((t) => t.title && names.has(t.title.toLowerCase())).length;
    return {
      week: r.week,
      no: rows.length - i,
      title: r.title,
      theme: r.theme,
      colors: r.season?.bg && r.season.sub ? { bg: r.season.bg, sub: r.season.sub } : null,
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

/**
 * One sent issue as the mail drew it, for the page that shows it (GET /api/issues/[week]).
 * Only a sent issue is public: a draft, or a week with no magazine saved, is null.
 */
export async function sentIssueRow(week: string): Promise<MailRow | null> {
  const rows = await query<MailRow & { magazine: unknown }>(
    `select title, tracks, magazine, week_start::text as week_text
       from issues where week_start = $1::date and status = 'sent' and magazine is not null`,
    [week],
  );
  return rows[0] ?? null;
}
