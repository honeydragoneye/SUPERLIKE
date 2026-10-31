export type MailTheme = { bg: string; card: string; panel: string; sub: string; ink: string };

/** the row of an issue as it is stored (see scripts/issue.mjs) */
export type MailRow = {
  title: string;
  tracks: unknown;
  magazine: unknown;
  week_text: string;
};

export type MailView = { title: string; tracks: unknown; magazine: unknown; theme: MailTheme; monthLabel: string };

export const esc: (s: unknown) => string;
export const albumLabel: (a: { name: string; artist: string }) => string;
export const FACE_PX: number;
export const FACE_CID: string;
export const monthLabel: (week: string) => string;
export function faceSvg(theme: MailTheme): string;
/**
 * The mail as HTML and plain text. `who` and `unsubscribeUrl` may be null (the site shows the
 * mail to anyone, so it greets nobody and has no unsubscribe link); `web` makes links open in a new tab.
 */
export function render(
  issue: MailView,
  who: string | null,
  unsubscribeUrl: string | null,
  faceSrc: string,
  web?: boolean,
): { text: string; html: string };
export function hydrate(row: MailRow): MailView;
