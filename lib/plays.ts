/**
 * How many times each track has actually been played here.
 *
 * Spotify has no endpoint for this. `/me/player/recently-played` is a log of
 * the last fifty plays, not a tally, and it says nothing about how much of each
 * one was heard — skipping after two seconds appears there exactly like
 * listening to the end. So the count is something this app measures, from the
 * same wall clock the listening time uses.
 *
 * Kept in the browser, beside lib/listening for the same reasons: there is no
 * database here, and a route handler writing a file works in dev and then
 * silently stops on a read-only deployment.
 */

/**
 * How long a track has to be heard before it counts as played.
 *
 * Twenty seconds is past the intro of most songs and well past the moment a
 * listener decides to skip, so it separates "played" from "passed over" without
 * demanding the whole runtime — a four-minute song would otherwise never count
 * from a listener who leaves before the outro.
 */
export const PLAY_THRESHOLD_MS = 20_000;

const KEY = "superlike:plays:v1";

/** Local calendar day → track id → times played that day. */
type Log = Record<string, Record<string, number>>;

/** Ten weeks of daily buckets; older days are dropped on read. */
const KEEP_DAYS = 70;

/** Local, not ISO: a day should end when it ends where the listener is. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Monday 00:00 local — the week Korean calendars start on. */
function weekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay() is Sunday-first, so Sunday counts back six days rather than none
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * Module state as the store's cache.
 *
 * `useSyncExternalStore` needs a snapshot that only changes when the data does,
 * so the totals are folded when something is recorded and read from here in
 * between. Rebuilding them per render would hand React a new answer each time
 * it asked and spin.
 */
let log: Log | null = null;
let today: Record<string, number> = {};
let week: Record<string, number> = {};
const listeners = new Set<() => void>();

const NONE: Record<string, number> = {};

function read(): Log {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    const floor = dayKey(cutoff);
    const out: Log = {};
    for (const [day, counts] of Object.entries(parsed as Record<string, unknown>)) {
      if (day < floor || !counts || typeof counts !== "object") continue;
      const kept: Record<string, number> = {};
      for (const [id, n] of Object.entries(counts as Record<string, unknown>)) {
        if (typeof n === "number" && Number.isFinite(n) && n > 0) kept[id] = n;
      }
      if (Object.keys(kept).length) out[day] = kept;
    }
    return out;
  } catch {
    // private browsing, a full quota, or something else's key in our slot
    return {};
  }
}

/** Sums the per-day buckets from `from` to now, inclusive. */
function foldSince(current: Log, from: Date, now: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d = new Date(from); d <= now; d.setDate(d.getDate() + 1)) {
    for (const [id, n] of Object.entries(current[dayKey(d)] ?? {})) {
      out[id] = (out[id] ?? 0) + n;
    }
  }
  return out;
}

function fold(current: Log): void {
  const now = new Date();
  /**
   * Copied, not pointed at.
   *
   * `countPlay` mutates the day's bucket in place, so handing the bucket
   * itself out as the snapshot meant the object React compares never changed
   * identity — the count was stored and the screen never heard about it.
   */
  const day = current[dayKey(now)];
  today = day ? { ...day } : NONE;
  week = foldSince(current, weekStart(now), now);
}

function ensure(): Log {
  if (log === null) {
    log = read();
    fold(log);
  }
  return log;
}

function emit(): void {
  for (const fn of listeners) fn();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  /** another tab on the same browser is the same listener */
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    log = null;
    ensure();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Plays per track id, today. */
export function todaySnapshot(): Record<string, number> {
  ensure();
  return today;
}

/** Plays per track id, since Monday. */
export function weekSnapshot(): Record<string, number> {
  ensure();
  return week;
}

/** Nothing counted, as far as a server that cannot see this browser is aware. */
export function serverSnapshot(): Record<string, number> {
  return NONE;
}

/** One more play of this track, today. */
export function countPlay(trackId: string): void {
  if (!trackId) return;
  const current = ensure();
  const day = dayKey(new Date());
  const counts = (current[day] ??= {});
  counts[trackId] = (counts[trackId] ?? 0) + 1;
  fold(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // the count still holds for this session even if it cannot be kept
  }
  emit();
}

/** Total plays across every day kept. */
export function totalPlays(trackId: string): number {
  const current = ensure();
  let total = 0;
  for (const counts of Object.values(current)) total += counts[trackId] ?? 0;
  return total;
}
