"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether Spotify is refusing searches right now, and until when.
 *
 * Held outside React so the results page and the suggestion panel — which fetch
 * on their own timers — agree on it, and so neither asks again while it lasts:
 * the server already fails these calls without touching Spotify, but a request
 * per keystroke is still a request per keystroke.
 */
let until = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** The moment it lifts, or 0 when it is not limited (an expired limit reads as none). */
export function searchLimitedUntil(): number {
  return until > Date.now() ? until : 0;
}

export function noteSearchLimit(at: number) {
  until = at;
  notify();
  // lifting is an event too: the notice should go away by itself
  const wait = at - Date.now() + 50;
  if (wait > 0 && wait < 2 ** 31 - 1) setTimeout(notify, wait);
}

export function useSearchLimit(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    searchLimitedUntil,
    () => 0,
  );
}
