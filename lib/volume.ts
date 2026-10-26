/**
 * How loud the player is, and whether it is muted.
 *
 * Kept in the browser, like the hearts: a level is a habit of this listener on
 * this machine, and the SDK forgets it with every page load. Read through
 * `useSyncExternalStore`, so the first render matches the server's and the saved
 * level arrives right after, without an effect that sets state.
 */
const KEY = "superlike:volume:v1";

export type Volume = {
  /** 0 to 1: what the listener set; it stays while muted, so unmuting returns to it */
  v: number;
  muted: boolean;
};

const DEFAULT: Volume = { v: 0.5, muted: false };

let current: Volume | null = null;
const listeners = new Set<() => void>();

function read(): Volume {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { v?: unknown; muted?: unknown } | null;
    if (saved && typeof saved.v === "number" && saved.v >= 0 && saved.v <= 1) return { v: saved.v, muted: saved.muted === true };
  } catch {
    // storage blocked or the entry is broken: half volume
  }
  return DEFAULT;
}

export function volumeSnapshot(): Volume {
  return (current ??= read());
}

export const volumeServerSnapshot = (): Volume => DEFAULT;

export function subscribeVolume(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function writeVolume(next: Volume): void {
  current = { v: Math.min(1, Math.max(0, Number.isFinite(next.v) ? next.v : DEFAULT.v)), muted: next.muted };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // not kept; it still applies for now
  }
  for (const l of listeners) l();
}
