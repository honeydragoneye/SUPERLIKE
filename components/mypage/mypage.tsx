"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountBanner } from "./account-banner";
import { PlaylistManager } from "./playlist-manager";
import { PlaylistPanel } from "./playlist-panel";
import { RadioManager } from "./radio-manager";
import { RecentlyPlayed } from "@/components/recently-played";
import { FollowCounts, Listeners } from "./side-panels";

/**
 * 마이페이지: the account across the top, the listening history on the left,
 * the people and settings around it on the right.
 *
 * Below the history, the playlists and the radio stations this account keeps
 * can be looked after. 열기 on a playlist shows it in the column on the right,
 * where 함께 듣는 사람 otherwise is. Which one is open lives in the address
 * (`?playlist=`), so it survives a reload and a link can point at it.
 *
 * The panels meet edge to edge and are told apart by 1.5px seams rather than
 * gaps, so the screen reads as one sheet ruled into fields. The seams are
 * borders on the panels themselves — one per shared edge, never one on each
 * side of it, which would double the line exactly where it should be thinnest.
 */
export function Mypage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("playlist");

  const open = useCallback(
    (id: string | null) => router.replace(id ? `${pathname}?playlist=${id}` : pathname, { scroll: false }),
    [router, pathname],
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-card text-on-bright">
      <AccountBanner />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r-[1.5px] border-rule">
          <RecentlyPlayed />
          <PlaylistManager openId={openId} onOpen={open} />
          <RadioManager />
        </div>

        <aside className="flex w-[341px] shrink-0 flex-col">
          <FollowCounts />
          {openId ? <PlaylistPanel key={openId} id={openId} onClose={() => open(null)} /> : <Listeners />}
        </aside>
      </div>
    </div>
  );
}
