/**
 * A name as it can be compared across catalogues: letters and digits only,
 * lower case, accents dropped.
 *
 * Last.fm spells JAY-Z one way and Spotify another (JAŸ-Z), and a comparison
 * that notices the difference makes a perfectly good match look like a missing
 * artist. Accents go by decomposing each letter and dropping the marks, so Ÿ
 * becomes Y; the punctuation and spacing between words are ignored too.
 */
export function squash(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Edits it takes to turn one string into the other: insert, delete, change a
 * letter, or swap two neighbours (Swfit for Swift is one slip, not two).
 */
function distance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        rows[i][j] = j;
        continue;
      }
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? rows[i - 2][j - 2] + 1 : Infinity,
      );
    }
  }
  return rows[a.length][b.length];
}

/**
 * How far apart two names are once squashed, or null when they are too far to
 * be the same name with a slip in it.
 *
 * One wrong letter is allowed from five letters up, two from fourteen. Short
 * names get no slack at all: Nas and Nao are different people, and a link to
 * the wrong artist is worse than a card that says it found nothing.
 */
export function nameGap(a: string, b: string): number | null {
  const x = squash(a);
  const y = squash(b);
  if (x === y) return 0;
  const longest = Math.max(x.length, y.length);
  if (longest < 5) return null;
  const gap = distance(x, y);
  return gap <= (longest < 14 ? 1 : 2) ? gap : null;
}

/** What a name that merely contains the other (The Black Skirts for Black Skirt) ranks as: after every near spelling. */
export const CONTAINED = 3;

/**
 * How well `found` (a name in a catalogue) answers to any of `wanted`: 0 for the
 * same name, a slip or two for a near one, CONTAINED when one name holds the
 * other whole ("The Black Skirts" holds "blackskirts"), null when they are not
 * the same name at all.
 *
 * Containment needs six letters on the shorter side, so "Jay" is not in every
 * Jay there is.
 */
export function nameMatch(wanted: string[], found: string): number | null {
  const f = squash(found);
  let best: number | null = null;
  for (const w of wanted) {
    let gap = nameGap(w, found);
    if (gap === null) {
      const s = squash(w);
      if (Math.min(s.length, f.length) >= 6 && (f.includes(s) || s.includes(f))) gap = CONTAINED;
    }
    if (gap !== null && (best === null || gap < best)) best = gap;
  }
  return best;
}
