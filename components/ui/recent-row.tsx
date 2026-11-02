"use client";

import Image from "next/image";
import type { RecentTrack } from "@/lib/data";
import { clock } from "@/lib/time";
import { RelativeTime } from "./relative-time";
import { Icon } from "./icon";
import { LoadingDots } from "./loading-dots";
import { TrackMore } from "./more-menu";

/** One entry in 최근 재생 목록: order, artwork, title/artist, when, length. */
export function RecentRow({
  track,
  onPlay,
  onStation,
  stationBusy = false,
  stationBlocked = false,
  plays,
}: {
  track: RecentTrack;
  onPlay?: (uri: string) => void;
  onStation?: (track: RecentTrack) => void;
  /** a station is being built from THIS row, which is the only one that says so */
  stationBusy?: boolean;
  /** one is being built from another row: this button looks as it did and ignores clicks */
  stationBlocked?: boolean;
  /** times played this period; shown instead of the timestamp when given */
  plays?: number;
}) {
  const playable = Boolean(track.uri && onPlay);

  return (
    /* shrink-0 is load-bearing: the scroll container is itself the flex column,
       so without it flex squeezes fifty rows into the container's height and
       there is no overflow left to scroll */
    <li className="group relative shrink-0 rule-b">
      <button
        type="button"
        disabled={!playable}
        onClick={() => playable && onPlay?.(track.uri)}
        className="flex h-[46px] w-full items-center gap-[12px] text-left enabled:cursor-pointer disabled:cursor-default"
      >
        <span className="tnum w-[32px] shrink-0 text-[18px] font-black tracking-[-0.5px]">
          {track.index}
        </span>

        <span className="relative size-[32px] shrink-0 overflow-hidden rounded-[4px]">
          {track.artwork ? (
            <Image
              src={track.artwork}
              alt=""
              fill
              sizes="32px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <Icon name="chart-art" size={32} />
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[13px]">{track.title}</span>
          <span className="truncate text-[9px] tracking-[0.5px]">{track.artist}</span>
        </span>

        {/* a ranking answers "how often", a log answers "when" — the column is
            the same width either way so the rows stay aligned between them */}
        <span className="tnum w-[72px] shrink-0 text-right text-[10px]">
          {plays === undefined ? <RelativeTime iso={track.playedAt} /> : `${plays}회`}
        </span>
        <span className="tnum w-[40px] shrink-0 text-right text-[10px]">
          {clock(track.durationMs)}
        </span>
        {/* room for the ··· below, on the 40px the TIME column used to end on */}
        <span className="w-[40px] shrink-0" />
      </button>

      {track.uri.startsWith("spotify:track:") && (
        <TrackMore
          className="absolute right-[8px] top-1/2 -translate-y-1/2"
          track={{
            id: track.uri.slice(14),
            uri: track.uri,
            title: track.title,
            artist: track.artist,
            artwork: track.artwork,
            durationMs: track.durationMs,
          }}
        />
      )}

      {/* clears the PLAYED (72), TIME (40) and ··· (40) columns and the 12px gaps
          between them, so it never sits on top of any */}
      {onStation && track.uri && (
        <button
          type="button"
          onClick={() => {
            if (!stationBlocked) onStation(track);
          }}
          disabled={stationBusy}
          aria-disabled={stationBlocked || undefined}
          title={
            stationBusy
              ? "스테이션 구성 중…"
              : `${track.title} 기준으로 스테이션 시작`
          }
          className={`absolute right-[188px] top-1/2 flex -translate-y-1/2 items-center gap-[5px] rounded-pill bg-accent px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-paper-solid opacity-0 transition-[opacity,background-color] group-hover:opacity-100 disabled:opacity-100 ${stationBlocked ? "cursor-default" : "enabled:hover:bg-ink"}`}
        >
          {stationBusy ? (
            <>
              구성 중
              <LoadingDots size={3} label="스테이션 구성 중" />
            </>
          ) : (
            "STATION"
          )}
        </button>
      )}
    </li>
  );
}
