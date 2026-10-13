"use client";

import { usePathname } from "next/navigation";
import { ActionBar } from "./action-bar";
import { NowPlayingPanel } from "./now-playing-panel";
import { RightRail } from "./right-rail";
import { SiteHeader } from "./site-header";
import { useRecordListening } from "./player/use-listening";
import { TagSpace } from "./tag-space";
import { Ticker } from "./ticker";
import { TagFilter } from "./station/tag-filter";
import { LyricsPanel } from "./lyrics/lyrics-panel";
import { useLyricsView } from "./lyrics/lyrics-view";

/**
 * Everything that is not the page.
 *
 * This lives in the root layout, so navigating only ever swaps the middle
 * column. The Now Playing column is mounted once for the session: it keeps its
 * position, its scroll and its state across every route, and the Spotify player
 * it talks to is never torn down — the behaviour every streaming app has, where
 * the transport is independent of whatever page you are reading.
 *
 * The grid takes one of two shapes, as the Figma frames define. On home the
 * action bar belongs to the middle column and the editorial rail runs the full
 * height beside it; everywhere else the bar spans both columns and the rail slot
 * drops below it, holding the station's tag filters.
 *
 * It is a CSS grid rather than nested flex rows so the action bar keeps its
 * place in the tree across that switch — moving it between containers would
 * unmount the search field and steal focus on the keystroke that triggers it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const home = pathname === "/";
  const station = pathname.startsWith("/station");
  /** screens that own the whole width: nothing in the rail slot would earn it */
  const railless =
    pathname.startsWith("/mypage") ||
    pathname.startsWith("/playlist") ||
    /* the rail is what sent you to these three: showing its block beside the
       screen it opens would offer the same button twice */
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/editors-pick") ||
    pathname.startsWith("/weekly-artist");
  const rail = !railless;
  /**
   * Lyrics take a column to the left of the page, next to the player they
   * belong to, and stand in for the rail while they are up: two 330px columns
   * would leave the page itself too narrow to read.
   */
  const { open: lyricsOpen } = useLyricsView();

  /**
   * Mounted here, once, because it writes rather than reads: a second copy
   * would book every second of playback twice.
   */
  useRecordListening();

  return (
    /*
      Home has a floor, the height of the Figma frame it was drawn in. Its
      blocks size themselves to the window and show what fits, which works
      until the window is shorter than the design: the rail's three blocks stop
      shrinking at their own minimums and the last one was cut off with no way
      to reach it. Below the floor the shell stops shrinking and the document
      scrolls instead, the same bargain min-w already makes sideways.

      Only home, because every other screen already scrolls its own column —
      a floor there would put a scrolling list inside a scrolling page.
    */
    <main
      className={`flex h-screen min-w-[1512px] flex-col overflow-hidden bg-shell p-[20px] ${
        home ? "min-h-[982px]" : ""
      }`}
    >
      <Ticker />
      <div className="h-[8px] shrink-0" aria-hidden />
      <SiteHeader />

      <div className="flex min-h-0 flex-1">
        {/* mounted once: never remounted by navigation */}
        <div className="h-full w-[263px] shrink-0">
          <NowPlayingPanel />
        </div>

        <div
          className="grid min-h-0 min-w-0 flex-1"
          style={{
            gridTemplateColumns: lyricsOpen
              ? "330px minmax(0, 1fr)"
              : rail
                ? "minmax(0, 1fr) 330px"
                : "minmax(0, 1fr)",
            gridTemplateRows: "76px minmax(0, 1fr)",
          }}
        >
          <div
            className="min-w-0"
            style={{
              gridColumn: lyricsOpen
                ? "1 / 3"
                : home || railless
                  ? "1 / 2"
                  : "1 / 3",
              gridRow: "1 / 2",
            }}
          >
            <ActionBar />
          </div>

          {/*
            Home is sized to the window and does not scroll: its blocks measure
            themselves and show what fits, handing the rest to /history. Every
            other screen is as long as its content and scrolls here — one
            surface, never a list scrolling inside a scrolling page.
          */}
          <div
            className={
              home
                ? "min-h-0 min-w-0 overflow-hidden"
                : "scroll-y scroll-y-ink min-h-0 min-w-0"
            }
            style={{
              gridColumn: lyricsOpen ? "2 / 3" : "1 / 2",
              gridRow: "2 / 3",
            }}
          >
            <div className={`flex flex-col ${home ? "h-full" : "min-h-full"}`}>
              {children}
            </div>
          </div>

          {lyricsOpen && (
            <div
              className="min-h-0 overflow-hidden"
              style={{ gridColumn: "1 / 2", gridRow: "2 / 3" }}
            >
              <LyricsPanel />
            </div>
          )}

          {rail && !lyricsOpen && (
            <div
              className="min-h-0 overflow-hidden"
              style={{ gridColumn: "2 / 3", gridRow: home ? "1 / 3" : "2 / 3" }}
            >
              {home ? <RightRail /> : station ? <TagFilter /> : <TagSpace />}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
