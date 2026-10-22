"use client";

import { AccountBanner } from "./account-banner";
import { RecentlyPlayed } from "@/components/recently-played";
import { FollowCounts, Listeners } from "./side-panels";

/**
 * 마이페이지: the account across the top, the listening history on the left,
 * the people and settings around it on the right.
 *
 * The hearted songs and the playlists moved to home, under the taste block.
 *
 * The panels meet edge to edge and are told apart by 1.5px seams rather than
 * gaps, so the screen reads as one sheet ruled into fields. The seams are
 * borders on the panels themselves — one per shared edge, never one on each
 * side of it, which would double the line exactly where it should be thinnest.
 */
export function Mypage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper-solid text-on-bright">
      <AccountBanner />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r-[1.5px] border-ink">
          <RecentlyPlayed />
        </div>

        <aside className="flex w-[341px] shrink-0 flex-col">
          <FollowCounts />
          <Listeners />
        </aside>
      </div>
    </div>
  );
}
