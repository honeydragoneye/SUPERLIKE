"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlaysThisWeek } from "./player/use-listening";
import { RecentList } from "./ui/recent-list";
import { useSpotify } from "./player/spotify-provider";
import { useHydrated } from "./ui/use-hydrated";

const RANGES = ["TODAY", "THIS WEEK"] as const;
type Range = (typeof RANGES)[number];

/** Midnight today, local — a day should end where the listener is. */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Monday 00:00 local, the week Korean calendars start on — the same boundary
 * the listening figure in the action bar counts from.
 */
function startOfWeek(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // getDay() is Sunday-first, so Sunday counts back six days rather than none
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/**
 * The user's own listening history. Falls back to placeholder rows until
 * Spotify is connected so the block never collapses during design review.
 */
export function RecentlyPlayed() {
  const { connected: session, recent, recentLive: live, recentError } = useSpotify();
  /**
   * The session is the browser's to know, so this screen renders what the
   * server rendered until React has finished comparing the two. Gated here
   * rather than in the provider, which sits outside the Suspense boundary and
   * opens before this subtree is hydrated.
   */
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const recentLive = hydrated && live;

  const [range, setRange] = useState<Range>("THIS WEEK");
  // no stand-in rows: an invented track flashing before the real history lands
  // is worse than an empty list for a beat
  const all = recentLive ? recent : [];
  /**
   * Spotify timestamps every play, so the range is a filter over what it
   * already sent rather than another request. Its history ends at fifty plays,
   * though, so THIS WEEK means "within the last fifty, this week" — the status
   * line below says so when the two could differ.
   */
  const since = range === "TODAY" ? startOfToday() : startOfWeek();
  const within = all.filter((t) => new Date(t.playedAt).getTime() >= since);

  const plays = usePlaysThisWeek();
  const ranking = range === "THIS WEEK";

  /**
   * THIS WEEK is a ranking, so each track appears once.
   *
   * Spotify's history has a row per play, which is right for a log and wrong
   * for a tally — five plays of one song would otherwise be five rows all
   * claiming "5회". The newest play of each is kept, so the row still points
   * at something real.
   */
  const tracks = ranking
    ? (() => {
        const first = new Map<string, (typeof within)[number]>();
        for (const t of within) if (!first.has(t.uri)) first.set(t.uri, t);
        const idOf = (uri: string) => uri.split(":").pop() ?? "";
        return [...first.values()].sort(
          (a, b) => (plays[idOf(b.uri)] ?? 0) - (plays[idOf(a.uri)] ?? 0),
        );
      })()
    : within;

  const status = recentError
    ? recentError
    : !connected
      ? "Spotify를 연결해 주세요"
      : !all.length
        ? "불러오는 중…"
        : tracks.length
          ? `${tracks.length} TRACKS`
          : range === "TODAY"
            ? "오늘 재생한 곡이 없습니다"
            : "이번 주 재생한 곡이 없습니다";

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
          {RANGES.map((option) => {
            const active = option === range;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                title={option === "TODAY" ? "오늘 재생한 곡" : "이번 주 재생한 곡"}
                onClick={() => setRange(option)}
                className={`shrink-0 cursor-pointer whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors rule ${
                  active ? "bg-ink text-paper" : "bg-gold text-ink hover:bg-pink"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center gap-[12px] overflow-hidden pb-[2px] text-[8px] tracking-[0.8px]">
        <span className="w-[32px] shrink-0">#</span>
        <span className="w-[32px] shrink-0" />
        <span className="min-w-px flex-1">TRACK</span>
        <span className="w-[72px] shrink-0 text-right">{ranking ? "PLAYS" : "PLAYED"}</span>
        <span className="w-[40px] shrink-0 text-right">TIME</span>
      </div>

      {/* the page behind it still does not scroll; this list does, so a ranking
          can be read past the fold instead of being cut at whatever fits */}
      <div className="scroll-y scroll-y-ink min-h-0 w-full flex-1">
        <RecentList tracks={tracks} plays={ranking ? plays : undefined} />
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
