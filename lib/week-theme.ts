import seasons from "./issue-seasons.json";

/**
 * The subject this week's mail goes out under, and the colours it wears.
 *
 * The calendar is lib/issue-seasons.json, the same file scripts/issue.mjs
 * reads: the month (in the Asia/Seoul calendar) picks the entry, so December's
 * mail is "크리스마스" and green. A mail made with `--theme` on another subject
 * saves that subject's name; the archive chip falls back to the first colours.
 */
export function weekTheme(now: Date = new Date()): string {
  // en-CA writes a date as YYYY-MM-DD
  const month = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).slice(5, 7),
  );
  return (seasons.find((s) => s.month === month) ?? seasons[0]).name;
}

/** The mail's own colours per subject: a chip on the archive page wears the colour its issue was sent in. */
export const THEME_COLORS: Record<string, { bg: string; ink: string }> = Object.fromEntries(
  seasons.map((s) => [s.name, { bg: s.color, ink: "#ffffff" }]),
);

/** The colours of a subject that is not on the calendar. */
export const DEFAULT_THEME_COLORS = { bg: "#3d5afe", ink: "#ffffff" };
