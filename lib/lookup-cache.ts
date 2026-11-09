/**
 * What the browser has already worked out, kept across reloads.
 *
 * Finding a song on Spotify costs a few searches, and Spotify limits how many an app may make, so a song found
 * once is not searched for again. A found song is trusted for a month; "not found" only for ten minutes, because
 * the search can fail for reasons that pass. The newest 300 are kept (the oldest leave first), written to
 * localStorage a moment after the last change, and read once. Everything here survives a blocked or full
 * localStorage by simply staying in memory.
 */
export type CacheRow<T> = { at: number; v: T | null };

type Options = { max?: number; hitTtl?: number; missTtl?: number; now?: () => number; flushMs?: number };

export function createLookupCache<T>(storageKey: string, options: Options = {}) {
  const max = options.max ?? 300;
  const hitTtl = options.hitTtl ?? 30 * 86_400_000;
  const missTtl = options.missTtl ?? 10 * 60_000;
  const now = options.now ?? Date.now;
  const flushMs = options.flushMs ?? 600;

  let store: Map<string, CacheRow<T>> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fresh = (row: CacheRow<T>) => now() - row.at < (row.v ? hitTtl : missTtl);

  function load(): Map<string, CacheRow<T>> {
    if (store) return store;
    store = new Map();
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Record<string, CacheRow<T>>) : null;
      if (parsed && typeof parsed === "object") {
        for (const [k, row] of Object.entries(parsed)) {
          if (row && typeof row.at === "number" && fresh(row)) store.set(k, row);
        }
      }
    } catch {
      // nothing readable: start empty
    }
    return store;
  }

  function flush(): void {
    timer = null;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(load())));
    } catch {
      // full or blocked: the memory copy still serves this visit
    }
  }
  const later = () => {
    if (timer === null) timer = setTimeout(flush, flushMs);
  };

  return {
    /** The value, `null` for a remembered "not found", or `undefined` when nothing (fresh) is known. */
    peek(key: string): T | null | undefined {
      const s = load();
      const row = s.get(key);
      if (!row) return undefined;
      if (!fresh(row)) {
        s.delete(key);
        return undefined;
      }
      return row.v;
    },
    remember(key: string, v: T | null): void {
      const s = load();
      s.delete(key);
      s.set(key, { at: now(), v });
      while (s.size > max) s.delete(s.keys().next().value as string);
      later();
    },
    forget(key: string): void {
      if (load().delete(key)) later();
    },
    size: () => load().size,
    flush,
  };
}
