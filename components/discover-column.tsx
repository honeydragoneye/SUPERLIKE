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
 * Idle it shows the listening history and the user's playlists. A query in the
 * field replaces those with results. Opening the station screen outranks both,
 * because that only ever happens on a deliberate press in Now Playing — and it
 * leaves the query where it is, so closing the station drops the listener back
 * into the results they came from. Typing again hides the station instead of
 * clearing anything (see SearchField).
 *
 * The action bar sits above this column in ContentGrid, so it stays put through
 * all three — and so does everything outside the column.
 */
export function DiscoverColumn() {
  const { active } = useSearch();
  const { open } = useStationView();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {open ? (
        <StationPage />
      ) : active ? (
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
