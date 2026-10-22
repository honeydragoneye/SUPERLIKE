/**
 * What the listener searched for last, kept in this browser only.
 *
 * Nothing about it leaves the device: it is a convenience for the column beside
 * the results, not a history anyone else can read. Newest first, each text once.
 */
const KEY = "superlike:recent-searches:v1";
const KEEP = 8;

const EMPTY: string[] = [];
let list: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string").slice(0, KEEP) : [];
  } catch {
    return [];
  }
}

function write(next: string[]): void {
  list = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the list lives for this tab only
  }
  listeners.forEach((l) => l());
}

export function snapshot(): string[] {
  return (list ??= read());
}

/** What the server and the hydration pass see: nothing, so both render the same. */
export function serverSnapshot(): string[] {
  return EMPTY;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addRecent(text: string): void {
  const q = text.trim();
  if (!q) return;
  write([q, ...snapshot().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, KEEP));
}

export function removeRecent(text: string): void {
  write(snapshot().filter((s) => s !== text));
}

export function clearRecent(): void {
  write([]);
}
