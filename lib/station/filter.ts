/**
 * The lyrics filter's one rule, in a module with no dependencies.
 *
 * Both sides need it: the server decides what enters the queue, the browser
 * decides what stays in it when the filter changes. Keeping a second copy on
 * the client let the two drift, so this lives apart from the LRCLIB client and
 * its HTTP machinery, which the browser has no business bundling.
 */
export type FilterKind = "instrumental" | "lyrics" | null;

/** true = instrumental · false = has lyrics · null = unknown */
export type LyricsFlag = true | false | null;

/** Unknown never satisfies a filter — absence of data is not evidence. */
export function matchesFilter(flag: LyricsFlag, filter: FilterKind): boolean {
  if (filter === null) return true;
  if (filter === "instrumental") return flag === true;
  if (filter === "lyrics") return flag === false;
  return true;
}
