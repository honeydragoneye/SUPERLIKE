"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import type { SearchResults } from "@/lib/data";

export type SearchTab = "track" | "album" | "artist" | "playlist";

const EMPTY: SearchResults = {
  query: "",
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
};

type Ctx = {
  /** the query, which lives in the URL as `?q=` */
  query: string;
  loading: boolean;
  error: string | null;
  results: SearchResults;
  tab: SearchTab;
  setTab: (t: SearchTab) => void;
  total: number;
};

const SearchContext = createContext<Ctx | null>(null);

/** Typing is faster than the API; wait for a pause before spending a request. */
const DEBOUNCE_MS = 400;

export function SearchProvider({ children }: { children: React.ReactNode }) {
  // the URL is the query's home: shareable, bookmarkable, and restored by the
  // back button. The field holds only the text it is mid-way through typing.
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const [fetched, setFetched] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SearchTab>("track");

  /** only the newest request may write results */
  const runRef = useRef(0);

  const q = query.trim();
  // derived, so clearing the field needs no synchronous setState in the effect
  const results = q ? fetched : EMPTY;

  useEffect(() => {
    if (!q) return;

    const run = ++runRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        if (run !== runRef.current) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          setError(
            res.status === 401
              ? "Spotify를 연결해 주세요"
              : // a lockout has a duration, and the listener deserves the number
                (res.status === 429 && body.detail) || "검색에 실패했습니다",
          );
          setFetched(EMPTY);
          return;
        }
        setFetched((await res.json()) as SearchResults);
        setError(null);
      } catch {
        if (run === runRef.current) setError("검색에 실패했습니다");
      } finally {
        if (run === runRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q]);

  const value = useMemo<Ctx>(() => {
    const total =
      results.tracks.length +
      results.albums.length +
      results.artists.length +
      results.playlists.length;
    return {
      query,
      loading,
      error,
      results,
      tab,
      setTab,
      total,
    };
  }, [query, loading, error, results, tab, setTab]);

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): Ctx {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside <SearchProvider>");
  return ctx;
}
