/**
 * Tracks the listener marked with the heart.
 *
 * Kept in the browser, like the listening time beside it. Saving to Spotify's
 * own library would need `user-library-modify`, and adding a scope invalidates
 * every grant already issued — every registered account would have to
 * reconnect before the heart worked once. That is a steep price for a button,
 * and this way the heart answers instantly instead of waiting on a throttled
 * round trip.
 *
 * The whole row is stored, not just the id: 마이페이지 has to render the list,
 * and looking fifty ids back up through Spotify to show what the listener
 * already saw once is a lot of requests for text we had in hand.
 */

const KEY = "superlike:likes:v1";

export type LikedTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
  /** epoch ms, so the list can be shown newest first */
  at: number;
};

/**
 * Module state as the store's cache.
 *
 * `useSyncExternalStore` requires a snapshot that only changes when the data
 * does. Rebuilding the array on every read would hand React a new identity
 * each time it asked and spin, so the sorted list is built on write and read
 * from here in between.
 */
let byId: Record<string, LikedTrack> | null = null;
let list: LikedTrack[] = [];
const listeners = new Set<() => void>();

const EMPTY: LikedTrack[] = [];

function valid(v: unknown): v is LikedTrack {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.uri === "string" &&
    typeof t.title === "string" &&
    typeof t.artist === "string" &&
    typeof t.durationMs === "number" &&
    typeof t.at === "number"
  );
}

function read(): Record<string, LikedTrack> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, LikedTrack> = {};
    for (const [id, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (valid(row)) out[id] = row;
    }
    return out;
  } catch {
    // private browsing, a full quota, or something else's key in our slot
    return {};
  }
}

/** Newest first: the list reads as a history of what was liked, not an index. */
function rebuild(map: Record<string, LikedTrack>): void {
  list = Object.values(map).sort((a, b) => b.at - a.at);
}

/**
 * A stamp that always moves forward, even inside one millisecond.
 *
 * `Date.now()` alone was not an ordering key: two likes in the same
 * millisecond compare equal, and a stable sort then keeps them in insertion
 * order — which is oldest first, the opposite of what the list promises.
 * Measured in the store's own test before it could reach 마이페이지.
 */
let lastAt = 0;
function stamp(): number {
  lastAt = Math.max(Date.now(), lastAt + 1);
  return lastAt;
}

function ensure(): Record<string, LikedTrack> {
  if (byId === null) {
    byId = read();
    rebuild(byId);
    // a reload must not hand out stamps the stored rows already used
    for (const row of list) lastAt = Math.max(lastAt, row.at);
  }
  return byId;
}

function emit(): void {
  for (const fn of listeners) fn();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  /** another tab on the same browser is the same listener */
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    byId = null;
    ensure();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function snapshot(): LikedTrack[] {
  ensure();
  return list;
}

/** Nothing liked, as far as a server that cannot see this browser is aware. */
export function serverSnapshot(): LikedTrack[] {
  return EMPTY;
}

export function isLiked(id: string | null | undefined): boolean {
  if (!id) return false;
  return ensure()[id] !== undefined;
}

function persist(map: Record<string, LikedTrack>): void {
  rebuild(map);
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // the heart still holds for this session even if it cannot be kept
  }
  emit();
}

/** Marks or unmarks one track. Returns whether it is liked afterwards. */
export function toggle(track: Omit<LikedTrack, "at">): boolean {
  const map = ensure();
  if (map[track.id]) {
    delete map[track.id];
    persist(map);
    return false;
  }
  map[track.id] = { ...track, at: stamp() };
  persist(map);
  return true;
}

/** Used by 마이페이지 to clear the list; harmless when it is already empty. */
export function clear(): void {
  byId = {};
  persist(byId);
}
