"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { SEARCH_PAGE, type SearchResults } from "@/lib/data";

export type SearchTab = "track" | "album" | "artist" | "playlist";

const EMPTY: SearchResults = {
  query: "",
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
};

/** Which array of `SearchResults` a tab reads from. */
const LIST: Record<SearchTab, "tracks" | "albums" | "artists" | "playlists"> = {
  track: "tracks",
  album: "albums",
  artist: "artists",
  playlist: "playlists",
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
  /** fetches the next page of the tab on screen; a no-op when there is none */
  loadMore: () => void;
  loadingMore: boolean;
  /** false once Spotify has run out, so the list stops asking */
  hasMore: boolean;
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

  /**
   * Whether each tab has more to give, tracked per tab because they run out
   * separately — a query can have fifty tracks and four artists.
   */
  const [more, setMore] = useState<Record<SearchTab, boolean>>({
    track: true,
    album: true,
    artist: true,
    playlist: true,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  /** guards against a second page starting before the first has landed */
  const pagingRef = useRef(false);

  /**
   * Mirrored in an effect rather than read through the closure, so `loadMore`
   * depends on the query and the tab alone. Closing over the results and the
   * per-tab flags gave it a new identity on every page it fetched, which the
   * compiler could not reconcile with the dependencies written by hand.
   */
  const fetchedRef = useRef(fetched);
  const moreRef = useRef(more);
  useEffect(() => {
    fetchedRef.current = fetched;
  }, [fetched]);
  useEffect(() => {
    moreRef.current = more;
  }, [more]);

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
        const page = (await res.json()) as SearchResults;
        setFetched(page);
        setMore({
          track: page.tracks.length >= SEARCH_PAGE,
          album: page.albums.length >= SEARCH_PAGE,
          artist: page.artists.length >= SEARCH_PAGE,
          playlist: page.playlists.length >= SEARCH_PAGE,
        });
        setError(null);
      } catch {
        if (run === runRef.current) setError("검색에 실패했습니다");
      } finally {
        if (run === runRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q]);

  /**
   * The next page of whichever tab is on screen.
   *
   * Only that one type is asked for: the first search covers all four because
   * one request can, but a scroll is about the list being read, and a quarter
   * of the payload is a quarter of the catalogue text to parse. Requests are
   * one at a time and stop for good once a short page comes back — this app
   * has been rate-limited into a seven-hour lockout before, and an endless
   * scroll is exactly the shape that did it.
   */
  const loadMore = () => {
    if (!q || pagingRef.current || !moreRef.current[tab]) return;
    const key = LIST[tab];
    const have = fetchedRef.current[key].length;
    if (have === 0) return;

    pagingRef.current = true;
    setLoadingMore(true);
    const run = runRef.current;

    void (async () => {
      try {
        const res = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(q)}&type=${tab}&offset=${have}`,
          { cache: "no-store" },
        );
        // the query moved on while this was in flight
        if (run !== runRef.current) return;
        if (!res.ok) {
          // including a 429: asking again is what deepens a lockout
          setMore((m) => ({ ...m, [tab]: false }));
          return;
        }
        const page = (await res.json()) as SearchResults;
        if (run !== runRef.current) return;
        const next = page[key];
        setFetched((prev) => {
          const seen = new Set(prev[key].map((item) => item.id));
          // Spotify can repeat an item across offsets; a duplicate key would
          // make React treat two different rows as one
          const added = next.filter((item) => !seen.has(item.id));
          return { ...prev, [key]: [...prev[key], ...added] };
        });
        if (next.length < SEARCH_PAGE) setMore((m) => ({ ...m, [tab]: false }));
      } catch {
        if (run === runRef.current) setMore((m) => ({ ...m, [tab]: false }));
      } finally {
        pagingRef.current = false;
        if (run === runRef.current) setLoadingMore(false);
      }
    })();
  };

  /**
   * Not hand-memoised: React Compiler is on for this project and does it, and
   * a dependency list written beside it only gave the two something to
   * disagree about — which made the compiler skip the component entirely.
   */
  const value = ((): Ctx => {
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
      loadMore,
      loadingMore,
      hasMore: Boolean(q) && more[tab],
    };
  })();

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): Ctx {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside <SearchProvider>");
  return ctx;
}
