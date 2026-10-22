/**
 * The theme this week's mail goes out under.
 *
 * The same rotation scripts/issue.mjs uses (`THEMES` / `themeFor`): the weeks
 * count from Monday in the Asia/Seoul calendar and step through the four
 * names in order. Kept in step by hand, so changing one list means changing
 * the other.
 */
const NAMES = ["A SIDE", "LINER NOTES", "SPOTLIGHT", "NIGHT SHIFT"];
const WEEK_MS = 7 * 86_400_000;

export function weekTheme(now: Date = new Date()): string {
  // en-CA writes a date as YYYY-MM-DD
  const day = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)}T00:00:00Z`,
  );
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return NAMES[Math.floor(day.getTime() / WEEK_MS) % NAMES.length];
}

/** The mail's own colours per theme: a chip on the archive page wears the colour its issue was sent in. */
export const THEME_COLORS: Record<string, { bg: string; ink: string }> = {
  "A SIDE": { bg: "#ffe000", ink: "#111111" },
  "LINER NOTES": { bg: "#f78fc0", ink: "#1a0a12" },
  SPOTLIGHT: { bg: "#b8f26b", ink: "#0f1a00" },
  "NIGHT SHIFT": { bg: "#1d1d2b", ink: "#ffffff" },
};
