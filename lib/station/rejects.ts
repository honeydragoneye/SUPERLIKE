/**
 * Tracks the listener said a mood tag got wrong — "이 곡은 우울·슬픔 아님".
 *
 * Kept in the browser, like the likes beside it, and per tag: Silver Bells is
 * not 우울·슬픔, which says nothing about whether it is 경쾌. A rejected track
 * never enters that tag's queue again; every other tag, and a station with no
 * tag, still gets it.
 *
 * Gemini is not told. Its verdicts are cached on the server for every account,
 * and one listener's no is not a fact about the song for the others. Whether
 * these are worth giving the model as counter-examples is a later question,
 * and this list is what it will be measured on.
 *
 * The tag is a plain string rather than MoodKey so the user tags planned next
 * can share the store.
 */

const KEY = "superlike:mood-rejects:v1";

export type RejectedTrack = {
  /** the tag it was rejected under */
  mood: string;
  /** Spotify id: how a track already looked up is recognised */
  id: string;
  /**
   * "name|artist" as Last.fm spelled it, lowercased: how a candidate is
   * recognised before it has been looked up. Both are needed — the ladder
   * judges Last.fm names before it ever asks Spotify, and the same song can
   * reach the queue under a Last.fm spelling the Spotify title does not match.
   */
  lfmKey: string;
  title: string;
  artist: string;
  /** epoch ms */
  at: number;
};

/** What the queue route is told: the keys of one tag's rejects. */
export type RejectedKeys = { ids: string[]; lfm: string[] };

/** Enough of a track to reject it; StationCandidate carries all of it. */
export type RejectTarget = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  lfmKey?: string;
};

const rowKey = (mood: string, id: string) => `${mood}:${id}`;

/** The Last.fm key for a track nobody has a Last.fm spelling of. */
export const lfmKeyOf = (name: string, artist: string) => `${name}|${artist}`.toLowerCase();

/** Cache for useSyncExternalStore, rebuilt on write — see lib/likes. */
let byKey: Record<string, RejectedTrack> | null = null;
let list: RejectedTrack[] = [];
const listeners = new Set<() => void>();

function valid(v: unknown): v is RejectedTrack {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.mood === "string" &&
    typeof t.id === "string" &&
    typeof t.lfmKey === "string" &&
    typeof t.title === "string" &&
    typeof t.artist === "string" &&
    typeof t.at === "number"
  );
}

function read(): Record<string, RejectedTrack> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, RejectedTrack> = {};
    for (const [k, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (valid(row)) out[k] = row;
    }
    return out;
  } catch {
    return {};
  }
}

function ensure(): Record<string, RejectedTrack> {
  if (byKey === null) {
    byKey = read();
    list = Object.values(byKey);
  }
  return byKey;
}

function persist(map: Record<string, RejectedTrack>): void {
  list = Object.values(map);
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // still holds for this session even if it cannot be kept
  }
  for (const fn of listeners) fn();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    byKey = null;
    ensure();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** How many tracks a tag has had rejected — a number, so it is snapshot-stable. */
export function countFor(mood: string | null): number {
  if (mood === null) return 0;
  ensure();
  return list.filter((t) => t.mood === mood).length;
}

export function rejectedFor(mood: string | null): RejectedKeys | undefined {
  if (mood === null) return undefined;
  ensure();
  const rows = list.filter((t) => t.mood === mood);
  if (!rows.length) return undefined;
  return { ids: rows.map((t) => t.id), lfm: rows.map((t) => t.lfmKey) };
}

/** True when this track was rejected under this tag, by either key. */
export function isRejected(
  mood: string | null,
  track: { id: string; lfmKey?: string },
): boolean {
  if (mood === null) return false;
  const map = ensure();
  if (map[rowKey(mood, track.id)]) return true;
  const lfm = track.lfmKey?.toLowerCase();
  return lfm !== undefined && list.some((t) => t.mood === mood && t.lfmKey === lfm);
}

export function reject(row: Omit<RejectedTrack, "at">): void {
  const map = ensure();
  map[rowKey(row.mood, row.id)] = { ...row, lfmKey: row.lfmKey.toLowerCase(), at: Date.now() };
  persist(map);
}

/** 되돌리기: forgets every reject under one tag. */
export function clearMood(mood: string): void {
  const map = ensure();
  for (const [k, row] of Object.entries(map)) if (row.mood === mood) delete map[k];
  persist(map);
}
