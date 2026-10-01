"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchTrack } from "@/lib/data";

/** Suggestions are a glance, not a page: six rows fit under the field. */
export const SUGGEST_LIMIT = 6;

/** Typing is faster than the API; wait for a pause before spending a request. */
const DEBOUNCE_MS = 250;

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
    if (!q) return;

    const mine = ++run.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(q)}&type=track&limit=${SUGGEST_LIMIT}`,
          { cache: "no-store" },
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

    return () => clearTimeout(timer);
  }, [q]);

  // only answers for the query being asked about
  const items = q && fetched.q === q ? fetched.items : EMPTY;
  return { items, loading: Boolean(q) && (loading || fetched.q !== q) };
}
