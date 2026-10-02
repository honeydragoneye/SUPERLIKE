/**
 * How long Superlike has actually played music.
 *
 * Spotify has no endpoint for this: `/me/player/recently-played` gives the
 * last fifty tracks with no durations attended to, and the listening figures
 * behind Spotify Wrapped are not exposed at all. So the number in the action
 * bar can only be something this app measures for itself, from the moment it
 * is first run.
 *
 * Kept in the browser rather than on the server. There is no database here,
 * and a route handler writing a file works in dev and then silently stops
 * working on a read-only deployment — a worse failure than being per-browser.
 * Per-browser is also closer to what the figure means: time *you* listened.
 */

const KEY = "superlike:listening:v1";

/** Local calendar day → milliseconds played that day. */
type Log = Record<string, number>;

/** Ten weeks of daily buckets is a few hundred bytes; older days are dropped. */
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

function sumSince(log: Log, from: Date, now: Date): number {
  let total = 0;
  for (const d = new Date(from); d <= now; d.setDate(d.getDate() + 1)) {
    total += log[dayKey(d)] ?? 0;
  }
  return total;
}

/**
 * Module state as the store's cache.
 *
 * `useSyncExternalStore` requires a snapshot that only changes when the data
 * does — recomputing the weekly sum on every render would hand React a new
 * answer each time it asked and spin. So the sum is computed when something is
 * recorded, and read from here in between.
 */
let log: Log | null = null;
let week = 0;
const listeners = new Set<() => void>();

function read(): Log {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    const floor = dayKey(cutoff);
    const out: Log = {};
    for (const [day, ms] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ms === "number" && Number.isFinite(ms) && ms > 0 && day >= floor) {
        out[day] = ms;
      }
    }
    return out;
  } catch {
    // private browsing, a full quota, or something else's key in our slot
    return {};
  }
}

function ensure(): Log {
  if (log === null) {
    log = read();
    week = sumSince(log, weekStart(new Date()), new Date());
  }
  return log;
}

function emit(): void {
  for (const fn of listeners) fn();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  /** another tab listening on the same browser is the same listener */
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

/** Milliseconds played since Monday. */
export function weekSnapshot(): number {
  ensure();
  return week;
}

/** Nothing measured yet, as far as a server that has never run this is aware. */
export function serverSnapshot(): number {
  return 0;
}

/** Adds listened time to today and tells anyone displaying the total. */
export function record(ms: number): void {
  if (!(ms > 0)) return;
  const current = ensure();
  const now = new Date();
  const today = dayKey(now);
  current[today] = (current[today] ?? 0) + ms;
  week = sumSince(current, weekStart(now), now);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // the figure still counts for this session even if it cannot be kept
  }
  emit();
}

/** "3h 24min · 24min · 0min" — short enough for the action bar's slot. */
export function formatSpan(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
  }
  // under a minute reads as 0min rather than announcing itself
  return `${mins}min`;
}
