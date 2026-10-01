"use client";

import { ActionBar } from "./action-bar";
import { DiscoverColumn } from "./discover-column";
import { NowPlayingPanel } from "./now-playing-panel";
import { RightRail } from "./right-rail";
import { TagSpace } from "./tag-space";
import { TagFilter } from "./station/tag-filter";
import { useSearch } from "./search/search-provider";
import { useStationView } from "./station/station-view";

/**
 * The 263 / fluid / 330 grid, in the two shapes the Figma frames define.
 *
 * On home the action bar belongs to the middle column and the editorial rail
 * runs the full height beside it. On the station and search screens the bar
 * spans both columns and the rail slot drops below it, because that slot is no
 * longer editorial content — it is where the tag filters will go.
 *
 * This is a CSS grid rather than nested flex rows for one reason: the action
 * bar has to keep its place in the tree across that switch. Moving it between
 * two containers would unmount it, and the search field inside it would lose
 * focus on the very keystroke that triggers the switch.
 */
export function ContentGrid() {
  const { active } = useSearch();
  const { open: stationOpen } = useStationView();
  const wide = active || stationOpen;

  return (
    <div className="flex min-h-0 flex-1">
      {/* pinned: fills the height under the header, scrolls nothing */}
      <div className="h-full w-[263px] shrink-0">
        <NowPlayingPanel />
      </div>

      <div
        className="grid min-h-0 min-w-0 flex-1"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) 330px",
          gridTemplateRows: "76px minmax(0, 1fr)",
        }}
      >
        <div
          className="min-w-0"
          style={{ gridColumn: wide ? "1 / 3" : "1 / 2", gridRow: "1 / 2" }}
        >
          <ActionBar />
        </div>

        <div
          className="scroll-y scroll-y-ink min-h-0 min-w-0"
          style={{ gridColumn: "1 / 2", gridRow: "2 / 3" }}
        >
          <div className="flex h-full min-h-[744px] flex-col">
            <DiscoverColumn />
          </div>
        </div>

        <div
          className="min-h-0 overflow-hidden"
          style={{ gridColumn: "2 / 3", gridRow: wide ? "2 / 3" : "1 / 3" }}
        >
          {!wide ? <RightRail /> : stationOpen ? <TagFilter /> : <TagSpace />}
        </div>
      </div>
    </div>
  );
}
