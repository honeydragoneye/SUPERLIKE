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
 * One request for what several parts of a screen read.
 *
 * The artist screen and the column beside it both need the same artist, and
 * the artist endpoint is three Spotify calls and two Last.fm ones: asking twice
 * would double the rate limit it spends. Requests for the same path made
 * within a few seconds share one answer.
 */
const SHARE_MS = 5_000;
const inFlight = new Map<string, { at: number; answer: Promise<{ status: number; body: unknown }> }>();

function shared(path: string): Promise<{ status: number; body: unknown }> {
  const hit = inFlight.get(path);
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.answer;
  const answer = fetch(path, { cache: "no-store" }).then(async (res) => ({
    status: res.ok ? 200 : res.status,
    body: res.ok ? await res.json() : null,
  }));
  inFlight.set(path, { at: Date.now(), answer });
  return answer;
}

const NOTHING: State<never> = { data: null, loading: false, error: null };

/**
 * Fetches one detail screen's payload. `null` is "not yet": a part of a screen
 * that needs something another request returns waits with it.
 *
 * A stale response must never land on a newer screen, so each run is tagged and
 * only the newest writes — the same guard the search field uses. Clicking
 * through three artists quickly otherwise ends on whichever request happened to
 * finish last.
 */
export function useDetail<T>(path: string | null): State<T> {
  const [held, setHeld] = useState<Held<T>>(() => pending<T>(path ?? ""));
  // derived, so switching screens shows the loading state without an effect
  // reaching back into React to announce it
  const state: State<T> = path === null ? NOTHING : held.path === path ? held : pending<T>(path);

  useEffect(() => {
    if (path === null) return;
    let live = true;

    (async () => {
      try {
        const { status, body } = await shared(path);
        if (!live) return;
        if (status !== 200) {
          setHeld({
            path,
            data: null,
            loading: false,
            error:
              status === 401
                ? "Spotify를 연결해 주세요"
                : status === 404
                  ? "찾을 수 없습니다"
                  : "불러오지 못했습니다",
          });
          return;
        }
        setHeld({ path, data: body as T, loading: false, error: null });
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
