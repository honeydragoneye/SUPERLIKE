"use client";

import { TintedIcon } from "@/components/ui/icon";
import { useSearch } from "./search-provider";

/** Sits in the action bar, where the quality pills used to be. */
export function SearchField() {
  const { query, setQuery, clear, loading } = useSearch();

  return (
    <div className="flex h-[44px] w-[416px] shrink-0 items-center gap-[10px] rounded-pill bg-paper pl-[14px] pr-[8px] rule">
      <span className="text-ink">
        <TintedIcon name="search" size={16} />
      </span>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="곡, 아티스트 검색"
        aria-label="검색"
        className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={clear}
          className="shrink-0 rounded-pill bg-ink px-[10px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
        >
          {loading ? "검색 중" : "지우기"}
        </button>
      ) : (
        <span className="shrink-0 rounded-pill bg-ink px-[10px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid">
          ENTER
        </span>
      )}
    </div>
  );
}
