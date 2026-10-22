"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ActionBar } from "./action-bar";
import { NowPlayingPanel } from "./now-playing-panel";
import { RightRail } from "./right-rail";
import { SiteHeader } from "./site-header";
import { useRecordListening } from "./player/use-listening";
import { useAccountSync } from "./player/use-account-sync";
import { TagSpace } from "./tag-space";
import { ArtistRail } from "./rail/artist-rail";
import { AlbumRail } from "./rail/album-rail";
import { SearchRail } from "./rail/search-rail";
import { Ticker } from "./ticker";
import { TagFilter } from "./station/tag-filter";
import { ChatPanel } from "./chat/chat-panel";
import { ChatResizer } from "./chat/chat-resizer";
import { useChat } from "./chat/chat-provider";

/** The player bar along the bottom edge: what the rail and the page leave clear there, in px. */
const PLAYER = 72;
/** The action bar's height, which the rail beside a full-width bar sticks under. */
const BAR = 76;

/**
 * Keeps a pinned column exactly as tall as what the window shows of it.
 *
 * The chat is the one column whose foot must never be out of sight: the input
 * is at the bottom. At the top of the page the column starts below the header,
 * so a height worked out from the top edge would leave its last 120px under the
 * player. This measures where the column is now and gives it the room from
 * there to the player — shorter at first, longer as the header scrolls off —
 * so the input always sits just above the player. The messages scroll inside
 * the column already, so only they give way.
 *
 * Written straight to the element, not through React: it changes on every
 * scroll frame.
 */
function useVisibleHeight(ref: React.RefObject<HTMLDivElement | null>, on: boolean, layout: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      el.style.height = `${Math.max(240, window.innerHeight - PLAYER - el.getBoundingClientRect().top)}px`;
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (frame) cancelAnimationFrame(frame);
    };
    // `layout` re-arms it when the chat opens or the page changes under it
  }, [ref, on, layout]);
}

/**
 * Everything that is not the page.
 *
 * This lives in the root layout, so navigating only ever swaps the middle
 * column. The player bar along the bottom is mounted once for the session: it
 * keeps its state across every route, and the Spotify player
 * it talks to is never torn down — the behaviour every streaming app has, where
 * the transport is independent of whatever page you are reading.
 *
 * The window's height is not fixed: the whole page scrolls, the way a long page
 * does anywhere else. Three things stay put while it moves — the action bar at
 * the top, the column beside the page (the editorial rail, the tag filters, the
 * chat) and the player at the bottom — and the column scrolls inside itself
 * when what it holds is taller than the room it has. The ticker and the header
 * go up with the page.
 *
 * The grid takes one of two shapes, as the Figma frames define. On home the
 * action bar belongs to the middle column and the editorial rail runs the full
 * height beside it; everywhere else the bar spans both columns and the rail slot
 * drops below it, holding the station's tag filters.
 *
 * It is a CSS grid rather than nested flex rows so the action bar keeps its
 * place in the tree across that switch — moving it between containers would
 * unmount the search field and steal focus on the keystroke that triggers it.
 * The bar and the rail are grid items that span the rows and sit at the start:
 * `sticky` holds an item inside its own grid area, so an item only one row tall
 * would have nowhere to travel.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const home = pathname === "/";
  const station = pathname.startsWith("/station");
  /** the artist and album screens, and the results, have a column of their own beside them */
  const artistId = pathname.match(/^\/artist\/([^/]+)/)?.[1] ?? null;
  const albumId = pathname.match(/^\/album\/([^/]+)/)?.[1] ?? null;
  const searching = pathname === "/search";
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
  /** The chat takes the rail's column, at the width it was dragged to. */
  const { open: chat, width: chatWidth } = useChat();

  /**
   * Mounted here, once, because it writes rather than reads: a second copy
   * would book every second of playback twice.
   */
  useRecordListening();
  useAccountSync();

  /**
   * The column beside the page, pinned: under the action bar when the bar spans
   * both columns, at the top edge when the rail runs the full height on home.
   * Its height is the room the window leaves it once it has reached that edge,
   * and stays that — so what it holds never resizes while the page scrolls. Before
   * it reaches the edge its lower part is simply under the player.
   */
  const asideTop = home && !chat ? 0 : BAR;
  const sideShown = chat || rail;
  const chatColumn = useRef<HTMLDivElement>(null);
  useVisibleHeight(chatColumn, chat, pathname);

  return (
    <main className="min-w-[1512px] bg-shell pb-[72px]">
      <Ticker />
      <div className="h-[8px]" aria-hidden />
      <SiteHeader />

      <div
        className="grid min-w-0"
        style={{
          gridTemplateColumns: chat
            ? `minmax(0, 1fr) ${chatWidth}px`
            : rail
              ? "minmax(0, 1fr) 330px"
              : "minmax(0, 1fr)",
          gridTemplateRows: "76px auto",
        }}
      >
        {/* pinned to the top edge; it spans the rows so it has the whole page to travel along */}
        <div
          className="sticky z-20 min-w-0 self-start"
          style={{
            top: 0,
            gridColumn: chat ? "1 / 3" : home || railless ? "1 / 2" : "1 / 3",
            gridRow: "1 / 3",
          }}
        >
          <ActionBar />
        </div>

        {/*
          Every screen is as long as its content, and the page scrolls: one
          surface, never a list scrolling inside a scrolling page. The floor is
          what is left of the window under the header and the bar, so a short
          screen still fills it.
        */}
        <div
          className="flex min-h-[calc(100vh-270px)] min-w-0 flex-col"
          style={{ gridColumn: "1 / 2", gridRow: "2 / 3" }}
        >
          {children}
        </div>

        {sideShown && (
          /*
            A frame the size of the page's own row, holding the pinned column.
            The column is taller than that row at first (its foot is under the
            player until the header has gone), and without the frame it would
            stretch the page and leave a scroll with nothing to show. `contain:
            size` makes the frame ignore what is in it, and `overflow: clip` hides
            the overhang without making the frame a scroller — which would stop
            `sticky` from following the window.
          */
          <div
            className="min-h-0 overflow-clip [contain:size]"
            style={{ gridColumn: "2 / 3", gridRow: home && !chat ? "1 / 3" : "2 / 3" }}
          >
            <div
              ref={chat ? chatColumn : undefined}
              className="sticky z-10 min-h-0"
              style={{
                top: asideTop,
                // the chat is measured (see useVisibleHeight); this is its height at the top of the page, for the first paint
                height: `calc(100vh - ${chat ? BAR + 122 + PLAYER : asideTop + PLAYER}px)`,
              }}
            >
              {chat ? (
                <div className="relative h-full">
                  <ChatResizer />
                  <ChatPanel />
                </div>
              ) : home ? (
                <RightRail />
              ) : station ? (
                <TagFilter />
              ) : artistId ? (
                <ArtistRail id={artistId} />
              ) : albumId ? (
                <AlbumRail id={albumId} />
              ) : searching ? (
                <SearchRail />
              ) : (
                <TagSpace />
              )}
            </div>
          </div>
        )}
      </div>

      {/* mounted once: never remounted by navigation; fixed to the foot of the window, edge to edge, so the page scrolls behind it */}
      <div className="fixed inset-x-0 bottom-0 z-30 h-[72px] min-w-[1512px] bg-shell">
        <NowPlayingPanel />
      </div>
    </main>
  );
}
