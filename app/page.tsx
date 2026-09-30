import { Ticker } from "@/components/ticker";
import { SiteHeader } from "@/components/site-header";
import { NowPlayingPanel } from "@/components/now-playing-panel";
import { DiscoverColumn } from "@/components/discover-column";
import { RightRail } from "@/components/right-rail";

/**
 * Superlike home.
 *
 * Mirrors the Figma frame "Superlike — Home / Desktop" (1512×982): blocks sit
 * flush against each other, with a single 8px gap under the ticker. Column
 * widths (263 / fluid / 330) come straight from the file — the middle column
 * takes whatever the two fixed rails leave, which is 879px at 1512.
 *
 * The layout holds its shape at any viewport — narrower than the design width
 * it scrolls sideways rather than reflowing, so opening devtools (or any other
 * panel that steals width) never rearranges the design.
 *
 * Ticker and header are pinned, and so is the Now Playing column — it takes the
 * exact height left under the header, so the player never scrolls out of reach.
 * Only the Discover column and the rail scroll.
 */
export default function Home() {
  return (
    <main className="flex h-screen min-w-[1512px] flex-col overflow-hidden bg-shell p-[20px]">
      <Ticker />
      <div className="h-[8px] shrink-0" aria-hidden />
      <SiteHeader />

      <div className="flex min-h-0 flex-1">
        {/* pinned: fills the height under the header, scrolls nothing */}
        <div className="h-full w-[263px] shrink-0">
          <NowPlayingPanel />
        </div>

        <div className="scroll-y scroll-y-ink min-h-0 min-w-0 flex-1">
          <div className="flex h-full min-h-[820px]">
            <DiscoverColumn />

            <div className="w-[330px] shrink-0">
              <RightRail />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
