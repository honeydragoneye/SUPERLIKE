"use client";

import { RecentlyPlayed } from "./recently-played";
import { MyPlaylist } from "./my-playlist";
import { SearchResults } from "./search/search-results";
import { useSearch } from "./search/search-provider";
import { StationPage } from "./station/station-page";
import { useStationView } from "./station/station-view";

/**
 * The middle column has three states.
 *
 * Idle it shows the listening history and the user's playlists; opening a
 * station replaces those with the station screen; typing a query beats both,
 * since the field is right there and a search is always the more explicit
 * request. The action bar sits above this column in ContentGrid, so it stays
 * put through all three — and so does everything outside the column.
 */
export function DiscoverColumn() {
  const { active } = useSearch();
  const { open } = useStationView();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {active ? (
        <SearchResults />
      ) : open ? (
        <StationPage />
      ) : (
        <>
          <RecentlyPlayed />
          <MyPlaylist />
        </>
      )}
    </div>
  );
}
