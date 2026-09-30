"use client";

import { ActionBar } from "./action-bar";
import { RecentlyPlayed } from "./recently-played";
import { MyPlaylist } from "./my-playlist";
import { SearchResults } from "./search/search-results";
import { useSearch } from "./search/search-provider";

/**
 * The middle column has two states.
 *
 * Idle it shows the listening history and the user's playlists; with a query in
 * the field those give way to results, which take the whole column. The action
 * bar — and the search field in it — stays put through both.
 */
export function DiscoverColumn() {
  const { active } = useSearch();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ActionBar />
      {active ? (
        <SearchResults />
      ) : (
        <>
          <RecentlyPlayed />
          <MyPlaylist />
        </>
      )}
    </div>
  );
}
