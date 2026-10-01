"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchTrack } from "@/lib/data";

/** Suggestions are a glance, not a page: six rows fit under the field. */
export const SUGGEST_LIMIT = 6;

/**
 * Typing is faster than the API; wait for a pause before spending a request.
 *
 * Raised from 250ms after a measurement: "harry styles" sent six searches in
 * one go — the panel's and the results page's, each on its own timer — and
 * Spotify answered by rate-limiting the lot, turning a 400ms search into
 * forty-five seconds of waiting out its window.
 */
const DEBOUNCE_MS = 400;

/** One or two letters match half the catalogue; the answer is not worth a call. */
const MIN_CHARS = 2;

const EMPTY: SearchTrack[] = [];

/**
 * Top tracks for what is currently typed, for the panel under the field.
 *
 * Separate from the search page's own fetch: this one follows the keystrokes
 * and is thrown away, that one follows the URL and is the result the listener
 * asked for.
 *
 * An empty query clears by derivation rather than by an effect writing state
 * back into React, and each run is tagged so a slow early request cannot
 * overwrite a later one.
 */
export function useSuggest(text: string): { items: SearchTrack[]; loading: boolean } {
  const q = text.trim();
  const [fetched, setFetched] = useState<{ q: string; items: SearchTrack[] }>({
    q: "",
    items: EMPTY,
  });
  const [loading, setLoading] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (q.length < MIN_CHARS) return;

    const mine = ++run.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(q)}&type=track&limit=${SUGGEST_LIMIT}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (mine !== run.current) return;
        const data = res.ok ? ((await res.json()) as { tracks?: SearchTrack[] }) : {};
        setFetched({ q, items: (data.tracks ?? EMPTY).slice(0, SUGGEST_LIMIT) });
      } catch {
        if (mine === run.current) setFetched({ q, items: EMPTY });
      } finally {
        if (mine === run.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // a superseded request should stop occupying the rate limit as well
      controller.abort();
    };
  }, [q]);

  // only answers for the query being asked about
  const items = q && fetched.q === q ? fetched.items : EMPTY;
  const waiting = q.length >= MIN_CHARS && (loading || fetched.q !== q);
  return { items, loading: waiting };
}
