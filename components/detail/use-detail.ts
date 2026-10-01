"use client";

import { useEffect, useState } from "react";

type State<T> = { data: T | null; loading: boolean; error: string | null };
type Held<T> = State<T> & { path: string };

const pending = <T,>(path: string): Held<T> => ({
  path,
  data: null,
  loading: true,
  error: null,
});

/**
 * Fetches one detail screen's payload.
 *
 * A stale response must never land on a newer screen, so each run is tagged and
 * only the newest writes — the same guard the search field uses. Clicking
 * through three artists quickly otherwise ends on whichever request happened to
 * finish last.
 */
export function useDetail<T>(path: string): State<T> {
  const [held, setHeld] = useState<Held<T>>(() => pending<T>(path));
  // derived, so switching screens shows the loading state without an effect
  // reaching back into React to announce it
  const state: State<T> = held.path === path ? held : pending<T>(path);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (!live) return;
        if (!res.ok) {
          setHeld({
            path,
            data: null,
            loading: false,
            error:
              res.status === 401
                ? "Spotify를 연결해 주세요"
                : res.status === 404
                  ? "찾을 수 없습니다"
                  : "불러오지 못했습니다",
          });
          return;
        }
        setHeld({ path, data: (await res.json()) as T, loading: false, error: null });
      } catch {
        if (live) setHeld({ path, data: null, loading: false, error: "불러오지 못했습니다" });
      }
    })();

    return () => {
      live = false;
    };
  }, [path]);

  return state;
}
