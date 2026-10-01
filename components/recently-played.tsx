"use client";

import Link from "next/link";
import { RecentList } from "./ui/recent-list";
import { useRowCapacity } from "./ui/use-row-capacity";
import { useSpotify } from "./player/spotify-provider";

const RANGES = ["TODAY", "THIS WEEK", "ALL"] as const;
const ACTIVE_RANGE = "TODAY";

/** One row: 46px of button plus the 1.5px rule under it. */
const ROW_H = 47.5;

/**
 * The user's own listening history. Falls back to placeholder rows until
 * Spotify is connected so the block never collapses during design review.
 */
export function RecentlyPlayed() {
  const { connected, recent, recentLive, recentError } = useSpotify();
  const { ref, capacity } = useRowCapacity(ROW_H);
  // no stand-in rows: an invented track flashing before the real history lands
  // is worse than an empty list for a beat
  const tracks = recentLive ? recent : [];
  const status = recentError
    ? recentError
    : !connected
      ? "Spotify를 연결해 주세요"
      : tracks.length
        ? `${Math.min(tracks.length, capacity ?? 0)} / ${tracks.length} TRACKS`
        : "불러오는 중…";

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-hidden bg-chart p-[16px]">
      <div className="flex w-full shrink-0 items-center justify-between gap-[10px]">
        <div className="flex shrink-0 flex-col gap-px">
          <h2 className="text-[26px] font-black tracking-[-1px]">최근 재생 목록</h2>
          <p className="whitespace-nowrap text-[8px] tracking-[0.7px]">
            {recentLive ? "MY LIBRARY · SPOTIFY" : "MY LIBRARY"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-[6px]">
          {RANGES.map((range) => {
            const active = range === ACTIVE_RANGE;
            return (
              <button
                key={range}
                type="button"
                aria-pressed={active}
                className={`shrink-0 whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.7px] rule ${
                  active ? "bg-ink text-paper" : "bg-gold text-ink"
                }`}
              >
                {range}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center gap-[12px] overflow-hidden pb-[2px] text-[8px] tracking-[0.8px]">
        <span className="w-[32px] shrink-0">#</span>
        <span className="w-[32px] shrink-0" />
        <span className="min-w-px flex-1">TRACK</span>
        <span className="w-[72px] shrink-0 text-right">PLAYED</span>
        <span className="w-[40px] shrink-0 text-right">TIME</span>
      </div>

      {/* the list ends on the last row that fits whole — home never scrolls,
          so a part-drawn row would simply be a mistake on screen */}
      <div ref={ref} className="min-h-0 w-full flex-1 overflow-hidden">
        <RecentList tracks={capacity === null ? [] : tracks.slice(0, capacity)} />
      </div>

      <div className="flex w-full shrink-0 items-center justify-between gap-[8px] whitespace-nowrap">
        <Link
          href="/history"
          className="flex shrink-0 items-center gap-[10px] rounded-pill bg-ink py-[7px] pl-[14px] pr-[12px]"
        >
          <span className="text-[8px] tracking-[0.8px] text-paper">
            목록 더보기
          </span>
          <span className="text-[11px] text-pink-bright">→</span>
        </Link>
        <p className="tnum shrink-0 text-[9px] tracking-[0.6px]">
          {status}
        </p>
      </div>
    </section>
  );
}
