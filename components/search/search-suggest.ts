"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResults, SearchTrack } from "@/lib/data";
import { pickEntities, type Entities } from "@/lib/suggest";
import { untilOf } from "@/lib/spotify/limit";
import { noteSearchLimit, searchLimitedUntil } from "./search-limit";

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
const NO_ENTITIES: Entities = { artist: null, albums: [] };

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
export function useSuggest(text: string): { items: SearchTrack[]; entities: Entities; loading: boolean } {
  const q = text.trim();
  const [fetched, setFetched] = useState<{ q: string; items: SearchTrack[]; entities: Entities }>({
    q: "",
    items: EMPTY,
    entities: NO_ENTITIES,
  });
  const [loading, setLoading] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (q.length < MIN_CHARS) return;

    const mine = ++run.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      // already known to be refused: the panel says so, and nothing is asked
      if (searchLimitedUntil()) return;
      setLoading(true);
      try {
        const res = await fetch(
          // one request for all three kinds: Spotify takes a list, so naming an artist or an album costs nothing extra
          `/api/spotify/search?q=${encodeURIComponent(q)}&type=track,artist,album&limit=${SUGGEST_LIMIT}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (mine !== run.current) return;
        if (res.status === 429) {
          const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
          if (body.retryAfterSec) noteSearchLimit(untilOf(body.retryAfterSec));
        }
        const data = res.ok ? ((await res.json()) as Partial<SearchResults>) : {};
        setFetched({
          q,
          items: (data.tracks ?? EMPTY).slice(0, SUGGEST_LIMIT),
          entities: pickEntities(q, data.artists ?? [], data.albums ?? []),
        });
      } catch {
        if (mine === run.current) setFetched({ q, items: EMPTY, entities: NO_ENTITIES });
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
  const current = q && fetched.q === q;
  const items = current ? fetched.items : EMPTY;
  const entities = current ? fetched.entities : NO_ENTITIES;
  const waiting = q.length >= MIN_CHARS && (loading || fetched.q !== q);
  return { items, entities, loading: waiting };
}
